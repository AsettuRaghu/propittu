import { waitUntil } from '@vercel/functions';
import { Router } from 'express';
import type { MarketEstimate } from '@propittu/shared';
import { auth } from '../auth.js';
import { must, notFound, ok, uuidParam } from '../errors.js';
import { aiAvailableFor } from '../pittu/core/limits.js';
import { serviceClient } from '../supabase.js';
import { currentEstimate, estimateMarket } from '../value/estimate.js';
import { propertyValue } from '../value/value.js';

/**
 * GET /properties/:id/value — Pittu Value for the owner: what they paid and
 * the government value today (area × the published rate). Ownership is
 * checked with the owner's own client; rates are read with the server key.
 */
export const valueCustomerRouter = Router();

const EMPTY: MarketEstimate = {
  status: 'working',
  per_sqft_low: null,
  per_sqft_high: null,
  value_low: null,
  value_high: null,
  confidence: null,
  comparables: [],
  note: null,
  updated_at: new Date(0).toISOString(),
};

valueCustomerRouter.get('/properties/:id/value', async (req, res) => {
  const { db, accountId } = auth(req);
  const id = uuidParam(req.params.id, 'Property');
  const own = must<{ id: string } | null>(
    await db.from('properties').select('id').eq('id', id).eq('account_id', accountId).maybeSingle(),
  );
  if (!own || !serviceClient) throw notFound('Property');
  const [value, { estimate, due }] = await Promise.all([
    propertyValue(serviceClient, id),
    currentEstimate(db, id),
  ]);
  // Pittu (re)checks market prices in the background; the app polls while it works.
  if (due && aiAvailableFor(accountId)) waitUntil(estimateMarket(id));
  ok(res, {
    ...value,
    estimate:
      due && aiAvailableFor(accountId) ? { ...(estimate ?? EMPTY), status: 'working' } : estimate,
  });
});
