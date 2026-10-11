import { waitUntil } from '@vercel/functions';
import { Router } from 'express';
import { disputeReportSchema, type DisputeReport, type PropertyDisputes } from '@propittu/shared';
import { audit } from '../audit.js';
import { auth } from '../auth.js';
import { must, ok, uuidParam } from '../errors.js';
import { listChecks } from '../legal/checks.js';
import { checkDisputes, ownerDisputes } from '../legal/disputes.js';
import { projectAlerts } from '../legal/projectDisputes.js';
import { serviceClient } from '../supabase.js';
import { assertOwnsProperty } from '../ownership.js';
import { aiAvailableFor } from '../pittu/core/limits.js';

/**
 * GET /properties/:id/legal-checks — the customer's shared Pittu Legal
 * checks for a property (row-level security shows only shared ones).
 */
export const legalChecksCustomerRouter = Router();

legalChecksCustomerRouter.get('/properties/:id/legal-checks', async (req, res) => {
  const { db } = auth(req);
  ok(res, await listChecks(db, { propertyId: uuidParam(req.params.id, 'Property') }));
});

/**
 * GET /properties/:id/disputes — court cases and disputes Pittu checked for
 * this property's project and land. Items only once our team has reviewed
 * and shared them; while it's being reviewed the owner sees just that. A
 * check starts by itself when none has run (or it's 90 days old).
 */
legalChecksCustomerRouter.get('/properties/:id/disputes', async (req, res) => {
  const { db, accountId } = auth(req);
  const id = uuidParam(req.params.id, 'Property');
  await assertOwnsProperty(db, accountId, id);
  const [{ disputes, due }, project, reports] = await Promise.all([
    ownerDisputes(id),
    serviceClient ? projectAlerts(serviceClient, id) : Promise.resolve([]),
    db
      .from('dispute_reports')
      .select(
        'id, property_id, source, details, status, staff_note, project_dispute_id, created_at',
      )
      .eq('property_id', id)
      .order('created_at', { ascending: false }),
  ]);
  const extra = { project, reports: must<DisputeReport[]>(reports) };
  if (due && aiAvailableFor(accountId)) {
    waitUntil(checkDisputes(id));
    ok(res, {
      status: 'working',
      items: [],
      note: null,
      checked_at: disputes?.checked_at ?? null,
      ...extra,
    } satisfies PropertyDisputes);
    return;
  }
  ok(
    res,
    disputes || extra.project.length || extra.reports.length
      ? ({
          // No online check (yet): only the project alerts and reports are shown.
          ...(disputes ?? { status: 'failed', items: [], note: null, checked_at: null }),
          ...extra,
        } satisfies PropertyDisputes)
      : null,
  );
});

/**
 * POST /properties/:id/disputes/report — the owner tells us about a dispute
 * they've heard of (from the builder, a call, a notice). The team looks into
 * it and replies here; if it's confirmed for the project, every owner there
 * is told.
 */
legalChecksCustomerRouter.post('/properties/:id/disputes/report', async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Property');
  await assertOwnsProperty(ctx.db, ctx.accountId, id);
  const input = disputeReportSchema.parse(req.body);
  const row = must<DisputeReport>(
    await ctx.db
      .from('dispute_reports')
      .insert({
        account_id: ctx.accountId,
        property_id: id,
        created_by: ctx.userId,
        ...input,
      })
      .select(
        'id, property_id, source, details, status, staff_note, project_dispute_id, created_at',
      )
      .single(),
  );
  await audit(ctx, 'legal.dispute_reported', { type: 'property', id }, { source: input.source });
  ok(res, row, 201);
});
