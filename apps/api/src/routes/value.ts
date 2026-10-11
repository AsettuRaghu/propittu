import { waitUntil } from '@vercel/functions';
import { Router } from 'express';
import { knownSaleSchema, type KnownSale, type MarketEstimate } from '@propittu/shared';
import { audit } from '../audit.js';
import { projectOf } from '../legal/projectDisputes.js';
import { assertOwnsProperty } from '../ownership.js';
import { auth } from '../auth.js';
import { must, notFound, ok, uuidParam } from '../errors.js';
import { aiAvailableFor } from '../pittu/core/limits.js';
import { serviceClient } from '../supabase.js';
import { currentEstimate, estimateMarket, rerange } from '../value/estimate.js';
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
  rent_low: null,
  rent_high: null,
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

/* ---- Sales owners know of in their project ---- */

const KNOWN_COLUMNS =
  'id, price_inr, area_sqft, area_basis, sold_on, note, share_in_project, created_at';

/* GET /properties/:id/known-sales — the sales this owner told us about */
valueCustomerRouter.get('/properties/:id/known-sales', async (req, res) => {
  const { db, accountId } = auth(req);
  const id = uuidParam(req.params.id, 'Property');
  await assertOwnsProperty(db, accountId, id);
  ok(
    res,
    must<KnownSale[]>(
      await db
        .from('known_sales')
        .select(KNOWN_COLUMNS)
        .eq('property_id', id)
        .order('created_at', { ascending: false }),
    ),
  );
});

/**
 * POST /properties/:id/known-sales — "a flat like ours sold for ₹2.7 Cr in
 * 2024". Counted as a real sale in this property's range at once (no new
 * search), and — if the owner agrees — anonymously in every range in the
 * same project.
 */
valueCustomerRouter.post('/properties/:id/known-sales', async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Property');
  await assertOwnsProperty(ctx.db, ctx.accountId, id);
  const input = knownSaleSchema.parse(req.body);
  const project = serviceClient ? await projectOf(serviceClient, id) : null;
  const row = must<KnownSale>(
    await ctx.db
      .from('known_sales')
      .insert({
        account_id: ctx.accountId,
        property_id: id,
        project_key: project?.key ?? null,
        created_by: ctx.userId,
        ...input,
      })
      .select(KNOWN_COLUMNS)
      .single(),
  );
  await audit(
    ctx,
    'value.known_sale_added',
    { type: 'property', id },
    {
      shared: input.share_in_project,
    },
  );
  await rerange(id);
  ok(res, row, 201);
});

/* DELETE /known-sales/:id */
valueCustomerRouter.delete('/known-sales/:id', async (req, res) => {
  const ctx = auth(req);
  const saleId = uuidParam(req.params.id, 'Sale');
  const row = must<{ property_id: string } | null>(
    await ctx.db.from('known_sales').delete().eq('id', saleId).select('property_id').maybeSingle(),
  );
  if (!row) throw notFound('Sale');
  await rerange(row.property_id);
  ok(res, { id: saleId });
});
