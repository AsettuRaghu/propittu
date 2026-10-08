import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import {
  legalCheckCreateSchema,
  legalCheckUpdateSchema,
  legalFindingReviewSchema,
  staffCan,
} from '@propittu/shared';
import { audit } from '../audit.js';
import { auth } from '../auth.js';
import { HttpError, ok, uuidParam } from '../errors.js';
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
