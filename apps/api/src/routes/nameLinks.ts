import { Router } from 'express';
import { z } from 'zod';
import type { NameLink } from '@propittu/shared';
import { auth } from '../auth.js';
import { audit } from '../audit.js';
import { must, ok } from '../errors.js';

/**
 * Same person, different name. The owner confirms once that a name on a
 * document is (or isn't) the deed's buyer — "Deepthi Prashanth" is
 * "B.H. Deepthi" after marriage — and Pittu remembers it for every document
 * in the account (packages/shared comparePeople).
 *
 *   GET  /name-links
 *   POST /name-links   {deed_name, other_name, reason}
 */
export const nameLinksRouter = Router();

const linkSchema = z.object({
  deed_name: z.string().trim().min(1).max(200),
  other_name: z.string().trim().min(1).max(200),
  reason: z.enum(['married_name', 'spelling', 'initials', 'other', 'not_same']),
});

nameLinksRouter.get('/name-links', async (req, res) => {
  const { db, accountId } = auth(req);
  ok(
    res,
    must<NameLink[]>(
      await db
        .from('name_links')
        .select('deed_name, other_name, reason')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false }),
    ),
  );
});

nameLinksRouter.post('/name-links', async (req, res) => {
  const ctx = auth(req);
  const input = linkSchema.parse(req.body);
  const row = must<NameLink>(
    await ctx.db
      .from('name_links')
      .upsert(
        { account_id: ctx.accountId, created_by: ctx.userId, ...input },
        { onConflict: 'account_id,deed_name,other_name' },
      )
      .select('deed_name, other_name, reason')
      .single(),
  );
  await audit(
    ctx,
    'name_link.saved',
    { type: 'account', id: ctx.accountId },
    { reason: input.reason },
  );
  ok(res, row, 201);
});
