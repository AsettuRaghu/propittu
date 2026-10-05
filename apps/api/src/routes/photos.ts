import { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  photoIntentSchema,
  STORAGE_BUCKETS,
  type PropertyPhoto,
  type UploadIntent,
} from '@propittu/shared';
import { auth } from '../auth.js';
import { audit } from '../audit.js';
import { HttpError, must, notFound, ok, uuidParam } from '../errors.js';
import { assertOwnsProperty } from '../ownership.js';
import { countForProperty, enforceLimit, enforceStorage, planOf, requireFeature } from '../plan.js';
import {
  objectPath,
  removeObjects,
  signDownloads,
  signUpload,
  SIGNED_UPLOAD_TTL_SECONDS,
  verifyUploaded,
} from '../storage.js';

/**
 * Property photos (§19) — signed-URL intent/confirm upload flow:
 *
 *   1. POST /properties/:id/photos/intent        → row (pending) + signed upload URL
 *   2. client uploads bytes straight to Supabase Storage
 *   3. POST /properties/:id/photos/:photoId/confirm → verifies object, marks ready
 */
export const photosRouter = Router();

const BUCKET = STORAGE_BUCKETS.photos;

interface PhotoRow {
  id: string;
  property_id: string;
  storage_path: string;
  mime_type: string;
  caption: string | null;
  upload_status: 'pending' | 'ready';
  created_at: string;
}

const PHOTO_COLUMNS =
  'id, property_id, storage_path, mime_type, caption, upload_status, created_at';

function toPhoto(row: PhotoRow, url: string | null): PropertyPhoto {
  return {
    id: row.id,
    property_id: row.property_id,
    caption: row.caption,
    url,
    created_at: row.created_at,
  };
}

/** Ready photos with fresh signed URLs, oldest first. Shared with GET /properties/:id. */
export async function listReadyPhotos(
  db: SupabaseClient,
  accountId: string,
  propertyId: string,
): Promise<PropertyPhoto[]> {
  const rows = must<PhotoRow[]>(
    await db
      .from('property_photos')
      .select(PHOTO_COLUMNS)
      .eq('property_id', propertyId)
      .eq('account_id', accountId)
      .eq('upload_status', 'ready')
      .order('created_at', { ascending: true }),
  );
  const urls = await signDownloads(
    db,
    BUCKET,
    rows.map((r) => r.storage_path),
  );
  return rows.map((r) => toPhoto(r, urls.get(r.storage_path) ?? null));
}

/* GET /properties/:id/photos */
photosRouter.get('/properties/:id/photos', async (req, res) => {
  const { db, accountId } = auth(req);
  const propertyId = uuidParam(req.params.id, 'Property');
  await assertOwnsProperty(db, accountId, propertyId);
  ok(res, await listReadyPhotos(db, accountId, propertyId));
});

/* POST /properties/:id/photos/intent */
photosRouter.post('/properties/:id/photos/intent', async (req, res) => {
  const { db, userId, accountId } = auth(req);
  const propertyId = uuidParam(req.params.id, 'Property');
  const input = photoIntentSchema.parse(req.body);
  await assertOwnsProperty(db, accountId, propertyId);

  const plan = planOf(req);
  requireFeature(plan, 'photo_upload', 'Photo upload');
  const used = await countForProperty(db, 'property_photos', accountId, propertyId);
  enforceLimit(plan, 'max_photos_per_property', used, 1, [
    'photo per property',
    'photos per property',
  ]);
  await enforceStorage(db, plan, accountId, input.file_size);

  const storagePath = objectPath(accountId, propertyId, input.mime_type);
  const row = must<{ id: string }>(
    await db
      .from('property_photos')
      .insert({
        property_id: propertyId,
        account_id: accountId,
        user_id: userId,
        storage_path: storagePath,
        mime_type: input.mime_type,
        file_size: input.file_size,
        caption: input.caption,
      })
      .select('id')
      .single(),
  );

  let uploadUrl: string;
  try {
    uploadUrl = await signUpload(db, BUCKET, storagePath);
  } catch (err) {
    await db.from('property_photos').delete().eq('id', row.id);
    throw err;
  }

  const data: UploadIntent = {
    id: row.id,
    upload_url: uploadUrl,
    expires_in: SIGNED_UPLOAD_TTL_SECONDS,
  };
  ok(res, data, 201);
});

/* POST /properties/:id/photos/:photoId/confirm — idempotent */
photosRouter.post('/properties/:id/photos/:photoId/confirm', async (req, res) => {
  const { db, accountId } = auth(req);
  const propertyId = uuidParam(req.params.id, 'Property');
  const photoId = uuidParam(req.params.photoId, 'Photo');

  const row = must<PhotoRow | null>(
    await db
      .from('property_photos')
      .select(PHOTO_COLUMNS)
      .eq('id', photoId)
      .eq('property_id', propertyId)
      .eq('account_id', accountId)
      .maybeSingle(),
  );
  if (!row) throw notFound('Photo');

  if (row.upload_status !== 'ready') {
    try {
      await verifyUploaded(db, BUCKET, row.storage_path, row.mime_type);
    } catch (err) {
      // Wrong file type: the object is already gone, drop the row too.
      if (err instanceof HttpError && err.code === 'UNSUPPORTED_FILE_TYPE') {
        await db.from('property_photos').delete().eq('id', row.id);
      }
      throw err;
    }
    must(
      await db
        .from('property_photos')
        .update({ upload_status: 'ready' })
        .eq('id', row.id)
        .eq('account_id', accountId),
    );
    await audit(auth(req), 'photo.uploaded', { type: 'photo', id: row.id });
  }

  const urls = await signDownloads(db, BUCKET, [row.storage_path]);
  ok(res, toPhoto({ ...row, upload_status: 'ready' }, urls.get(row.storage_path) ?? null));
});

/*
 * DELETE /photos/:id
 * Not listed in §30, but without it a wrongly uploaded photo could never be
 * removed short of deleting the whole property. See docs/DECISIONS.md.
 */
photosRouter.delete('/photos/:id', async (req, res) => {
  const { db, accountId } = auth(req);
  const id = uuidParam(req.params.id, 'Photo');

  const row = must<{ id: string; storage_path: string } | null>(
    await db
      .from('property_photos')
      .select('id, storage_path')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle(),
  );
  if (!row) throw notFound('Photo');

  await removeObjects(db, BUCKET, [row.storage_path]);
  must(await db.from('property_photos').delete().eq('id', row.id).eq('account_id', accountId));
  await audit(auth(req), 'photo.deleted', { type: 'photo', id: row.id });

  res.status(204).end();
});
