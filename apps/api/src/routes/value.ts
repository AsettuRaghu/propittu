import { Router } from 'express';
import { auth } from '../auth.js';
import { must, notFound, ok, uuidParam } from '../errors.js';
import { serviceClient } from '../supabase.js';
import { propertyValue } from '../value/value.js';

/**
 * GET /properties/:id/value — Pittu Value for the owner: what they paid and
 * the government value today (area × the published rate). Ownership is
 * checked with the owner's own client; rates are read with the server key.
 */
export const valueCustomerRouter = Router();

valueCustomerRouter.get('/properties/:id/value', async (req, res) => {
  const { db, accountId } = auth(req);
  const id = uuidParam(req.params.id, 'Property');
  const own = must<{ id: string } | null>(
    await db.from('properties').select('id').eq('id', id).eq('account_id', accountId).maybeSingle(),
  );
  if (!own || !serviceClient) throw notFound('Property');
  ok(res, await propertyValue(serviceClient, id));
});
