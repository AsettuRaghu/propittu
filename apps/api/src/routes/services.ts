import { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  createServiceRequestSchema,
  REACH_PROBLEM_TEXT,
  reachProblem,
  uuidSchema,
  type CatalogueService,
  type Service,
  type ServiceRequest,
  type ServiceRequestDetail,
} from '@propittu/shared';
import { auth } from '../auth.js';
import { audit } from '../audit.js';
import { HttpError, invalid, must, notFound, ok, uuidParam } from '../errors.js';
import { assertOwnsProperty } from '../ownership.js';
import { loadReach } from '../reach.js';
import { planOf, type PlanState } from '../plan.js';
import { orderForRequest } from '../billing/orders.js';
import {
  loadInfoTicket,
  loadOutcome,
  loadReport,
  REQUEST_COLUMNS,
  todayInIndia,
} from '../requests.js';

/**
 * Property Care & Services (M4).
 *
 *   Service Catalogue → Included or Extra → Service Request
 *
 * Included vs Extra and the price are decided by the DATABASE function
 * create_service_request(); customers cannot insert requests directly.
 * Usage of an Included Service is consumed when staff confirm it.
 */
export const servicesRouter = Router();

const SERVICE_COLUMNS =
  'id, code, name, category, description, sort_order, price_paise, is_extra_available, fulfilment, reach';

/** Included allowance left per service code for this Account (null = not included). */
async function allowances(
  db: SupabaseClient,
  accountId: string,
  plan: PlanState,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  await Promise.all(
    plan.benefits.included.map(async (b) => {
      const remaining = must<number | null>(
        await db.rpc('included_remaining', { p_account: accountId, p_code: b.code }),
      );
      if (remaining !== null) result.set(b.code, remaining);
    }),
  );
  return result;
}

function withCoverage(service: Service, remaining: Map<string, number>): CatalogueService {
  const left = remaining.has(service.code) ? (remaining.get(service.code) as number) : null;
  return {
    ...service,
    included_remaining: left,
    coverage:
      left !== null && left > 0 ? 'included' : service.is_extra_available ? 'extra' : 'unavailable',
  };
}

/* GET /services — the catalogue, with Included/Extra for this Account */
servicesRouter.get('/services', async (req, res) => {
  const { db, accountId } = auth(req);
  const [rows, remaining] = await Promise.all([
    db
      .from('services')
      .select(SERVICE_COLUMNS)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    allowances(db, accountId, planOf(req)),
  ]);
  ok(
    res,
    must<Service[]>(rows).map((s) => withCoverage(s, remaining)),
  );
});

/* GET /service-requests[?property_id=] — newest first */
const listQuerySchema = z.object({ property_id: uuidSchema.optional() });

servicesRouter.get('/service-requests', async (req, res) => {
  const { db, accountId } = auth(req);
  const { property_id } = listQuerySchema.parse(req.query);

  let query = db
    .from('service_requests')
    .select(REQUEST_COLUMNS)
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });
  if (property_id) query = query.eq('property_id', property_id);

  ok(res, must<ServiceRequest[]>(await query));
});

async function loadRequest(
  db: SupabaseClient,
  accountId: string,
  id: string,
): Promise<ServiceRequestDetail> {
  const row = must<ServiceRequest | null>(
    await db
      .from('service_requests')
      .select(REQUEST_COLUMNS)
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle(),
  );
  if (!row) throw notFound('Service request');
  // RLS shows the customer a report / outcome only once the request is Completed.
  const [report, outcome, infoTicket, order] = await Promise.all([
    loadReport(db, id),
    loadOutcome(db, id),
    loadInfoTicket(db, id),
    orderForRequest(db, id),
  ]);
  return { ...row, report, outcome, info_ticket: infoTicket, order };
}

/* GET /service-requests/:id — with the visit report, if any */
servicesRouter.get('/service-requests/:id', async (req, res) => {
  const { db, accountId } = auth(req);
  ok(res, await loadRequest(db, accountId, uuidParam(req.params.id, 'Service request')));
});

/* POST /service-requests */
servicesRouter.post('/service-requests', async (req, res) => {
  const ctx = auth(req);
  const { db, accountId } = ctx;
  const input = createServiceRequestSchema.parse(req.body);
  if (input.preferred_date && input.preferred_date < todayInIndia()) {
    throw invalid('Choose today or a later date', {
      preferred_date: 'Choose today or a later date',
    });
  }

  await assertOwnsProperty(db, accountId, input.property_id);

  // Clear errors up front; the database function re-checks everything.
  const service = must<Service | null>(
    await db
      .from('services')
      .select(SERVICE_COLUMNS)
      .eq('id', input.service_id)
      .eq('is_active', true)
      .maybeSingle(),
  );
  if (!service) throw invalid('Choose a service', { service_id: 'Choose a service' });
  const problem = reachProblem(service, (await loadReach(db, accountId)).get(input.property_id));
  if (problem) throw new HttpError(403, 'NOT_IN_SERVICE_AREA', REACH_PROBLEM_TEXT[problem]);
  const coverage = withCoverage(service, await allowances(db, accountId, planOf(req))).coverage;
  if (coverage === 'unavailable') {
    throw new HttpError(
      403,
      'FEATURE_NOT_INCLUDED',
      `${service.name} is not included in your plan and is not offered as an extra service.`,
    );
  }

  const id = must<string>(
    await db.rpc('create_service_request', {
      p_property: input.property_id,
      p_service: input.service_id,
      p_description: input.description,
      p_preferred_date: input.preferred_date ?? null,
      p_preferred_slot: input.preferred_slot ?? null,
    }),
  );

  const row = await loadRequest(db, accountId, id);
  await audit(
    ctx,
    'service_request.created',
    { type: 'service_request', id },
    { reference: row.reference, coverage: row.coverage, price_paise: row.price_paise },
  );
  ok(res, row, 201);
});

/* POST /service-requests/:id/cancel — only while still Requested */
servicesRouter.post('/service-requests/:id/cancel', async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Service request');
  const current = await loadRequest(ctx.db, ctx.accountId, id);
  if (current.status !== 'requested') {
    throw new HttpError(
      409,
      'CONFLICT',
      'This request has already been confirmed. Contact support to cancel it.',
    );
  }
  must(await ctx.db.rpc('cancel_service_request', { p_request: id }));
  await audit(ctx, 'service_request.cancelled', { type: 'service_request', id });
  ok(res, await loadRequest(ctx.db, ctx.accountId, id));
});
