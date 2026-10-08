import { waitUntil } from '@vercel/functions';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import {
  staffCan,
  valueRateSchema,
  valueRateUpdateSchema,
  valueSourceCreateSchema,
  type PropertyValueRow,
  type ValueRate,
} from '@propittu/shared';
import { audit } from '../audit.js';
import { auth } from '../auth.js';
import { HttpError, must, notFound, ok, uuidParam } from '../errors.js';
import {
  confirmSource,
  createSource,
  listSources,
  publishSource,
  readSource,
  startReading,
} from '../value/sources.js';
import { computeValue } from '../value/match.js';
import { propertyValue, publishedRates, RATE_COLUMNS, valueInput } from '../value/value.js';

/** Pittu Value in the Backoffice portal: rate documents, rates, property values. Staff only. */
export const valueRouter = Router();

const canManage: RequestHandler = (req, _res, next) => {
  if (staffCan(req.staffRole, 'services.manage')) return next();
  throw new HttpError(403, 'FORBIDDEN', 'Your staff role does not allow this action');
};

/* ---- Rate documents ---- */
valueRouter.get('/value/sources', async (_req, res) => {
  ok(res, await listSources());
});
valueRouter.post('/value/sources', canManage, async (req, res) => {
  const ctx = auth(req);
  const made = await createSource(valueSourceCreateSchema.parse(req.body), ctx.userId);
  await audit(
    ctx,
    'staff.value_source.created',
    { type: 'value_source', id: made.id },
    {},
    'staff',
  );
  ok(res, made, 201);
});
valueRouter.post('/value/sources/:id/confirm', canManage, async (req, res) => {
  await confirmSource(uuidParam(req.params.id, 'Document'));
  ok(res, { ok: true });
});
valueRouter.post('/value/sources/:id/read', canManage, async (req, res) => {
  const id = uuidParam(req.params.id, 'Document');
  await startReading(id);
  waitUntil(readSource(id));
  ok(res, { started: true }, 202);
});
valueRouter.post('/value/sources/:id/publish', canManage, async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Document');
  const n = await publishSource(id);
  await audit(
    ctx,
    'staff.value_source.published',
    { type: 'value_source', id },
    { rates: n },
    'staff',
  );
  ok(res, { published: n });
});

/* ---- Rates ---- */
const listSchema = z.object({
  status: z.enum(['draft', 'published', 'all']).default('all'),
  source: z.guid().optional(),
});
valueRouter.get('/value/rates', async (req, res) => {
  const { db } = auth(req);
  const f = listSchema.parse(req.query);
  let q = db
    .from('value_rates')
    .select(RATE_COLUMNS)
    .order('district')
    .order('locality')
    .limit(5000);
  if (f.status !== 'all') q = q.eq('status', f.status);
  if (f.source) q = q.eq('source_id', f.source);
  ok(
    res,
    must<ValueRate[]>(await q).map((r) => ({ ...r, rate_inr: Number(r.rate_inr) })),
  );
});
/* A rate added by hand is published straight away (e.g. a Telangana market value looked up for a survey number). */
valueRouter.post('/value/rates', canManage, async (req, res) => {
  const { db, userId } = auth(req);
  const input = valueRateSchema.parse(req.body);
  const row = must<{ id: string }>(
    await db
      .from('value_rates')
      .insert({ ...input, status: 'published', created_by: userId })
      .select('id')
      .single(),
  );
  ok(res, row, 201);
});
valueRouter.patch('/value/rates/:id', canManage, async (req, res) => {
  const { db } = auth(req);
  const id = uuidParam(req.params.id, 'Rate');
  const input = valueRateUpdateSchema
    .extend({ status: z.enum(['draft', 'published']).optional() })
    .parse(req.body);
  const row = must<{ id: string } | null>(
    await db.from('value_rates').update(input).eq('id', id).select('id').maybeSingle(),
  );
  if (!row) throw notFound('Rate');
  ok(res, row);
});
valueRouter.delete('/value/rates/:id', canManage, async (req, res) => {
  const { db } = auth(req);
  must(await db.from('value_rates').delete().eq('id', uuidParam(req.params.id, 'Rate')));
  res.status(204).end();
});

/* ---- Values ---- */
valueRouter.get('/properties/:id/value', async (req, res) => {
  ok(res, await propertyValue(auth(req).db, uuidParam(req.params.id, 'Property')));
});

/* GET /backoffice/value/properties — every property's government value (rates loaded once) */
valueRouter.get('/value/properties', async (req, res) => {
  const { db } = auth(req);
  const [props, rates] = await Promise.all([
    db
      .from('properties')
      .select('id, name, account_id, city, pincode')
      .eq('is_draft', false)
      .order('created_at', { ascending: false })
      .limit(300),
    publishedRates(db),
  ]);
  const rows: PropertyValueRow[] = [];
  for (const p of must<
    { id: string; name: string; account_id: string; city: string | null; pincode: string | null }[]
  >(props)) {
    const v = computeValue(await valueInput(db, p.id), rates);
    rows.push({
      ...v,
      property_id: p.id,
      property_name: p.name,
      account_id: p.account_id,
      city: p.city,
      pincode: p.pincode,
    });
  }
  ok(res, rows);
});
