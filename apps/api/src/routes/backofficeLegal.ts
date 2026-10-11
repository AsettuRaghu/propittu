import { waitUntil } from '@vercel/functions';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import {
  legalCheckCreateSchema,
  legalCheckUpdateSchema,
  legalFindingReviewSchema,
  staffCan,
  type DisputeItem,
  type DisputeReview,
} from '@propittu/shared';
import { audit } from '../audit.js';
import { auth } from '../auth.js';
import { HttpError, must, ok, uuidParam } from '../errors.js';
import { checkDisputes } from '../legal/disputes.js';
import {
  createEcCheck,
  listChecks,
  loadCheck,
  reviewFinding,
  updateCheck,
} from '../legal/checks.js';

/** Pittu Legal in the Backoffice portal: EC checks and their review. Staff only (mounted in backofficeRouter). */
export const legalChecksRouter = Router();

const canReview: RequestHandler = (req, _res, next) => {
  if (staffCan(req.staffRole, 'documents.review')) return next();
  throw new HttpError(403, 'FORBIDDEN', 'Your staff role does not allow this action');
};

/* GET /backoffice/legal-checks?status=&property= */
const listSchema = z.object({
  status: z.string().max(20).optional(),
  property: z.guid().optional(),
});
legalChecksRouter.get('/legal-checks', async (req, res) => {
  const f = listSchema.parse(req.query);
  ok(res, await listChecks(auth(req).db, { status: f.status, propertyId: f.property }));
});

/* POST /backoffice/properties/:id/legal-checks {ec_document_id} — run the EC check */
legalChecksRouter.post('/properties/:id/legal-checks', canReview, async (req, res) => {
  const ctx = auth(req);
  const propertyId = uuidParam(req.params.id, 'Property');
  const { ec_document_id } = legalCheckCreateSchema.parse(req.body);
  const id = await createEcCheck(ctx.db, propertyId, ec_document_id, ctx.userId);
  await audit(
    ctx,
    'staff.legal_check.created',
    { type: 'legal_check', id },
    { property_id: propertyId },
    'staff',
  );
  ok(res, await loadCheck(ctx.db, id), 201);
});

/* GET /backoffice/legal-checks/:id */
legalChecksRouter.get('/legal-checks/:id', async (req, res) => {
  ok(res, await loadCheck(auth(req).db, uuidParam(req.params.id, 'Legal check')));
});

/* POST /backoffice/legal-checks/:id/findings {index, review, staff_note?} */
legalChecksRouter.post('/legal-checks/:id/findings', canReview, async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Legal check');
  const input = legalFindingReviewSchema.parse(req.body);
  await reviewFinding(ctx.db, id, input.index, input.review, input.staff_note, ctx.userId);
  ok(res, await loadCheck(ctx.db, id));
});

/* PATCH /backoffice/legal-checks/:id {status?, summary?} */
legalChecksRouter.patch('/legal-checks/:id', canReview, async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Legal check');
  const input = legalCheckUpdateSchema.parse(req.body);
  await updateCheck(ctx.db, id, input, ctx.userId);
  if (input.status)
    await audit(ctx, `staff.legal_check.${input.status}`, { type: 'legal_check', id }, {}, 'staff');
  ok(res, await loadCheck(ctx.db, id));
});

/* ---- Court cases and disputes Pittu found (team review before the owner sees them) ---- */

/* GET /backoffice/disputes?status=in_review|shared|clear|all */
legalChecksRouter.get('/disputes', async (req, res) => {
  const { status = 'in_review' } = z
    .object({ status: z.enum(['in_review', 'shared', 'clear', 'all']).optional() })
    .parse(req.query);
  const { db } = auth(req);
  let q = db
    .from('property_disputes')
    .select(
      'property_id, account_id, status, items, pittu_note, staff_note, checked_at, property:properties(name)',
    )
    .order('checked_at', { ascending: false, nullsFirst: false })
    .limit(200);
  if (status !== 'all') q = q.eq('status', status);
  const rows = must<
    (Omit<DisputeReview, 'property_name' | 'note'> & {
      staff_note: string | null;
      property: { name: string } | null;
    })[]
  >(await q);
  const data: DisputeReview[] = rows.map(({ property, staff_note, ...r }) => ({
    ...r,
    note: staff_note,
    property_name: property?.name ?? 'Property',
  }));
  ok(res, data);
});

/* PATCH /backoffice/disputes/:propertyId {reviews: [{url, review}], note, share} */
const disputeReviewSchema = z.object({
  reviews: z
    .array(z.object({ url: z.string().max(2000), review: z.enum(['kept', 'dismissed']) }))
    .max(50)
    .default([]),
  note: z.string().trim().max(1000).nullable().optional(),
  share: z.boolean().default(false),
});
legalChecksRouter.patch('/disputes/:propertyId', canReview, async (req, res) => {
  const ctx = auth(req);
  const propertyId = uuidParam(req.params.propertyId, 'Property');
  const input = disputeReviewSchema.parse(req.body);
  const row = must<{ items: DisputeItem[] } | null>(
    await ctx.db
      .from('property_disputes')
      .select('items')
      .eq('property_id', propertyId)
      .maybeSingle(),
  );
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Nothing to review for this property');
  const decided = new Map(input.reviews.map((r) => [r.url, r.review]));
  const items = row.items.map((i) => ({ ...i, review: decided.get(i.url) ?? i.review }));
  const kept = items.filter((i) => i.review === 'kept').length;
  const update: Record<string, unknown> = { items };
  if (input.note !== undefined) update.staff_note = input.note;
  if (input.share) {
    // Everything dismissed: nothing about this property after all.
    update.status = kept ? 'shared' : 'clear';
    update.reviewed_at = new Date().toISOString();
    update.reviewed_by = ctx.userId;
  }
  must(await ctx.db.from('property_disputes').update(update).eq('property_id', propertyId));
  await audit(
    ctx,
    'legal.disputes_reviewed',
    { type: 'property', id: propertyId },
    {
      kept,
      shared: input.share,
    },
    'staff',
  );
  ok(res, { status: update.status ?? null, kept });
});

/* POST /backoffice/properties/:id/disputes — Pittu checks again now */
legalChecksRouter.post('/properties/:id/disputes', canReview, async (req, res) => {
  const propertyId = uuidParam(req.params.id, 'Property');
  waitUntil(checkDisputes(propertyId));
  ok(res, { status: 'working' }, 202);
});
