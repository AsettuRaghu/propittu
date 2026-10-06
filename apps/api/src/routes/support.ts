import { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import {
  attachmentIntentSchema,
  MAX_ATTACHMENTS_PER_MESSAGE,
  STORAGE_BUCKETS,
  type SupportAttachment,
  type UploadIntent,
  createTicketSchema,
  ticketMessageSchema,
  type SupportMessage,
  type SupportTicket,
  type SupportTicketDetail,
} from '@propittu/shared';
import { auth } from '../auth.js';
import { audit } from '../audit.js';
import { HttpError, must, notFound, ok, uuidParam } from '../errors.js';
import {
  signDownloads,
  signUpload,
  SIGNED_UPLOAD_TTL_SECONDS,
  verifyUploaded,
} from '../storage.js';

/**
 * Help & Support: the customer's tickets. Mounted BEFORE the Limited
 * Access gate — a customer whose plan ended can still ask for help.
 */
export const supportRouter = Router();

export const TICKET_COLUMNS =
  'id, reference, subject, category, status, created_at, last_message_at, resolved_at, ' +
  'property:properties(id, name), service_request:service_requests(id, reference)';

interface AttachmentRow {
  id: string;
  message_id: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  storage_path: string;
}

const BUCKET = STORAGE_BUCKETS.documents;

/** The conversation, each message with its (ready) attachments and signed URLs. */
export async function loadMessages(
  db: SupabaseClient,
  ticketId: string,
): Promise<SupportMessage[]> {
  const [messages, files] = await Promise.all([
    db
      .from('support_ticket_messages')
      .select('id, author_type, body, created_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true }),
    db
      .from('support_ticket_attachments')
      .select('id, message_id, file_name, mime_type, file_size, storage_path')
      .eq('ticket_id', ticketId)
      .eq('upload_status', 'ready')
      .order('created_at', { ascending: true }),
  ]);
  const rows = must<Omit<SupportMessage, 'attachments'>[]>(messages);
  const atts = must<AttachmentRow[]>(files);
  const urls = await signDownloads(
    db,
    BUCKET,
    atts.map((x) => x.storage_path),
  );
  return rows.map((m) => ({
    ...m,
    attachments: atts
      .filter((x) => x.message_id === m.id)
      .map((x) => ({
        id: x.id,
        file_name: x.file_name,
        mime_type: x.mime_type,
        file_size: x.file_size,
        url: urls.get(x.storage_path) ?? null,
      })),
  }));
}

const EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/** Starts an upload onto a message the caller wrote (customer or staff). */
export async function startAttachment(
  db: SupabaseClient,
  userId: string,
  ticket: { id: string; account_id: string },
  body: unknown,
): Promise<UploadIntent> {
  const input = attachmentIntentSchema.parse(body);
  const message = must<{ id: string; author_id: string } | null>(
    await db
      .from('support_ticket_messages')
      .select('id, author_id')
      .eq('id', input.message_id)
      .eq('ticket_id', ticket.id)
      .maybeSingle(),
  );
  if (!message || message.author_id !== userId) throw notFound('Message');
  const existing = await db
    .from('support_ticket_attachments')
    .select('id', { count: 'exact', head: true })
    .eq('message_id', message.id);
  must(existing);
  if ((existing.count ?? 0) >= MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new HttpError(
      400,
      'VALIDATION_FAILED',
      `Up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message`,
    );
  }
  const path = `${ticket.account_id}/tickets/${ticket.id}/${randomUUID()}.${EXT[input.mime_type]}`;
  const fileName =
    // eslint-disable-next-line no-control-regex
    input.file_name.replace(/[/\\\u0000-\u001f\u007f]/g, '_').slice(0, 255) || 'file';
  const row = must<{ id: string }>(
    await db
      .from('support_ticket_attachments')
      .insert({
        ticket_id: ticket.id,
        message_id: message.id,
        account_id: ticket.account_id,
        uploaded_by: userId,
        file_name: fileName,
        storage_path: path,
        mime_type: input.mime_type,
        file_size: input.file_size,
      })
      .select('id')
      .single(),
  );
  let url: string;
  try {
    url = await signUpload(db, BUCKET, path);
  } catch (err) {
    await db.from('support_ticket_attachments').delete().eq('id', row.id);
    throw err;
  }
  return { id: row.id, upload_url: url, expires_in: SIGNED_UPLOAD_TTL_SECONDS };
}

/** Verifies the object landed and marks the attachment ready. */
export async function confirmAttachment(
  db: SupabaseClient,
  ticketId: string,
  attachmentId: string,
): Promise<SupportAttachment> {
  const row = must<(AttachmentRow & { upload_status: string }) | null>(
    await db
      .from('support_ticket_attachments')
      .select('id, message_id, file_name, mime_type, file_size, storage_path, upload_status')
      .eq('id', attachmentId)
      .eq('ticket_id', ticketId)
      .maybeSingle(),
  );
  if (!row) throw notFound('Attachment');
  if (row.upload_status !== 'ready') {
    try {
      await verifyUploaded(db, BUCKET, row.storage_path, row.mime_type);
    } catch (err) {
      if (err instanceof HttpError && err.code === 'UNSUPPORTED_FILE_TYPE') {
        await db.from('support_ticket_attachments').delete().eq('id', row.id);
      }
      throw err;
    }
    must(
      await db
        .from('support_ticket_attachments')
        .update({ upload_status: 'ready' })
        .eq('id', row.id),
    );
  }
  const urls = await signDownloads(db, BUCKET, [row.storage_path]);
  return {
    id: row.id,
    file_name: row.file_name,
    mime_type: row.mime_type,
    file_size: row.file_size,
    url: urls.get(row.storage_path) ?? null,
  };
}

async function loadTicket(
  db: SupabaseClient,
  accountId: string,
  id: string,
): Promise<SupportTicketDetail> {
  const row = must<SupportTicket | null>(
    await db
      .from('support_tickets')
      .select(TICKET_COLUMNS)
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle(),
  );
  if (!row) throw notFound('Ticket');
  return { ...row, messages: await loadMessages(db, id) };
}

/* GET /support/tickets — newest activity first */
supportRouter.get('/support/tickets', async (req, res) => {
  const { db, accountId } = auth(req);
  ok(
    res,
    must<SupportTicket[]>(
      await db
        .from('support_tickets')
        .select(TICKET_COLUMNS)
        .eq('account_id', accountId)
        .order('last_message_at', { ascending: false })
        .limit(100),
    ),
  );
});

/* POST /support/tickets {subject, category, description, property_id?, service_request_id?} */
supportRouter.post('/support/tickets', async (req, res) => {
  const ctx = auth(req);
  const input = createTicketSchema.parse(req.body);
  const row = must<{ id: string; reference: string }>(
    await ctx.db
      .from('support_tickets')
      .insert({
        account_id: ctx.accountId,
        user_id: ctx.userId,
        subject: input.subject,
        category: input.category,
        property_id: input.property_id ?? null,
        service_request_id: input.service_request_id ?? null,
      })
      .select('id, reference')
      .single(),
  );
  must(
    await ctx.db.from('support_ticket_messages').insert({
      ticket_id: row.id,
      account_id: ctx.accountId,
      author_id: ctx.userId,
      author_type: 'customer',
      body: input.description,
    }),
  );
  await audit(
    ctx,
    'support_ticket.created',
    { type: 'support_ticket', id: row.id },
    { reference: row.reference },
  );
  ok(res, await loadTicket(ctx.db, ctx.accountId, row.id), 201);
});

/* GET /support/tickets/:id */
supportRouter.get('/support/tickets/:id', async (req, res) => {
  const { db, accountId } = auth(req);
  ok(res, await loadTicket(db, accountId, uuidParam(req.params.id, 'Ticket')));
});

/* POST /support/tickets/:id/messages {body} */
supportRouter.post('/support/tickets/:id/messages', async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Ticket');
  const { body } = ticketMessageSchema.parse(req.body);
  const ticket = await loadTicket(ctx.db, ctx.accountId, id);
  if (ticket.status === 'closed') {
    throw new HttpError(409, 'CONFLICT', 'This ticket is closed. Please raise a new one.');
  }
  must(
    await ctx.db.from('support_ticket_messages').insert({
      ticket_id: id,
      account_id: ctx.accountId,
      author_id: ctx.userId,
      author_type: 'customer',
      body,
    }),
  );
  await audit(ctx, 'support_ticket.replied', { type: 'support_ticket', id });
  ok(res, await loadTicket(ctx.db, ctx.accountId, id), 201);
});

/* POST /support/tickets/:id/attachments/intent {message_id, file_name, mime_type, file_size} */
supportRouter.post('/support/tickets/:id/attachments/intent', async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Ticket');
  await loadTicket(ctx.db, ctx.accountId, id);
  ok(
    res,
    await startAttachment(ctx.db, ctx.userId, { id, account_id: ctx.accountId }, req.body),
    201,
  );
});

/* POST /support/tickets/:id/attachments/:attachmentId/confirm */
supportRouter.post('/support/tickets/:id/attachments/:attachmentId/confirm', async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Ticket');
  await loadTicket(ctx.db, ctx.accountId, id);
  ok(res, await confirmAttachment(ctx.db, id, uuidParam(req.params.attachmentId, 'Attachment')));
});
