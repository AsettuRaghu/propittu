import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import express, { Router } from 'express';
import { z } from 'zod';
import {
  DOCUMENT_TYPES,
  STORAGE_BUCKETS,
  guessDocumentType,
  type DocumentType,
  type Inbox,
  type InboxDocument,
} from '@propittu/shared';
import { audit, auditPittu } from '../audit.js';
import { auth } from '../auth.js';
import { autoReadDocument } from '../deeds/reading.js';
import { env } from '../env.js';
import { HttpError, must, notFound, ok, uuidParam } from '../errors.js';
import { logger } from '../logger.js';
import { notify } from '../notify.js';
import { assertOwnsProperty } from '../ownership.js';
import { countForProperty, enforceLimit, enforceStorage, planOf } from '../plan.js';
import { serviceClient } from '../supabase.js';

/**
 * Send documents to Pittu by email. Each account has a private code in its
 * address ("<local>+<code>@<domain>", Postmark inbound). Postmark posts each
 * email to our webhook; PDFs and photos are kept in the account's folder and
 * filed under a property — at once when there's only one, else when the
 * owner picks it. Pittu then reads them like any upload.
 *
 *   POST /inbound/email/:secret     (Postmark; public, secret in the URL)
 *   GET  /inbox                     the owner's address and what's waiting
 *   POST /inbox/:id/file            {property_id, document_type}
 *   DELETE /inbox/:id
 */
export const inboundRouter = Router();
export const inboxRouter = Router();

const MAX_FILE = 10 * 1024 * 1024;
const MAX_FILES = 5;
const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

const addressFor = (token: string) => {
  if (!env.INBOUND_EMAIL_ADDRESS) return null;
  const [local, domain] = env.INBOUND_EMAIL_ADDRESS.split('@');
  return `${local}+${token}@${domain}`;
};

const sameSecret = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const postmarkSchema = z.object({
  FromFull: z
    .object({ Email: z.string().max(200) })
    .partial()
    .optional(),
  Subject: z.string().max(1000).optional(),
  MailboxHash: z.string().max(100).optional(),
  ToFull: z.array(z.object({ MailboxHash: z.string().max(100).optional() }).partial()).optional(),
  Attachments: z
    .array(
      z.object({
        Name: z.string().max(255),
        Content: z.string(),
        ContentType: z.string().max(100),
        ContentLength: z.number().optional(),
      }),
    )
    .default([]),
});

inboundRouter.post(
  '/inbound/email/:secret',
  // Postmark sends attachments in the JSON (our host caps a request at ~4.5 MB).
  express.json({ limit: '5mb' }),
  async (req, res) => {
    if (
      !env.INBOUND_EMAIL_SECRET ||
      !sameSecret(String(req.params.secret), env.INBOUND_EMAIL_SECRET)
    ) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Not allowed');
    }
    const db = serviceClient;
    if (!db) throw new HttpError(503, 'INTERNAL', 'Not available');
    const mail = postmarkSchema.parse(req.body);
    const token = (mail.MailboxHash || mail.ToFull?.find((t) => t.MailboxHash)?.MailboxHash || '')
      .toLowerCase()
      .trim();
    const { data: inbox } = await db
      .from('account_inboxes')
      .select('account_id')
      .eq('token', token)
      .maybeSingle();
    // Unknown code: accept quietly (no retries), keep nothing.
    if (!inbox) {
      logger.info('inbound email for an unknown inbox — ignored');
      ok(res, { kept: 0 });
      return;
    }
    const accountId = inbox.account_id as string;
    const { data: homes } = await db
      .from('properties')
      .select('id, name')
      .eq('account_id', accountId)
      .eq('is_draft', false);
    const properties = (homes ?? []) as { id: string; name: string }[];
    const subject = mail.Subject?.slice(0, 300) ?? null;

    let kept = 0;
    for (const a of mail.Attachments.slice(0, MAX_FILES)) {
      const type = a.ContentType.toLowerCase().split(';')[0]!.trim();
      if (!ALLOWED.has(type)) continue;
      const bytes = Buffer.from(a.Content, 'base64');
      if (!bytes.length || bytes.length > MAX_FILE) continue;
      const path = `${accountId}/inbox/${randomUUID()}.${EXT[type]}`;
      const { error } = await db.storage
        .from(STORAGE_BUCKETS.documents)
        .upload(path, bytes, { contentType: type });
      if (error) {
        logger.warn({ err: error.message }, 'inbound attachment not stored');
        continue;
      }
      const text = `${a.Name} ${subject ?? ''}`;
      const guessProperty =
        properties.length === 1
          ? properties[0]!.id
          : (properties.find((p) => text.toLowerCase().includes(p.name.toLowerCase().slice(0, 12)))
              ?.id ?? null);
      const { data: row } = await db
        .from('inbox_documents')
        .insert({
          account_id: accountId,
          file_name: a.Name.slice(0, 255),
          mime_type: type,
          file_size: bytes.length,
          storage_path: path,
          from_email: mail.FromFull?.Email ?? null,
          subject,
          guess_type: guessDocumentType(text),
          guess_property_id: guessProperty,
        })
        .select('id')
        .single();
      kept++;
      // One property: file it straight away.
      if (row && properties.length === 1) {
        await fileDocument(
          db,
          accountId,
          row.id as string,
          properties[0]!.id,
          guessDocumentType(text) ?? 'other',
          null,
        ).catch((err: unknown) =>
          logger.warn({ err: String(err) }, 'filing an emailed document failed'),
        );
      }
    }
    if (kept) {
      notify({ type: 'inbox.received', accountId, count: kept, filed: properties.length === 1 });
      await auditPittu(
        db,
        accountId,
        'inbox.received',
        { type: 'account', id: accountId },
        { kept },
      );
    }
    ok(res, { kept });
  },
);

