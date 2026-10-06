import { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createTicketSchema,
  ticketMessageSchema,
  type SupportMessage,
  type SupportTicket,
  type SupportTicketDetail,
} from '@propittu/shared';
import { auth } from '../auth.js';
import { audit } from '../audit.js';
import { HttpError, must, notFound, ok, uuidParam } from '../errors.js';

/**
 * Help & Support: the customer's tickets. Mounted BEFORE the Limited
 * Access gate — a customer whose plan ended can still ask for help.
 */
export const supportRouter = Router();

export const TICKET_COLUMNS =
  'id, reference, subject, category, status, created_at, last_message_at, resolved_at, ' +
  'property:properties(id, name), service_request:service_requests(id, reference)';

export async function loadMessages(
  db: SupabaseClient,
  ticketId: string,
): Promise<SupportMessage[]> {
  return must<SupportMessage[]>(
    await db
      .from('support_ticket_messages')
      .select('id, author_type, body, created_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true }),
  );
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
  ok(res, await loadTicket(ctx.db, ctx.accountId, id), 201);
});
