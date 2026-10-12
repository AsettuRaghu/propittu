import { Router } from 'express';
import { z } from 'zod';
import {
  COUNTRY_CALLING_CODE,
  familyInviteSchema,
  formatIndianMobile,
  nomineeSchema,
  type AccountPeople,
} from '@propittu/shared';
import { audit } from '../audit.js';
import { auth, requireOwner } from '../auth.js';
import { HttpError, fromDbError, must, ok, uuidParam } from '../errors.js';
import { planOf, requireFeature } from '../plan.js';
import { serviceClient } from '../supabase.js';

/**
 * Family and helpers. The owner invites family by phone; they sign in to
 * Propittu with that number, accept, and can then see and use the
 * properties (not delete them, the account, or who has access). Nominees are
 * who our team should give access to if something happens to the owner.
 *
 *   GET    /account/people                 members, open invites, nominees (owner)
 *   POST   /account/invites                {name, phone, relation} (owner)
 *   DELETE /account/invites/:id            (owner)
 *   DELETE /account/members/:userId        (owner)
 *   POST   /me/invites/:id                 {accept} — answer an invitation
 *   POST   /account/leave                  {account_id} — a member leaves
 *   POST   /account/nominees, DELETE /account/nominees/:id (owner)
 */
export const familyRouter = Router();

/** "98765 43210" / "+91 98765 43210" → "+919876543210". */
function e164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (phone.trim().startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `${COUNTRY_CALLING_CODE}${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  throw new HttpError(400, 'VALIDATION_FAILED', 'Enter a 10-digit mobile number');
}

familyRouter.get('/account/people', async (req, res) => {
  const ctx = auth(req);
  requireOwner(ctx);
  const db = serviceClient;
  if (!db) throw new HttpError(503, 'INTERNAL', 'Not available right now');
  const [members, invites, nominees] = await Promise.all([
    db
      .from('account_members')
      .select('user_id, role, created_at')
      .eq('account_id', ctx.accountId)
      .order('created_at'),
    ctx.db
      .from('account_invites')
      .select('id, name, phone, relation, created_at')
      .eq('account_id', ctx.accountId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    ctx.db
      .from('account_nominees')
      .select('id, name, relation, phone, note')
      .eq('account_id', ctx.accountId)
      .order('created_at'),
  ]);
  const rows = must(members) as { user_id: string; role: 'owner' | 'member'; created_at: string }[];
  const { data: profiles } = rows.length
    ? await db
        .from('profiles')
        .select('id, full_name, phone')
        .in(
          'id',
          rows.map((m) => m.user_id),
        )
    : { data: [] };
  const byId = new Map(
    ((profiles ?? []) as { id: string; full_name: string | null; phone: string | null }[]).map(
      (p) => [p.id, p],
    ),
  );
  const data: AccountPeople = {
    members: rows.map((m) => {
      const p = byId.get(m.user_id);
      return {
        user_id: m.user_id,
        name: p?.full_name ?? null,
        phone: p?.phone ? formatIndianMobile(p.phone) : null,
        role: m.role,
        since: m.created_at,
      };
    }),
    invites: must(invites) as AccountPeople['invites'],
    nominees: must(nominees) as AccountPeople['nominees'],
  };
  ok(res, data);
});

familyRouter.post('/account/invites', async (req, res) => {
  const ctx = auth(req);
  requireOwner(ctx);
  // Family access is a plan feature (Plus; set per plan in the portal).
  requireFeature(planOf(req), 'family_access', 'Family access');
  const input = familyInviteSchema.parse(req.body);
  const phone = e164(input.phone);
  if (ctx.phone && phone === ctx.phone)
    throw new HttpError(400, 'VALIDATION_FAILED', 'That’s your own number');
  const { data, error } = await ctx.db
    .from('account_invites')
    .insert({
      account_id: ctx.accountId,
      phone,
      name: input.name,
      relation: input.relation ?? null,
      invited_by: ctx.userId,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505')
      throw new HttpError(409, 'CONFLICT', 'You’ve already invited this number');
    throw fromDbError(error);
  }
  await audit(ctx, 'account.invite_sent', { type: 'account_invite', id: data.id as string });
  ok(res, { id: data.id }, 201);
});

familyRouter.delete('/account/invites/:id', async (req, res) => {
  const ctx = auth(req);
  requireOwner(ctx);
  const id = uuidParam(req.params.id, 'Invite');
  must(
    await ctx.db
      .from('account_invites')
      .update({ status: 'revoked' })
      .eq('id', id)
      .eq('account_id', ctx.accountId),
  );
  await audit(ctx, 'account.invite_revoked', { type: 'account_invite', id });
  ok(res, { id });
});

familyRouter.delete('/account/members/:userId', async (req, res) => {
  const ctx = auth(req);
  requireOwner(ctx);
  const userId = uuidParam(req.params.userId, 'Member');
  if (userId === ctx.userId) throw new HttpError(400, 'VALIDATION_FAILED', 'You own this account');
  const db = serviceClient;
  if (!db) throw new HttpError(503, 'INTERNAL', 'Not available right now');
  must(
    await db
      .from('account_members')
      .delete()
      .eq('account_id', ctx.accountId)
      .eq('user_id', userId)
      .eq('role', 'member'),
  );
  await audit(ctx, 'account.member_removed', { type: 'user', id: userId });
  ok(res, { user_id: userId });
});

familyRouter.post('/me/invites/:id', async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Invite');
  const { accept } = z.object({ accept: z.boolean() }).parse(req.body);
  const accountId = must<string>(
    await ctx.db.rpc('answer_account_invite', { p_invite: id, p_accept: accept }),
  );
  await audit(
    ctx,
    accept ? 'account.invite_accepted' : 'account.invite_declined',
    { type: 'account_invite', id },
    {},
    'user',
    accountId,
  );
  ok(res, { account_id: accountId, accepted: accept });
});

familyRouter.post('/account/leave', async (req, res) => {
  const ctx = auth(req);
  const { account_id } = z.object({ account_id: z.guid() }).parse(req.body);
  must(await ctx.db.rpc('leave_account', { p_account: account_id }));
  ok(res, { left: account_id });
});

familyRouter.post('/account/nominees', async (req, res) => {
  const ctx = auth(req);
  requireOwner(ctx);
  const input = nomineeSchema.parse(req.body);
  const row = must<{ id: string }>(
    await ctx.db
      .from('account_nominees')
      .insert({
        account_id: ctx.accountId,
        name: input.name,
        relation: input.relation ?? null,
        phone: input.phone ? e164(input.phone) : null,
        note: input.note ?? null,
        created_by: ctx.userId,
      })
      .select('id')
      .single(),
  );
  await audit(ctx, 'account.nominee_added', { type: 'account_nominee', id: row.id });
  ok(res, row, 201);
});

familyRouter.delete('/account/nominees/:id', async (req, res) => {
  const ctx = auth(req);
  requireOwner(ctx);
  const id = uuidParam(req.params.id, 'Nominee');
  must(await ctx.db.from('account_nominees').delete().eq('id', id).eq('account_id', ctx.accountId));
  await audit(ctx, 'account.nominee_removed', { type: 'account_nominee', id });
  ok(res, { id });
});
