import { waitUntil } from '@vercel/functions';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import {
  legalCheckCreateSchema,
  legalCheckUpdateSchema,
  legalFindingReviewSchema,
  staffCan,
  projectDisputeSchema,
  projectKey,
  type DisputeItem,
  type DisputeReportRow,
  type DisputeReview,
  type ProjectDisputeRow,
} from '@propittu/shared';
import { audit } from '../audit.js';
import { auth } from '../auth.js';
import { HttpError, must, ok, uuidParam } from '../errors.js';
import { checkDisputes } from '../legal/disputes.js';
import { PROJECT_COLUMNS, projectOf, propertiesByProject } from '../legal/projectDisputes.js';
import {
  createEcCheck,
  listChecks,
  loadCheck,
  reviewFinding,
  updateCheck,
} from '../legal/checks.js';
import { notify } from '../notify.js';

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
  if (input.share && kept) notify({ type: 'legal.disputes_shared', propertyId });
  ok(res, { status: update.status ?? null, kept });
});

/* POST /backoffice/properties/:id/disputes — Pittu checks again now */
legalChecksRouter.post('/properties/:id/disputes', canReview, async (req, res) => {
  const propertyId = uuidParam(req.params.id, 'Property');
  waitUntil(checkDisputes(propertyId));
  ok(res, { status: 'working' }, 202);
});

/* ---- Disputes owners told us about, and alerts for a whole project ---- */

const REPORT_COLUMNS =
  'id, account_id, property_id, source, details, status, staff_note, project_dispute_id, created_at, property:properties(name)';

/* GET /backoffice/dispute-reports?status=open|all */
legalChecksRouter.get('/dispute-reports', async (req, res) => {
  const { status = 'open' } = z
    .object({ status: z.enum(['open', 'all']).optional() })
    .parse(req.query);
  const { db } = auth(req);
  let q = db
    .from('dispute_reports')
    .select(REPORT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(200);
  if (status === 'open') q = q.in('status', ['open', 'looking']);
  const rows = must<
    (Omit<DisputeReportRow, 'property_name' | 'project_name'> & {
      property: { name: string } | null;
    })[]
  >(await q);
  const projects = await Promise.all(rows.map((r) => projectOf(db, r.property_id)));
  const data: DisputeReportRow[] = rows.map(({ property, ...r }, i) => ({
    ...r,
    property_name: property?.name ?? 'Property',
    project_name: projects[i]?.name ?? null,
  }));
  ok(res, data);
});

/* PATCH /backoffice/dispute-reports/:id {status, staff_note} — reply to the owner */
legalChecksRouter.patch('/dispute-reports/:id', canReview, async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Report');
  const input = z
    .object({
      status: z.enum(['looking', 'not_found', 'confirmed']).optional(),
      staff_note: z.string().trim().max(2000).nullable().optional(),
    })
    .parse(req.body);
  must(await ctx.db.from('dispute_reports').update(input).eq('id', id));
  await audit(ctx, 'legal.dispute_report_updated', { type: 'dispute_report', id }, input, 'staff');
  if (input.status === 'not_found' || input.staff_note)
    notify({ type: 'legal.dispute_report_replied', reportId: id });
  ok(res, { id, ...input });
});

/* GET /backoffice/project-disputes — with how many of our properties each one reaches */
legalChecksRouter.get('/project-disputes', async (req, res) => {
  const { db } = auth(req);
  const [rows, counts] = await Promise.all([
    db
      .from('project_disputes')
      .select(`${PROJECT_COLUMNS}, project_key`)
      .order('created_at', { ascending: false }),
    propertiesByProject(db),
  ]);
  const data: ProjectDisputeRow[] = must<(ProjectDisputeRow & { project_key: string })[]>(rows).map(
    ({ project_key, ...r }) => ({ ...r, properties: counts.get(project_key) ?? 0 }),
  );
  ok(res, data);
});

/* POST /backoffice/project-disputes — confirm a dispute for every owner in a project */
legalChecksRouter.post('/project-disputes', canReview, async (req, res) => {
  const ctx = auth(req);
  const { report_id, ...input } = projectDisputeSchema.parse(req.body);
  const key = projectKey(input.project_name);
  if (key.length < 3) throw new HttpError(400, 'VALIDATION_FAILED', 'Give the project’s name');
  const row = must<{ id: string }>(
    await ctx.db
      .from('project_disputes')
      .insert({ ...input, project_key: key, created_by: ctx.userId })
      .select('id')
      .single(),
  );
  if (report_id) {
    must(
      await ctx.db
        .from('dispute_reports')
        .update({ status: 'confirmed', project_dispute_id: row.id })
        .eq('id', report_id),
    );
  }
  const reach = (await propertiesByProject(ctx.db)).get(key) ?? 0;
  notify({ type: 'legal.project_dispute', projectDisputeId: row.id });
  await audit(
    ctx,
    'legal.project_dispute_created',
    { type: 'project_dispute', id: row.id },
    {
      project: input.project_name,
      properties: reach,
    },
    'staff',
  );
  ok(res, { id: row.id, properties: reach }, 201);
});

/* PATCH /backoffice/project-disputes/:id — update it, or mark it resolved */
legalChecksRouter.patch('/project-disputes/:id', canReview, async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Dispute');
  const input = projectDisputeSchema
    .omit({ report_id: true, project_name: true })
    .partial()
    .extend({ status: z.enum(['active', 'resolved']).optional() })
    .parse(req.body);
  must(await ctx.db.from('project_disputes').update(input).eq('id', id));
  await audit(
    ctx,
    'legal.project_dispute_updated',
    { type: 'project_dispute', id },
    input,
    'staff',
  );
  ok(res, { id });
});
