import { Router } from 'express';
import {
  documentIntentSchema,
  updateDocumentSchema,
  STORAGE_BUCKETS,
  type PropertyDocument,
  type SignedDownload,
  type UploadIntent,
} from '@propittu/shared';
import { auth } from '../auth.js';
import { audit } from '../audit.js';
import { env } from '../env.js';
import { HttpError, must, notFound, ok, uuidParam } from '../errors.js';
import { assertOwnsProperty } from '../ownership.js';
import { countForProperty, enforceLimit, enforceStorage, planOf, requireFeature } from '../plan.js';
import {
  objectPath,
  removeObjects,
  signDownload,
  signUpload,
  SIGNED_UPLOAD_TTL_SECONDS,
  verifyUploaded,
} from '../storage.js';

/**
 * Property documents (§8.3, §20, §21) — same intent/confirm flow as photos.
 * Only `ready` documents are ever listed; a pending row is an upload in
 * flight (or an abandoned one) and is invisible to the user.
 */
export const documentsRouter = Router();

const BUCKET = STORAGE_BUCKETS.documents;

interface DocumentRow extends PropertyDocument {
  storage_path: string;
  upload_status: 'pending' | 'ready';
}

const DOCUMENT_COLUMNS =
  'id, property_id, document_type, file_name, description, status, mime_type, file_size, ' +
  'storage_path, upload_status, created_at';

function toDocument(row: DocumentRow): PropertyDocument {
  return {
    id: row.id,
    property_id: row.property_id,
    document_type: row.document_type,
    file_name: row.file_name,
    description: row.description,
    status: row.status,
    mime_type: row.mime_type,
    file_size: row.file_size,
    created_at: row.created_at,
  };
}

/** Strips path separators and control characters; the name is display-only. */
function cleanFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[/\\\u0000-\u001f\u007f]/g, '_').trim();
  return cleaned.slice(0, 255) || 'document';
}

/* GET /properties/:id/documents — newest first */
documentsRouter.get('/properties/:id/documents', async (req, res) => {
  const { db, accountId } = auth(req);
  const propertyId = uuidParam(req.params.id, 'Property');
  await assertOwnsProperty(db, accountId, propertyId);

  const rows = must<DocumentRow[]>(
    await db
      .from('property_documents')
      .select(DOCUMENT_COLUMNS)
      .eq('property_id', propertyId)
      .eq('account_id', accountId)
      .eq('upload_status', 'ready')
      .order('created_at', { ascending: false }),
  );

  ok(res, rows.map(toDocument));
});

/* POST /properties/:id/documents/intent */
documentsRouter.post('/properties/:id/documents/intent', async (req, res) => {
  const { db, userId, accountId } = auth(req);
  const propertyId = uuidParam(req.params.id, 'Property');
  const input = documentIntentSchema.parse(req.body);
  await assertOwnsProperty(db, accountId, propertyId);

  const plan = planOf(req);
  requireFeature(plan, 'document_upload', 'Document upload');
  const used = await countForProperty(db, 'property_documents', accountId, propertyId);
  enforceLimit(plan, 'max_documents_per_property', used, 1, 'documents per property');
  await enforceStorage(db, plan, accountId, input.file_size);

  const storagePath = objectPath(accountId, propertyId, input.mime_type);
  const row = must<{ id: string }>(
    await db
      .from('property_documents')
      .insert({
        property_id: propertyId,
        account_id: accountId,
        user_id: userId,
        document_type: input.document_type,
        file_name: cleanFileName(input.file_name),
        description: input.description,
        storage_path: storagePath,
        mime_type: input.mime_type,
        file_size: input.file_size,
      })
      .select('id')
      .single(),
  );

  let uploadUrl: string;
  try {
    uploadUrl = await signUpload(db, BUCKET, storagePath);
  } catch (err) {
    await db.from('property_documents').delete().eq('id', row.id);
    throw err;
  }

  const data: UploadIntent = {
    id: row.id,
    upload_url: uploadUrl,
    expires_in: SIGNED_UPLOAD_TTL_SECONDS,
  };
  ok(res, data, 201);
});

/* POST /properties/:id/documents/:documentId/confirm — idempotent */
documentsRouter.post('/properties/:id/documents/:documentId/confirm', async (req, res) => {
  const { db, accountId } = auth(req);
  const propertyId = uuidParam(req.params.id, 'Property');
  const documentId = uuidParam(req.params.documentId, 'Document');

  const row = must<DocumentRow | null>(
    await db
      .from('property_documents')
      .select(DOCUMENT_COLUMNS)
      .eq('id', documentId)
      .eq('property_id', propertyId)
      .eq('account_id', accountId)
      .maybeSingle(),
  );
  if (!row) throw notFound('Document');

  if (row.upload_status !== 'ready') {
    try {
      await verifyUploaded(db, BUCKET, row.storage_path, row.mime_type);
    } catch (err) {
      if (err instanceof HttpError && err.code === 'UNSUPPORTED_FILE_TYPE') {
        await db.from('property_documents').delete().eq('id', row.id);
      }
      throw err;
    }
    must(
      await db
        .from('property_documents')
        .update({ upload_status: 'ready' })
        .eq('id', row.id)
        .eq('account_id', accountId),
    );
    await audit(auth(req), 'document.uploaded', { type: 'document', id: row.id });
  }

  ok(res, toDocument(row));
});

/* GET /documents/:id/download — short-lived signed URL for viewing (§8.3) */
documentsRouter.get('/documents/:id/download', async (req, res) => {
  const { db, accountId } = auth(req);
  const id = uuidParam(req.params.id, 'Document');

  const row = must<DocumentRow | null>(
    await db
      .from('property_documents')
      .select(DOCUMENT_COLUMNS)
      .eq('id', id)
      .eq('account_id', accountId)
      .eq('upload_status', 'ready')
      .maybeSingle(),
  );
  if (!row) throw notFound('Document');

  const data: SignedDownload = {
    url: await signDownload(db, BUCKET, row.storage_path),
    file_name: row.file_name,
    mime_type: row.mime_type,
    expires_in: env.SIGNED_DOWNLOAD_TTL_SECONDS,
  };
  ok(res, data);
});

/* PATCH /documents/:id — recategorise or describe (review status is staff-only) */
documentsRouter.patch('/documents/:id', async (req, res) => {
  const { db, accountId } = auth(req);
  const id = uuidParam(req.params.id, 'Document');
  const input = updateDocumentSchema.parse(req.body);

  const row = must<DocumentRow | null>(
    await db
      .from('property_documents')
      .update(input)
      .eq('id', id)
      .eq('account_id', accountId)
      .eq('upload_status', 'ready')
      .select(DOCUMENT_COLUMNS)
      .maybeSingle(),
  );
  if (!row) throw notFound('Document');

  await audit(auth(req), 'document.updated', { type: 'document', id: row.id }, input);
  ok(res, toDocument(row));
});

/* DELETE /documents/:id */
documentsRouter.delete('/documents/:id', async (req, res) => {
  const { db, accountId } = auth(req);
  const id = uuidParam(req.params.id, 'Document');

  const row = must<{ id: string; storage_path: string } | null>(
    await db
      .from('property_documents')
      .select('id, storage_path')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle(),
  );
  if (!row) throw notFound('Document');

  await removeObjects(db, BUCKET, [row.storage_path]);
  must(await db.from('property_documents').delete().eq('id', row.id).eq('account_id', accountId));
  await audit(auth(req), 'document.deleted', { type: 'document', id: row.id });

  res.status(204).end();
});