/** Files an emailed document under a property (as a ready document Pittu then reads). */
async function fileDocument(
  db: NonNullable<typeof serviceClient>,
  accountId: string,
  inboxId: string,
  propertyId: string,
  documentType: DocumentType,
  userId: string | null,
): Promise<string> {
  const item = must<{
    file_name: string;
    mime_type: string;
    file_size: number;
    storage_path: string;
    filed_document_id: string | null;
  } | null>(
    await db
      .from('inbox_documents')
      .select('file_name, mime_type, file_size, storage_path, filed_document_id')
      .eq('id', inboxId)
      .eq('account_id', accountId)
      .maybeSingle(),
  );
  if (!item) throw notFound('Document');
  if (item.filed_document_id) return item.filed_document_id;
  const doc = must<{ id: string }>(
    await db
      .from('property_documents')
      .insert({
        property_id: propertyId,
        account_id: accountId,
        user_id: userId,
        document_type: documentType,
        file_name: item.file_name,
        description: 'Sent by email',
        storage_path: item.storage_path,
        mime_type: item.mime_type,
        file_size: item.file_size,
        upload_status: 'ready',
      })
      .select('id')
      .single(),
  );
  must(await db.from('inbox_documents').update({ filed_document_id: doc.id }).eq('id', inboxId));
  waitUntil(autoReadDocument(doc.id));
  return doc.id;
}

inboxRouter.get('/inbox', async (req, res) => {
  const { db, accountId } = auth(req);
  const server = serviceClient;
  let token: string | null = null;
  if (env.INBOUND_EMAIL_ADDRESS && server) {
    const { data } = await db
      .from('account_inboxes')
      .select('token')
      .eq('account_id', accountId)
      .maybeSingle();
    token = (data?.token as string | undefined) ?? null;
    if (!token) {
      token = randomBytes(8).toString('hex').slice(0, 10);
      await server.from('account_inboxes').insert({ account_id: accountId, token });
    }
  }
  const waiting = must<InboxDocument[]>(
    await db
      .from('inbox_documents')
      .select(
        'id, file_name, mime_type, file_size, subject, from_email, guess_type, guess_property_id, received_at',
      )
      .eq('account_id', accountId)
      .is('filed_document_id', null)
      .order('received_at', { ascending: false }),
  );
  const data: Inbox = { address: token ? addressFor(token) : null, waiting };
  ok(res, data);
});

inboxRouter.post('/inbox/:id/file', async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Document');
  const input = z
    .object({ property_id: z.guid(), document_type: z.enum(DOCUMENT_TYPES) })
    .parse(req.body);
  await assertOwnsProperty(ctx.db, ctx.accountId, input.property_id);
  const plan = planOf(req);
  const used = await countForProperty(
    ctx.db,
    'property_documents',
    ctx.accountId,
    input.property_id,
  );
  enforceLimit(plan, 'max_documents_per_property', used, 1, [
    'document per property',
    'documents per property',
  ]);
  const { data: item } = await ctx.db
    .from('inbox_documents')
    .select('file_size')
    .eq('id', id)
    .maybeSingle();
  if (!item) throw notFound('Document');
  await enforceStorage(ctx.db, plan, ctx.accountId, item.file_size as number);
  const server = serviceClient;
  if (!server) throw new HttpError(503, 'INTERNAL', 'Not available right now');
  const documentId = await fileDocument(
    server,
    ctx.accountId,
    id,
    input.property_id,
    input.document_type,
    ctx.userId,
  );
  await audit(
    ctx,
    'inbox.filed',
    { type: 'document', id: documentId },
    { type: input.document_type },
  );
  ok(res, { document_id: documentId });
});

inboxRouter.delete('/inbox/:id', async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Document');
  const row = must<{ storage_path: string } | null>(
    await ctx.db
      .from('inbox_documents')
      .delete()
      .eq('id', id)
      .is('filed_document_id', null)
      .select('storage_path')
      .maybeSingle(),
  );
  if (!row) throw notFound('Document');
  await serviceClient?.storage.from(STORAGE_BUCKETS.documents).remove([row.storage_path]);
  ok(res, { id });
});
