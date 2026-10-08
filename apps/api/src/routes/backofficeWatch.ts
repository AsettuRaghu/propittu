import { waitUntil } from '@vercel/functions';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { staffCan, type WatchItem, type WatchPlace } from '@propittu/shared';
import { audit } from '../audit.js';
import { auth } from '../auth.js';
import { HttpError, invalid, must, notFound, ok, uuidParam } from '../errors.js';
import { server } from '../pittu/core/limits.js';
import { collectPlace, readPlace } from '../watch/watch.js';

/** Pittu Watch in the Backoffice portal: places, the review queue. Staff only. */
export const watchRouter = Router();

const canReview: RequestHandler = (req, _res, next) => {
  if (staffCan(req.staffRole, 'documents.review')) return next();
  throw new HttpError(403, 'FORBIDDEN', 'Your staff role does not allow this action');
};

const ITEM_COLUMNS =
  'id, place_id, url, title, snippet, domain, published_at, ai_status, relevant, category, impact, summary, ' +
  'ai_confidence, review, reviewed_at, place:watch_places(name)';
type ItemRow = Omit<WatchItem, 'place_name'> & { place: { name: string } | null };
const toItem = ({ place, ...r }: ItemRow): WatchItem => ({ ...r, place_name: place?.name ?? null });

/* GET /backoffice/watch/places */
watchRouter.get('/watch/places', async (req, res) => {
  const { db } = auth(req);
  const [places, items, props] = await Promise.all([
    db
      .from('watch_places')
      .select('id, name, district, state, pincodes, query, is_active, last_collected_at')
      .order('name'),
    db.from('watch_items').select('place_id, review').neq('review', 'rejected').limit(20_000),
    db
      .from('properties')
      .select('pincode')
      .eq('is_draft', false)
      .not('pincode', 'is', null)
      .limit(50_000),
  ]);
  const itemRows = must<{ place_id: string; review: string }[]>(items);
  const pins = new Map<string, number>();
  for (const p of must<{ pincode: string }[]>(props))
    pins.set(p.pincode, (pins.get(p.pincode) ?? 0) + 1);
  const data: WatchPlace[] = must<
    Omit<WatchPlace, 'items_pending' | 'items_approved' | 'properties'>[]
  >(places).map((p) => ({
    ...p,
    items_pending: itemRows.filter((i) => i.place_id === p.id && i.review === 'pending').length,
    items_approved: itemRows.filter((i) => i.place_id === p.id && i.review === 'approved').length,
    properties: p.pincodes.reduce((n, pin) => n + (pins.get(pin) ?? 0), 0),
  }));
  ok(res, data);
});

/* POST /backoffice/watch/places/sync — a place for every locality with customer properties */
watchRouter.post('/watch/places/sync', canReview, async (req, res) => {
  const { db } = auth(req);
  ok(res, { added: must<number>(await db.rpc('staff_sync_watch_places')) });
});

/* PATCH /backoffice/watch/places/:id {name?, query?, is_active?} — the name is what stories must mention */
const placeSchema = z
  .object({
    name: z.string().trim().min(3).max(80),
    query: z.string().trim().min(3).max(300),
    is_active: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
watchRouter.patch('/watch/places/:id', canReview, async (req, res) => {
  const { db } = auth(req);
  const id = uuidParam(req.params.id, 'Place');
  const input = placeSchema.parse(req.body);
  const row = must<{ id: string } | null>(
    await db.from('watch_places').update(input).eq('id', id).select('id').maybeSingle(),
  );
  if (!row) throw notFound('Place');
  ok(res, { id });
});

/* POST /backoffice/watch/places/:id/collect — collect and read now (runs in the background) */
watchRouter.post('/watch/places/:id/collect', canReview, async (req, res) => {
  const { db } = auth(req);
  const id = uuidParam(req.params.id, 'Place');
  const place = must<{
    id: string;
    name: string;
    district: string;
    state: string;
    query: string;
    last_collected_at: string | null;
  } | null>(
    await db
      .from('watch_places')
      .select('id, name, district, state, query, last_collected_at')
      .eq('id', id)
      .maybeSingle(),
  );
  if (!place) throw notFound('Place');
  const svc = server();
  waitUntil(
    collectPlace(svc, place)
      .then(() => readPlace(svc, place))
      .catch(() => undefined),
  );
  ok(res, { started: true }, 202);
});

/* GET /backoffice/watch/items?review=pending|approved|rejected|all&place= */
const listSchema = z.object({
  review: z.enum(['pending', 'approved', 'rejected', 'all']).default('pending'),
  place: z.guid().optional(),
});
watchRouter.get('/watch/items', async (req, res) => {
  const { db } = auth(req);
  const f = listSchema.parse(req.query);
  let q = db
    .from('watch_items')
    .select(ITEM_COLUMNS)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(300);
  if (f.review !== 'all') q = q.eq('review', f.review);
  if (f.place) q = q.eq('place_id', f.place);
  ok(res, must<ItemRow[]>(await q).map(toItem));
});

/* POST /backoffice/watch/items/:id/review {review, summary?} */
const reviewSchema = z.object({
  review: z.enum(['pending', 'approved', 'rejected']),
  summary: z.string().trim().max(300).nullable().optional(),
});
watchRouter.post('/watch/items/:id/review', canReview, async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Item');
  const { review, summary } = reviewSchema.parse(req.body);
  if (review === 'approved' && summary !== undefined && !summary)
    throw invalid('Write a one-line summary for the owner');
  const row = must<ItemRow | null>(
    await ctx.db
      .from('watch_items')
      .update({
        review,
        reviewed_by: ctx.userId,
        reviewed_at: new Date().toISOString(),
        ...(summary !== undefined ? { summary } : {}),
      })
      .eq('id', id)
      .select(ITEM_COLUMNS)
      .maybeSingle(),
  );
  if (!row) throw notFound('Item');
  await audit(ctx, `staff.watch_item.${review}`, { type: 'watch_item', id }, {}, 'staff');
  ok(res, toItem(row));
});
