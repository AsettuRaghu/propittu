import { randomUUID } from 'node:crypto';
import { dashboardRouter } from './backofficeDashboard.js';
import { plansConsoleRouter } from './backofficePlans.js';
import { reportsRouter } from './backofficeReports.js';
import { cancelOpenLinks } from '../billing/billing.js';
import { Router, type RequestHandler } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  accountStatusSchema,
  createServiceSchema,
  documentStatusSchema,
  extendPlanSchema,
  releaseSlotSchema,
  requestPriceSchema,
  areaPincodesSchema,
  createAreaSchema,
  createStateSchema,
  INDIAN_PINCODE_REGEX,
  reachExceptionSchema,
  updateAreaSchema,
  updateStateSchema,
  type BackofficeCoverage,
  type ReachDemand,
  type ServiceArea,
  type ServiceState,
  type StaffPropertyReach,
  reviewDecisionSchema,
  grantPlanSchema,
  LIMIT_LABELS,
  OPEN_REQUEST_STATUSES,
  outcomeFileIntentSchema,
  outcomeSchema,
  requestFulfilmentSchema,
  requestInfoSchema,
  requestStatusLabel,
  requestTransitions,
  SERVICE_REQUEST_STATUSES,
  staffCan,
  staffRequestUpdateSchema,
  STORAGE_BUCKETS,
  updateServiceSchema,
  visitMediaIntentSchema,
  visitReportSchema,
  type AccountPlanState,
  type AiSummary,
  type BackofficePittu,
  type PropertyReview,
  type ReviewListItem,
  type AuditEntry,
  type PropertySlot,
  type BackofficeAccount,
  type BackofficeAccountDetail,
  type BackofficeOrder,
  type BackofficeTicket,
  type BackofficeTicketDetail,
  type SupportTicket,
  OPEN_TICKET_STATUSES,
  TICKET_STATUSES,
  ticketMessageSchema,
  ticketStatusSchema,
  type BackofficeProperty,
  type BackofficeRequest,
  type BackofficeRequestDetail,
  type Property,
  type ServiceRequest,
  type SignedDownload,
  type StaffPermission,
  type StaffRole,
  type StaffService,
  type OutcomeFile,
  type UploadIntent,
  type VisitMedia,
} from '@propittu/shared';
import { waitUntil } from '@vercel/functions';
import { isRetryableFailure, processAnalysis, requeueFailedAnalysis } from '../ai/jobs.js';
import { auth, type AuthContext } from '../auth.js';
import { loadReach } from '../reach.js';
import { audit } from '../audit.js';
import { env } from '../env.js';
import { HttpError, invalid, must, notFound, ok, uuidParam } from '../errors.js';
import { describeAccountPlan } from '../plan.js';
import { ORDER_COLUMNS, orderForRequest, toOrder, type OrderRow } from '../billing/orders.js';
import { notify } from '../notify.js';
import { confirmAttachment, loadMessages, startAttachment, TICKET_COLUMNS } from './support.js';
import { loadInfoTicket, loadOutcome, loadReport, REQUEST_COLUMNS } from '../requests.js';
import {
  removeObjects,
  signDownload,
  signDownloads,
  signUpload,
  SIGNED_UPLOAD_TTL_SECONDS,
  verifyUploaded,
} from '../storage.js';
import { DOCUMENT_COLUMNS, toDocument, type DocumentRow } from './documents.js';
import { listReadyPhotos } from './photos.js';
import { PROPERTY_COLUMNS, toProperty } from './properties.js';

/**
 * Backoffice (M9) — staff mode inside the app.
 *
 * Three independent checks on every call:
 *   1. requireStaff: an ACTIVE staff_members row, else the route is 404;
 *   2. allow(permission): the staff role may perform this action;
 *   3. RLS / SECURITY DEFINER functions re-check is_staff() in Postgres.
 *
 * Business rules are the same ones customers are subject to: lifecycle
 * and usage live in staff_update_service_request(), Plans in plan.ts.
 * Every staff action is audited against the CUSTOMER's Account.
 */
export const backofficeRouter = Router();

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      staffRole?: StaffRole;
    }
  }
}

const requireStaff: RequestHandler = async (req, _res, next) => {
  const { db, userId } = auth(req);
  const row = must<{ role: StaffRole; is_active: boolean } | null>(
    await db.from('staff_members').select('role, is_active').eq('user_id', userId).maybeSingle(),
  );
  // Not staff → the Backoffice simply does not exist for this caller.
  if (!row?.is_active) throw notFound('Route');
  req.staffRole = row.role;
  next();
};

const allow =
  (permission: StaffPermission): RequestHandler =>
  (req, _res, next) => {
    if (staffCan(req.staffRole, permission)) return next();
    throw new HttpError(403, 'FORBIDDEN', 'Your staff role does not allow this action');
  };

backofficeRouter.use(requireStaff);
backofficeRouter.use(dashboardRouter);
backofficeRouter.use(reportsRouter);
backofficeRouter.use(plansConsoleRouter);

const staffAudit = (
  ctx: AuthContext,
  action: string,
  accountId: string,
  entity?: { type: string; id: string },
  data: Record<string, unknown> = {},
) => audit(ctx, action, entity, data, 'staff', accountId);

/* ================================================================== *
 * Accounts
 * ================================================================== */

const ACCOUNT_COLUMNS =
  'id, status, created_at, phone, full_name, property_count, open_request_count, ' +
  'plan_code, plan_name, plan_source, plan_ends_at';

async function loadAccount(db: SupabaseClient, accountId: string): Promise<BackofficeAccount> {
  const row = must<BackofficeAccount | null>(
    await db.from('backoffice_accounts').select(ACCOUNT_COLUMNS).eq('id', accountId).maybeSingle(),
  );
  if (!row) throw notFound('Account');
  return row;
}

/** M9: "staff should be able to understand WHY a customer cannot perform an action". */
function blockedReason(account: BackofficeAccount, plan: AccountPlanState): string | null {
  const reasons: string[] = [];
  if (account.status !== 'active') {
    reasons.push(`Account is ${account.status}: the customer cannot use the app.`);
  }
  if (plan.access === 'limited') {
    reasons.push(
      'No active plan or trial (Limited Access): the customer can only see their account and plans.',
    );
  }
  if (plan.over_limit.length > 0) {
    reasons.push(
      `Over plan limits (${plan.over_limit.map((c) => LIMIT_LABELS[c]).join(', ')}): ` +
        'existing data can be viewed, edited and deleted, but nothing more can be added.',
    );
  }
  return reasons.length > 0 ? reasons.join(' ') : null;
}

/* GET /backoffice/accounts?q= — phone digits, name, or account id */
const searchSchema = z.object({ q: z.string().trim().max(80).optional() });

backofficeRouter.get('/accounts', async (req, res) => {
  const { db } = auth(req);
  const { q } = searchSchema.parse(req.query);

  let query = db
    .from('backoffice_accounts')
    .select(ACCOUNT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(q ? 50 : 500);
  if (q) {
    const digits = q.replace(/\D/g, '');
    if (z.guid().safeParse(q).success) query = query.eq('id', q);
    else if (digits.length >= 3) query = query.ilike('phone', `%${digits.slice(-10)}%`);
    else query = query.ilike('full_name', `%${q.replace(/[%_]/g, '')}%`);
  }
  ok(res, must<BackofficeAccount[]>(await query));
});

/* GET /backoffice/accounts/:accountId — account, Plan, usage, properties, requests */
backofficeRouter.get('/accounts/:accountId', async (req, res) => {
  const { db } = auth(req);
  const accountId = uuidParam(req.params.accountId, 'Account');
  const account = await loadAccount(db, accountId);

  const [plan, properties, requests, orders] = await Promise.all([
    describeAccountPlan(db, accountId),
    db
      .from('property_summaries')
      .select('id, name, property_type, city, document_count, photo_count, video_count')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false }),
    listRequests(db, { accountId }),
    db
      .from('orders')
      .select(ORDER_COLUMNS)
      .eq('account_id', accountId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const data: BackofficeAccountDetail = {
    account,
    plan,
    blocked_reason: blockedReason(account, plan),
    properties: must<BackofficeAccountDetail['properties']>(properties),
    requests,
    orders: must<OrderRow[]>(orders).map(toOrder),
  };
  ok(res, data);
});

/* POST /backoffice/accounts/:accountId/status {status: active|suspended} */
backofficeRouter.post('/accounts/:accountId/status', allow('accounts.status'), async (req, res) => {
  const ctx = auth(req);
  const accountId = uuidParam(req.params.accountId, 'Account');
  const { status } = accountStatusSchema.parse(req.body);
  await loadAccount(ctx.db, accountId);

  must(await ctx.db.from('accounts').update({ status }).eq('id', accountId));
  await staffAudit(
    ctx,
    `staff.account.${status === 'active' ? 'reactivated' : 'suspended'}`,
    accountId,
  );
  ok(res, await loadAccount(ctx.db, accountId));
});

/*
 * GET /backoffice/accounts/:accountId/activity?kind=events|changes|all — the
 * account's audit trail, newest first (M11). Business events by default.
 */
const activitySchema = z.object({ kind: z.enum(['events', 'changes', 'all']).default('events') });

backofficeRouter.get('/accounts/:accountId/activity', async (req, res) => {
  const { db } = auth(req);
  const accountId = uuidParam(req.params.accountId, 'Account');
  const { kind } = activitySchema.parse(req.query);
  let q = db
    .from('audit_events')
    .select(
      'id, created_at, actor_type, actor_user_id, action, entity_type, entity_id, data, request_id',
    )
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (kind === 'events') q = q.not('action', 'like', 'db.%');
  if (kind === 'changes') q = q.like('action', 'db.%');
  const rows = must<
    (Omit<AuditEntry, 'actor_name' | 'changes'> & {
      actor_user_id: string | null;
      data: { changes?: AuditEntry['changes'] } | null;
    })[]
  >(await q);
  const ids = [...new Set(rows.flatMap((r) => (r.actor_user_id ? [r.actor_user_id] : [])))];
  const people =
    ids.length === 0
      ? []
      : must<{ id: string; full_name: string | null; phone: string }[]>(
          await db.from('profiles').select('id, full_name, phone').in('id', ids),
        );
  const name = new Map(people.map((p) => [p.id, p.full_name || p.phone || null]));
  const data: AuditEntry[] = rows.map(({ actor_user_id, data: d, ...r }) => ({
    ...r,
    actor_name: actor_user_id ? (name.get(actor_user_id) ?? null) : null,
    changes: d?.changes ?? null,
  }));
  ok(res, data);
});

/* GET /backoffice/accounts/:accountId/slots — property slots in the current term */
backofficeRouter.get('/accounts/:accountId/slots', async (req, res) => {
  const { db } = auth(req);
  const accountId = uuidParam(req.params.accountId, 'Account');
  await loadAccount(db, accountId);
  const plan = await describeAccountPlan(db, accountId); // also claims slots for existing properties
  const since = plan.current ? plan.current.starts_at : null;
  if (!since) return ok(res, [] as PropertySlot[]);
  const window = must<{ usage_since: string | null; starts_at: string } | null>(
    await db
      .from('account_plans')
      .select('usage_since, starts_at')
      .eq('id', plan.current!.id)
      .maybeSingle(),
  );
  const start = window?.usage_since ?? window?.starts_at ?? since;
  const rows = must<PropertySlot[]>(
    await db
      .from('property_slots')
      .select(
        'id, property_id, property_name, claimed_at, property_deleted_at, released_at, release_reason',
      )
      .eq('account_id', accountId)
      .gte('claimed_at', start)
      .order('claimed_at'),
  );
  ok(res, rows);
});

/* POST /backoffice/slots/:slotId/release {reason} — free a slot, case by case */
backofficeRouter.post('/slots/:slotId/release', allow('plans.manage'), async (req, res) => {
  const ctx = auth(req);
  const slotId = uuidParam(req.params.slotId, 'Slot');
  const { reason } = releaseSlotSchema.parse(req.body);
  const slot = must<{ account_id: string } | null>(
    await ctx.db.from('property_slots').select('account_id').eq('id', slotId).maybeSingle(),
  );
  if (!slot) throw notFound('Slot');
  must(await ctx.db.rpc('staff_release_property_slot', { p_slot: slotId, p_reason: reason }));
  await staffAudit(
    ctx,
    'staff.property_slot.released',
    slot.account_id,
    { type: 'property_slot', id: slotId },
    { reason },
  );
  ok(res, { released: true });
});

/* GET /backoffice/accounts/:accountId/plan */
backofficeRouter.get('/accounts/:accountId/plan', async (req, res) => {
  const { db } = auth(req);
  const accountId = uuidParam(req.params.accountId, 'Account');
  await loadAccount(db, accountId);
  ok(res, await describeAccountPlan(db, accountId));
});

/*
 * POST /backoffice/accounts/:accountId/plan/end — ends the current Plan
 * (or Trial) now. The Account drops to Limited Access; data is kept.
 */
backofficeRouter.post('/accounts/:accountId/plan/end', allow('plans.manage'), async (req, res) => {
  const ctx = auth(req);
  const accountId = uuidParam(req.params.accountId, 'Account');
  await loadAccount(ctx.db, accountId);

  const now = new Date().toISOString();
  const ended = must<{ id: string }[]>(
    await ctx.db
      .from('account_plans')
      .update({ ends_at: now })
      .eq('account_id', accountId)
      .lte('starts_at', now)
      .gt('ends_at', now)
      .select('id'),
  );
  await staffAudit(ctx, 'staff.plan.ended', accountId, undefined, {
    ended: ended.map((r) => r.id),
  });
  ok(res, await describeAccountPlan(ctx.db, accountId));
});

/*
 * POST /backoffice/accounts/:accountId/plan/extend {days} — adds days to
 * what is in force (a paid period stays paid; anything queued moves too).
 */
backofficeRouter.post(
  '/accounts/:accountId/plan/extend',
  allow('plans.manage'),
  async (req, res) => {
    const ctx = auth(req);
    const accountId = uuidParam(req.params.accountId, 'Account');
    const { days } = extendPlanSchema.parse(req.body);
    await loadAccount(ctx.db, accountId);
    const { data, error } = await ctx.db.rpc('staff_extend_plan', {
      p_account: accountId,
      p_days: days,
    });
    if (error?.code === 'P0002') {
      throw new HttpError(409, 'CONFLICT', 'There is no plan in force — give a plan instead.');
    }
    const planId = must<string>({ data, error });
    await staffAudit(
      ctx,
      'staff.plan.extended',
      accountId,
      { type: 'account_plan', id: planId },
      { days },
    );
    ok(res, await describeAccountPlan(ctx.db, accountId));
  },
);

/*
 * POST /backoffice/accounts/:accountId/plan {plan_code, days?} — grants a
 * Plan (current version) starting now, replacing whatever is in force.
 */
backofficeRouter.post('/accounts/:accountId/plan', allow('plans.manage'), async (req, res) => {
  const ctx = auth(req);
  const accountId = uuidParam(req.params.accountId, 'Account');
  const input = grantPlanSchema.parse(req.body);
  await loadAccount(ctx.db, accountId);

  const version = must<{ id: string; term_days: number; plan: { code: string } } | null>(
    await ctx.db
      .from('plan_versions')
      .select('id, term_days, plan:plans!inner(code)')
      .eq('plan.code', input.plan_code)
      .eq('is_current', true)
      .maybeSingle(),
  );
  if (!version) throw notFound('Plan');

  const now = new Date();
  const ends = new Date(now.getTime() + (input.days ?? version.term_days) * 86_400_000);

  // End what is in force, then start the grant.
  must(
    await ctx.db
      .from('account_plans')
      .update({ ends_at: now.toISOString() })
      .eq('account_id', accountId)
      .lte('starts_at', now.toISOString())
      .gt('ends_at', now.toISOString()),
  );
  const row = must<{ id: string }>(
    await ctx.db
      .from('account_plans')
      .insert({
        account_id: accountId,
        plan_version_id: version.id,
        source: 'staff',
        starts_at: now.toISOString(),
        ends_at: ends.toISOString(),
      })
      .select('id')
      .single(),
  );
  await staffAudit(
    ctx,
    'staff.plan.granted',
    accountId,
    { type: 'account_plan', id: row.id },
    { plan_code: input.plan_code, ends_at: ends.toISOString() },
  );
  ok(res, await describeAccountPlan(ctx.db, accountId), 201);
});

/* ================================================================== *
 * Service Requests
 * ================================================================== */

const BO_REQUEST_COLUMNS = `${REQUEST_COLUMNS}, account_id, user_id`;

type RequestRow = ServiceRequest & { account_id: string; user_id: string };

async function withCustomers(db: SupabaseClient, rows: RequestRow[]): Promise<BackofficeRequest[]> {
  const ids = [...new Set(rows.map((r) => r.user_id))];
  const profiles =
    ids.length === 0
      ? []
      : must<{ id: string; phone: string; full_name: string | null }[]>(
          await db.from('profiles').select('id, phone, full_name').in('id', ids),
        );
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return rows.map(({ user_id, ...r }) => ({
    ...r,
    customer_phone: byId.get(user_id)?.phone || null,
    customer_name: byId.get(user_id)?.full_name ?? null,
  }));
}

async function listRequests(
  db: SupabaseClient,
  filter: { accountId?: string; status?: string },
): Promise<BackofficeRequest[]> {
  let query = db
    .from('service_requests')
    .select(BO_REQUEST_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(300);
  if (filter.accountId) query = query.eq('account_id', filter.accountId);
  if (filter.status === 'open') query = query.in('status', OPEN_REQUEST_STATUSES);
  else if (filter.status && filter.status !== 'all') query = query.eq('status', filter.status);
  return withCustomers(db, must<RequestRow[]>(await query));
}

async function loadRequestRow(db: SupabaseClient, id: string): Promise<RequestRow> {
  const row = must<RequestRow | null>(
    await db.from('service_requests').select(BO_REQUEST_COLUMNS).eq('id', id).maybeSingle(),
  );
  if (!row) throw notFound('Service request');
  return row;
}

async function loadRequestDetail(db: SupabaseClient, id: string): Promise<BackofficeRequestDetail> {
  const row = await loadRequestRow(db, id);
  const [[request], report, outcome, infoTicket, address, order] = await Promise.all([
    withCustomers(db, [row]),
    loadReport(db, id),
    loadOutcome(db, id),
    loadInfoTicket(db, id),
    row.property
      ? db
          .from('properties')
          .select('address_line, city, state, pincode')
          .eq('id', row.property.id)
          .maybeSingle()
      : Promise.resolve(null),
    orderForRequest(db, id),
  ]);
  const a = address
    ? must<{
        address_line: string | null;
        city: string | null;
        state: string | null;
        pincode: string | null;
      } | null>(address)
    : null;
  const propertyAddress = a
    ? [a.address_line, a.city, a.state, a.pincode].filter(Boolean).join(', ') || null
    : null;
  return {
    ...(request as BackofficeRequest),
    report,
    outcome,
    info_ticket: infoTicket,
    property_address: propertyAddress,
    order,
  };
}

/* GET /backoffice/requests?status=open|all|<status> */
const requestListSchema = z.object({
  status: z.enum(['open', 'all', ...SERVICE_REQUEST_STATUSES]).default('open'),
});

backofficeRouter.get('/requests', async (req, res) => {
  const { db } = auth(req);
  const { status } = requestListSchema.parse(req.query);
  ok(res, await listRequests(db, { status }));
});

/* GET /backoffice/requests/:id */
backofficeRouter.get('/requests/:id', async (req, res) => {
  const { db } = auth(req);
  ok(res, await loadRequestDetail(db, uuidParam(req.params.id, 'Service request')));
});

/*
 * POST /backoffice/requests/:id/status {status, scheduled_for?, note?}
 * Confirming an Included request consumes usage; cancelling releases it.
 */
backofficeRouter.post('/requests/:id/status', allow('requests.manage'), async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Service request');
  const input = staffRequestUpdateSchema.parse(req.body);
  const current = await loadRequestRow(ctx.db, id);

  if (!requestTransitions(current.fulfilment, current.status).includes(input.status)) {
    throw new HttpError(
      409,
      'CONFLICT',
      `A ${requestStatusLabel(current.status, current.fulfilment)} request cannot be moved to ${requestStatusLabel(input.status, current.fulfilment)}.`,
    );
  }

  must(
    await ctx.db.rpc('staff_update_service_request', {
      p_request: id,
      p_status: input.status,
      p_scheduled_for: input.scheduled_for ?? null,
      p_note: input.note ?? null,
    }),
  );
  await staffAudit(
    ctx,
    `staff.service_request.${input.status}`,
    current.account_id,
    { type: 'service_request', id },
    { from: current.status, to: input.status, scheduled_for: input.scheduled_for ?? null },
  );
  const detail = await loadRequestDetail(ctx.db, id);
  notify({ type: 'service_request.status_changed', requestId: id, status: input.status });
  if (input.status === 'completed' && detail.report) {
    notify({ type: 'visit_report.published', requestId: id });
  }
  if (input.status === 'completed' && detail.outcome) {
    notify({ type: 'service_outcome.published', requestId: id });
  }
  ok(res, detail);
});

/* PUT /backoffice/requests/:id/report — create or update the visit report */
backofficeRouter.put('/requests/:id/report', allow('requests.manage'), async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Service request');
  const input = visitReportSchema.parse(req.body);
  const request = await loadRequestRow(ctx.db, id);
  assertReportEditable(request.status);
  if (request.fulfilment !== 'visit') {
    throw new HttpError(
      409,
      'CONFLICT',
      'Paperwork requests get an outcome summary, not a visit report.',
    );
  }

  const existing = must<{ id: string } | null>(
    await ctx.db.from('visit_reports').select('id').eq('service_request_id', id).maybeSingle(),
  );
  if (existing) {
    // The database keeps the previous version in visit_report_revisions.
    must(
      await ctx.db
        .from('visit_reports')
        .update({ ...input, updated_by: ctx.userId })
        .eq('id', existing.id),
    );
  } else {
    must(
      await ctx.db.from('visit_reports').insert({
        ...input,
        service_request_id: id,
        account_id: request.account_id,
        property_id: request.property?.id ?? null,
        created_by: ctx.userId,
      }),
    );
  }
  await staffAudit(ctx, 'staff.visit_report.saved', request.account_id, {
    type: 'service_request',
    id,
  });
  ok(res, await loadRequestDetail(ctx.db, id));
});

/* ---- Visit media: same signed-URL intent/confirm flow as property photos ---- */

const MEDIA_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};
const mediaBucket = (kind: 'photo' | 'video') =>
  kind === 'photo' ? STORAGE_BUCKETS.photos : STORAGE_BUCKETS.videos;

interface MediaRow {
  id: string;
  report_id: string;
  account_id: string;
  kind: 'photo' | 'video';
  storage_path: string;
  mime_type: string;
  upload_status: 'pending' | 'ready';
  created_at: string;
}
const MEDIA_COLUMNS =
  'id, report_id, account_id, kind, storage_path, mime_type, upload_status, created_at';

/**
 * Draft while the request is open; published and LOCKED once Completed
 * (product decision 2026-10-05). RLS enforces the same rule.
 */
function assertReportEditable(status: ServiceRequest['status']): void {
  if (status === 'requested') {
    throw new HttpError(409, 'CONFLICT', 'Confirm the request before writing its report.');
  }
  if (status === 'completed') {
    throw new HttpError(
      409,
      'CONFLICT',
      'This report was published to the customer when the request was completed and is now locked.',
    );
  }
  if (status === 'cancelled') {
    throw new HttpError(409, 'CONFLICT', 'This request was cancelled.');
  }
}

async function reportFor(db: SupabaseClient, requestId: string) {
  assertReportEditable((await loadRequestRow(db, requestId)).status);
  const report = must<{ id: string; account_id: string } | null>(
    await db
      .from('visit_reports')
      .select('id, account_id')
      .eq('service_request_id', requestId)
      .maybeSingle(),
  );
  if (!report) throw new HttpError(409, 'CONFLICT', 'Save the visit report before adding media.');
  return report;
}

async function mediaFor(db: SupabaseClient, requestId: string, mediaId: string): Promise<MediaRow> {
  const report = await reportFor(db, requestId);
  const row = must<MediaRow | null>(
    await db
      .from('visit_report_media')
      .select(MEDIA_COLUMNS)
      .eq('id', mediaId)
      .eq('report_id', report.id)
      .maybeSingle(),
  );
  if (!row) throw notFound('Media');
  return row;
}

/* POST /backoffice/requests/:id/report/media/intent {kind, mime_type, file_size} */
backofficeRouter.post(
  '/requests/:id/report/media/intent',
  allow('requests.manage'),
  async (req, res) => {
    const ctx = auth(req);
    const id = uuidParam(req.params.id, 'Service request');
    const input = visitMediaIntentSchema.parse(req.body);
    const report = await reportFor(ctx.db, id);

    // Customer's account folder → the customer can read it; the API picks the path.
    const storagePath = `${report.account_id}/visits/${id}/${randomUUID()}.${MEDIA_EXT[input.mime_type]}`;
    const row = must<{ id: string }>(
      await ctx.db
        .from('visit_report_media')
        .insert({
          report_id: report.id,
          account_id: report.account_id,
          kind: input.kind,
          storage_path: storagePath,
          mime_type: input.mime_type,
          file_size: input.file_size,
          created_by: ctx.userId,
        })
        .select('id')
        .single(),
    );

    let uploadUrl: string;
    try {
      uploadUrl = await signUpload(ctx.db, mediaBucket(input.kind), storagePath);
    } catch (err) {
      await ctx.db.from('visit_report_media').delete().eq('id', row.id);
      throw err;
    }
    const data: UploadIntent = {
      id: row.id,
      upload_url: uploadUrl,
      expires_in: SIGNED_UPLOAD_TTL_SECONDS,
    };
    ok(res, data, 201);
  },
);

/* POST /backoffice/requests/:id/report/media/:mediaId/confirm — idempotent */
backofficeRouter.post(
  '/requests/:id/report/media/:mediaId/confirm',
  allow('requests.manage'),
  async (req, res) => {
    const ctx = auth(req);
    const id = uuidParam(req.params.id, 'Service request');
    const row = await mediaFor(ctx.db, id, uuidParam(req.params.mediaId, 'Media'));
    const bucket = mediaBucket(row.kind);

    if (row.upload_status !== 'ready') {
      try {
        await verifyUploaded(ctx.db, bucket, row.storage_path, row.mime_type);
      } catch (err) {
        if (err instanceof HttpError && err.code === 'UNSUPPORTED_FILE_TYPE') {
          await ctx.db.from('visit_report_media').delete().eq('id', row.id);
        }
        throw err;
      }
      must(
        await ctx.db.from('visit_report_media').update({ upload_status: 'ready' }).eq('id', row.id),
      );
      await staffAudit(ctx, 'staff.visit_media.uploaded', row.account_id, {
        type: 'visit_media',
        id: row.id,
      });
    }

    const urls = await signDownloads(ctx.db, bucket, [row.storage_path]);
    const data: VisitMedia = {
      id: row.id,
      kind: row.kind,
      mime_type: row.mime_type,
      url: urls.get(row.storage_path) ?? null,
      created_at: row.created_at,
    };
    ok(res, data);
  },
);

/* DELETE /backoffice/requests/:id/report/media/:mediaId */
backofficeRouter.delete(
  '/requests/:id/report/media/:mediaId',
  allow('requests.manage'),
  async (req, res) => {
    const ctx = auth(req);
    const id = uuidParam(req.params.id, 'Service request');
    const row = await mediaFor(ctx.db, id, uuidParam(req.params.mediaId, 'Media'));
    await removeObjects(ctx.db, mediaBucket(row.kind), [row.storage_path]).catch(() => undefined);
    must(await ctx.db.from('visit_report_media').delete().eq('id', row.id));
    await staffAudit(ctx, 'staff.visit_media.deleted', row.account_id, {
      type: 'visit_media',
      id: row.id,
    });
    res.status(204).end();
  },
);

/* ================================================================== *
 * Paperwork help: ask the customer, outcome summary, result files
 * ================================================================== */

/*
 * POST /backoffice/requests/:id/ask {message} — "Need info from you".
 * Asks in the request's support ticket (created on first use); the
 * customer's reply there moves the request back to "Working on it".
 */
backofficeRouter.post('/requests/:id/ask', allow('requests.manage'), async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Service request');
  const { message } = requestInfoSchema.parse(req.body);
  const current = await loadRequestRow(ctx.db, id);
  if (!requestTransitions(current.fulfilment, current.status).includes('awaiting_customer')) {
    throw new HttpError(
      409,
      'CONFLICT',
      current.fulfilment === 'visit'
        ? 'On-site requests do not use “Need info from you”. Message the customer from Support instead.'
        : `A ${requestStatusLabel(current.status, current.fulfilment)} request cannot wait on the customer.`,
    );
  }
  const ticketId = must<string>(
    await ctx.db.rpc('staff_request_info', { p_request: id, p_message: message }),
  );
  await staffAudit(
    ctx,
    'staff.service_request.info_requested',
    current.account_id,
    { type: 'service_request', id },
    { ticket_id: ticketId },
  );
  notify({ type: 'service_request.info_requested', requestId: id, ticketId });
  ok(res, await loadRequestDetail(ctx.db, id));
});

/* POST /backoffice/requests/:id/fulfilment {fulfilment} — switch on-site ⇄ paperwork */
/* POST /backoffice/requests/:id/price {price_paise} — the quote for an "On quote" request */
backofficeRouter.post('/requests/:id/price', allow('requests.manage'), async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Service request');
  const { price_paise } = requestPriceSchema.parse(req.body);
  const current = await loadRequestRow(ctx.db, id);
  // A new price replaces any open order: its payment link must not stay payable.
  await cancelOpenLinks({ kind: 'extra_service', requestId: id });
  const { error } = await ctx.db.rpc('staff_set_request_price', {
    p_request: id,
    p_price_paise: price_paise,
  });
  if (error?.code === '23514' || error?.code === '22023') {
    throw new HttpError(409, 'CONFLICT', error.message);
  }
  must({ data: null, error });
  await staffAudit(
    ctx,
    'staff.service_request.priced',
    current.account_id,
    { type: 'service_request', id },
    { price_paise },
  );
  ok(res, await loadRequestDetail(ctx.db, id));
});

backofficeRouter.post('/requests/:id/fulfilment', allow('requests.manage'), async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Service request');
  const { fulfilment } = requestFulfilmentSchema.parse(req.body);
  const current = await loadRequestRow(ctx.db, id);
  if (current.fulfilment !== fulfilment) {
    const { error } = await ctx.db.rpc('staff_set_request_fulfilment', {
      p_request: id,
      p_fulfilment: fulfilment,
    });
    if (error?.code === '23514') throw new HttpError(409, 'CONFLICT', error.message);
    must({ data: null, error });
    await staffAudit(
      ctx,
      'staff.service_request.fulfilment_changed',
      current.account_id,
      { type: 'service_request', id },
      { from: current.fulfilment, to: fulfilment },
    );
  }
  ok(res, await loadRequestDetail(ctx.db, id));
});

async function assistanceRequest(db: SupabaseClient, requestId: string) {
  const request = await loadRequestRow(db, requestId);
  assertReportEditable(request.status);
  if (request.fulfilment !== 'assistance') {
    throw new HttpError(
      409,
      'CONFLICT',
      'On-site requests get a visit report, not an outcome summary.',
    );
  }
  return request;
}

/* PUT /backoffice/requests/:id/outcome — create or update the outcome summary (draft) */
backofficeRouter.put('/requests/:id/outcome', allow('requests.manage'), async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Service request');
  const input = outcomeSchema.parse(req.body);
  const request = await assistanceRequest(ctx.db, id);

  const existing = must<{ id: string } | null>(
    await ctx.db.from('service_outcomes').select('id').eq('service_request_id', id).maybeSingle(),
  );
  if (existing) {
    must(
      await ctx.db
        .from('service_outcomes')
        .update({ ...input, updated_by: ctx.userId })
        .eq('id', existing.id),
    );
  } else {
    must(
      await ctx.db.from('service_outcomes').insert({
        ...input,
        service_request_id: id,
        account_id: request.account_id,
        property_id: request.property?.id ?? null,
        created_by: ctx.userId,
      }),
    );
  }
  await staffAudit(ctx, 'staff.service_outcome.saved', request.account_id, {
    type: 'service_request',
    id,
  });
  ok(res, await loadRequestDetail(ctx.db, id));
});

const DOC_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

interface OutcomeFileRow {
  id: string;
  outcome_id: string;
  account_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  document_type: OutcomeFile['document_type'];
  upload_status: 'pending' | 'ready';
  property_document_id: string | null;
}
const OUTCOME_FILE_COLUMNS =
  'id, outcome_id, account_id, file_name, storage_path, mime_type, file_size, document_type, ' +
  'upload_status, property_document_id';

async function outcomeFor(db: SupabaseClient, requestId: string) {
  const request = await assistanceRequest(db, requestId);
  const outcome = must<{ id: string; account_id: string } | null>(
    await db
      .from('service_outcomes')
      .select('id, account_id')
      .eq('service_request_id', requestId)
      .maybeSingle(),
  );
  if (!outcome)
    throw new HttpError(409, 'CONFLICT', 'Save the outcome summary before adding files.');
  return { request, outcome };
}

async function outcomeFileFor(
  db: SupabaseClient,
  requestId: string,
  fileId: string,
): Promise<OutcomeFileRow> {
  const { outcome } = await outcomeFor(db, requestId);
  const row = must<OutcomeFileRow | null>(
    await db
      .from('service_outcome_files')
      .select(OUTCOME_FILE_COLUMNS)
      .eq('id', fileId)
      .eq('outcome_id', outcome.id)
      .maybeSingle(),
  );
  if (!row) throw notFound('File');
  return row;
}

/* POST /backoffice/requests/:id/outcome/files/intent {file_name, mime_type, file_size, document_type} */
backofficeRouter.post(
  '/requests/:id/outcome/files/intent',
  allow('requests.manage'),
  async (req, res) => {
    const ctx = auth(req);
    const id = uuidParam(req.params.id, 'Service request');
    const input = outcomeFileIntentSchema.parse(req.body);
    const { request, outcome } = await outcomeFor(ctx.db, id);

    // Under the property folder, so completing can save it into Documents as is.
    const folder = request.property
      ? `${outcome.account_id}/${request.property.id}`
      : outcome.account_id;
    const storagePath = `${folder}/outcomes/${id}/${randomUUID()}.${DOC_EXT[input.mime_type]}`;
    const row = must<{ id: string }>(
      await ctx.db
        .from('service_outcome_files')
        .insert({
          outcome_id: outcome.id,
          account_id: outcome.account_id,
          file_name: input.file_name,
          storage_path: storagePath,
          mime_type: input.mime_type,
          file_size: input.file_size,
          document_type: request.property ? input.document_type : null,
          created_by: ctx.userId,
        })
        .select('id')
        .single(),
    );

    let uploadUrl: string;
    try {
      uploadUrl = await signUpload(ctx.db, STORAGE_BUCKETS.documents, storagePath);
    } catch (err) {
      await ctx.db.from('service_outcome_files').delete().eq('id', row.id);
      throw err;
    }
    const data: UploadIntent = {
      id: row.id,
      upload_url: uploadUrl,
      expires_in: SIGNED_UPLOAD_TTL_SECONDS,
    };
    ok(res, data, 201);
  },
);

/* POST /backoffice/requests/:id/outcome/files/:fileId/confirm — idempotent */
backofficeRouter.post(
  '/requests/:id/outcome/files/:fileId/confirm',
  allow('requests.manage'),
  async (req, res) => {
    const ctx = auth(req);
    const id = uuidParam(req.params.id, 'Service request');
    const row = await outcomeFileFor(ctx.db, id, uuidParam(req.params.fileId, 'File'));
    if (row.upload_status !== 'ready') {
      try {
        await verifyUploaded(ctx.db, STORAGE_BUCKETS.documents, row.storage_path, row.mime_type);
      } catch (err) {
        if (err instanceof HttpError && err.code === 'UNSUPPORTED_FILE_TYPE') {
          await ctx.db.from('service_outcome_files').delete().eq('id', row.id);
        }
        throw err;
      }
      must(
        await ctx.db
          .from('service_outcome_files')
          .update({ upload_status: 'ready' })
          .eq('id', row.id),
      );
      await staffAudit(ctx, 'staff.outcome_file.uploaded', row.account_id, {
        type: 'outcome_file',
        id: row.id,
      });
    }
    ok(res, await loadRequestDetail(ctx.db, id));
  },
);

/* DELETE /backoffice/requests/:id/outcome/files/:fileId */
backofficeRouter.delete(
  '/requests/:id/outcome/files/:fileId',
  allow('requests.manage'),
  async (req, res) => {
    const ctx = auth(req);
    const id = uuidParam(req.params.id, 'Service request');
    const row = await outcomeFileFor(ctx.db, id, uuidParam(req.params.fileId, 'File'));
    await removeObjects(ctx.db, STORAGE_BUCKETS.documents, [row.storage_path]).catch(
      () => undefined,
    );
    must(await ctx.db.from('service_outcome_files').delete().eq('id', row.id));
    await staffAudit(ctx, 'staff.outcome_file.deleted', row.account_id, {
      type: 'outcome_file',
      id: row.id,
    });
    res.status(204).end();
  },
);

/* ================================================================== *
 * Properties and document review
 * ================================================================== */

/* GET /backoffice/properties/:id — details, photos, documents (all statuses) */
backofficeRouter.get('/properties/:id', async (req, res) => {
  const { db } = auth(req);
  const id = uuidParam(req.params.id, 'Property');
  const row = must<(Property & { account_id: string }) | null>(
    await db
      .from('properties')
      .select(`${PROPERTY_COLUMNS}, account_id`)
      .eq('id', id)
      .maybeSingle(),
  );
  if (!row) throw notFound('Property');
  const { account_id: accountId, ...property } = row;

  const [photos, documents] = await Promise.all([
    listReadyPhotos(db, accountId, id),
    db
      .from('property_documents')
      .select(DOCUMENT_COLUMNS)
      .eq('property_id', id)
      .eq('upload_status', 'ready')
      .order('created_at', { ascending: false }),
  ]);

  const data: BackofficeProperty = {
    property: toProperty(property as Property),
    account_id: accountId,
    photos,
    documents: must<DocumentRow[]>(documents).map(toDocument),
    pittu: await loadPittu(db, id),
    reach: await loadStaffReach(db, accountId, id),
  };
  ok(res, data);
});

async function loadDocument(db: SupabaseClient, id: string) {
  const row = must<{
    id: string;
    account_id: string;
    file_name: string;
    mime_type: string;
    storage_path: string;
  } | null>(
    await db
      .from('property_documents')
      .select('id, account_id, file_name, mime_type, storage_path')
      .eq('id', id)
      .eq('upload_status', 'ready')
      .maybeSingle(),
  );
  if (!row) throw notFound('Document');
  return row;
}

/* GET /backoffice/documents/:id/download — short-lived signed URL */
backofficeRouter.get('/documents/:id/download', async (req, res) => {
  const ctx = auth(req);
  const doc = await loadDocument(ctx.db, uuidParam(req.params.id, 'Document'));
  const url = await signDownload(ctx.db, STORAGE_BUCKETS.documents, doc.storage_path);
  await staffAudit(ctx, 'staff.document.viewed', doc.account_id, { type: 'document', id: doc.id });
  const data: SignedDownload = {
    url,
    file_name: doc.file_name,
    mime_type: doc.mime_type,
    expires_in: env.SIGNED_DOWNLOAD_TTL_SECONDS,
  };
  ok(res, data);
});

/* POST /backoffice/documents/:id/status {status} — document review (M3) */
backofficeRouter.post('/documents/:id/status', allow('documents.review'), async (req, res) => {
  const ctx = auth(req);
  const doc = await loadDocument(ctx.db, uuidParam(req.params.id, 'Document'));
  const { status } = documentStatusSchema.parse(req.body);
  must(await ctx.db.rpc('staff_set_document_status', { p_document: doc.id, p_status: status }));
  await staffAudit(
    ctx,
    'staff.document.status',
    doc.account_id,
    { type: 'document', id: doc.id },
    {
      status,
    },
  );
  const row = must<DocumentRow>(
    await ctx.db.from('property_documents').select(DOCUMENT_COLUMNS).eq('id', doc.id).single(),
  );
  ok(res, toDocument(row));
});

/* ================================================================== *
 * Service Catalogue
 * ================================================================== */

const STAFF_SERVICE_COLUMNS =
  'id, code, name, category, description, sort_order, price_paise, is_extra_available, fulfilment, reach, includes, turnaround, payment_timing, cancel_policy, expected_days, is_active';

/* GET /backoffice/services — including inactive ones */
backofficeRouter.get('/services', async (req, res) => {
  const { db } = auth(req);
  ok(
    res,
    must<StaffService[]>(
      await db
        .from('services')
        .select(STAFF_SERVICE_COLUMNS)
        .order('sort_order', { ascending: true }),
    ),
  );
});

/* POST /backoffice/services */
backofficeRouter.post('/services', allow('services.manage'), async (req, res) => {
  const ctx = auth(req);
  const input = createServiceSchema.parse(req.body);
  const row = must<StaffService>(
    await ctx.db.from('services').insert(input).select(STAFF_SERVICE_COLUMNS).single(),
  );
  await staffAudit(ctx, 'staff.service.created', ctx.accountId, { type: 'service', id: row.id });
  ok(res, row, 201);
});

/* PATCH /backoffice/services/:id */
backofficeRouter.patch('/services/:id', allow('services.manage'), async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Service');
  const input = updateServiceSchema.parse(req.body);
  if (Object.keys(input).length === 0) throw invalid('Nothing to update');
  const row = must<StaffService | null>(
    await ctx.db
      .from('services')
      .update(input)
      .eq('id', id)
      .select(STAFF_SERVICE_COLUMNS)
      .maybeSingle(),
  );
  if (!row) throw notFound('Service');
  await staffAudit(ctx, 'staff.service.updated', ctx.accountId, { type: 'service', id }, input);
  ok(res, row);
});

/* ================================================================== *
 * Payments (M7/M9): customer, Plan/Extra, amount, status, date,
 * provider reference, refunds.
 * ================================================================== */

const paymentListSchema = z.object({
  status: z.enum(['all', 'pending', 'paid']).default('all'),
});

backofficeRouter.get('/payments', async (req, res) => {
  const { db } = auth(req);
  const { status } = paymentListSchema.parse(req.query);
  let query = db
    .from('orders')
    .select(`${ORDER_COLUMNS}, user_id`)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(300);
  if (status !== 'all') query = query.eq('status', status);
  const rows = must<(OrderRow & { user_id: string })[]>(await query);

  const ids = [...new Set(rows.map((r) => r.user_id))];
  const profiles =
    ids.length === 0
      ? []
      : must<{ id: string; phone: string }[]>(
          await db.from('profiles').select('id, phone').in('id', ids),
        );
  const phones = new Map(profiles.map((p) => [p.id, p.phone]));
  const data: BackofficeOrder[] = rows.map((r) => ({
    ...toOrder(r),
    account_id: r.account_id,
    customer_phone: phones.get(r.user_id) || null,
  }));
  ok(res, data);
});

/* ================================================================== *
 * Support tickets (Help & Support → Backoffice)
 * ================================================================== */

type TicketRow = SupportTicket & { account_id: string; user_id: string };

async function withTicketCustomers(
  db: SupabaseClient,
  rows: TicketRow[],
): Promise<BackofficeTicket[]> {
  const ids = [...new Set(rows.map((r) => r.user_id))];
  const profiles =
    ids.length === 0
      ? []
      : must<{ id: string; phone: string; full_name: string | null }[]>(
          await db.from('profiles').select('id, phone, full_name').in('id', ids),
        );
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return rows.map(({ user_id, ...r }) => ({
    ...r,
    customer_phone: byId.get(user_id)?.phone || null,
    customer_name: byId.get(user_id)?.full_name ?? null,
  }));
}

async function loadTicketDetail(db: SupabaseClient, id: string): Promise<BackofficeTicketDetail> {
  const row = must<TicketRow | null>(
    await db
      .from('support_tickets')
      .select(`${TICKET_COLUMNS}, account_id, user_id`)
      .eq('id', id)
      .maybeSingle(),
  );
  if (!row) throw notFound('Ticket');
  const [[ticket], messages] = await Promise.all([
    withTicketCustomers(db, [row]),
    loadMessages(db, id),
  ]);
  return { ...(ticket as BackofficeTicket), messages };
}

const ticketListSchema = z.object({
  status: z.enum(['open', 'all', ...TICKET_STATUSES]).default('open'),
});

/* GET /backoffice/tickets?status=open|all|<status> */
backofficeRouter.get('/tickets', async (req, res) => {
  const { db } = auth(req);
  const { status } = ticketListSchema.parse(req.query);
  let query = db
    .from('support_tickets')
    .select(`${TICKET_COLUMNS}, account_id, user_id`)
    .order('last_message_at', { ascending: false })
    .limit(300);
  if (status === 'open') query = query.in('status', OPEN_TICKET_STATUSES);
  else if (status !== 'all') query = query.eq('status', status);
  ok(res, await withTicketCustomers(db, must<TicketRow[]>(await query)));
});

/* GET /backoffice/tickets/:id */
backofficeRouter.get('/tickets/:id', async (req, res) => {
  const { db } = auth(req);
  ok(res, await loadTicketDetail(db, uuidParam(req.params.id, 'Ticket')));
});

/* POST /backoffice/tickets/:id/messages {body} — staff reply */
backofficeRouter.post('/tickets/:id/messages', allow('support.manage'), async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Ticket');
  const { body } = ticketMessageSchema.parse(req.body);
  const ticket = await loadTicketDetail(ctx.db, id);
  must(
    await ctx.db.from('support_ticket_messages').insert({
      ticket_id: id,
      account_id: ticket.account_id,
      author_id: ctx.userId,
      author_type: 'staff',
      body,
    }),
  );
  // A first staff reply moves a new ticket into progress.
  if (ticket.status === 'open') {
    must(await ctx.db.rpc('staff_set_ticket_status', { p_ticket: id, p_status: 'in_progress' }));
  }
  await staffAudit(ctx, 'staff.support_ticket.replied', ticket.account_id, {
    type: 'support_ticket',
    id,
  });
  ok(res, await loadTicketDetail(ctx.db, id), 201);
});

/* POST /backoffice/tickets/:id/status {status} */
backofficeRouter.post('/tickets/:id/status', allow('support.manage'), async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Ticket');
  const { status } = ticketStatusSchema.parse(req.body);
  const ticket = await loadTicketDetail(ctx.db, id);
  must(await ctx.db.rpc('staff_set_ticket_status', { p_ticket: id, p_status: status }));
  await staffAudit(
    ctx,
    'staff.support_ticket.status',
    ticket.account_id,
    { type: 'support_ticket', id },
    {
      from: ticket.status,
      to: status,
    },
  );
  ok(res, await loadTicketDetail(ctx.db, id));
});

/* POST /backoffice/tickets/:id/attachments/intent — staff attach to their own reply */
backofficeRouter.post(
  '/tickets/:id/attachments/intent',
  allow('support.manage'),
  async (req, res) => {
    const ctx = auth(req);
    const id = uuidParam(req.params.id, 'Ticket');
    const ticket = await loadTicketDetail(ctx.db, id);
    ok(
      res,
      await startAttachment(ctx.db, ctx.userId, { id, account_id: ticket.account_id }, req.body),
      201,
    );
  },
);

/* POST /backoffice/tickets/:id/attachments/:attachmentId/confirm */
backofficeRouter.post(
  '/tickets/:id/attachments/:attachmentId/confirm',
  allow('support.manage'),
  async (req, res) => {
    const ctx = auth(req);
    const id = uuidParam(req.params.id, 'Ticket');
    await loadTicketDetail(ctx.db, id);
    ok(res, await confirmAttachment(ctx.db, id, uuidParam(req.params.attachmentId, 'Attachment')));
  },
);

/* ================================================================== *
 * Pittu (AI): usage and cost, failed readings, the Review list
 * ================================================================== */

const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Phone + name for a set of accounts (staff view). */
async function accountLabels(db: SupabaseClient, ids: string[]) {
  if (ids.length === 0) return new Map<string, { phone: string | null; name: string | null }>();
  const rows = must<{ id: string; phone: string | null; full_name: string | null }[]>(
    await db.from('backoffice_accounts').select('id, phone, full_name').in('id', ids),
  );
  return new Map(rows.map((r) => [r.id, { phone: r.phone, name: r.full_name }]));
}

async function propertyLabels(db: SupabaseClient, ids: string[]) {
  if (ids.length === 0) return new Map<string, { name: string; is_draft: boolean }>();
  const rows = must<{ id: string; name: string; is_draft: boolean }[]>(
    await db.from('properties').select('id, name, is_draft').in('id', ids),
  );
  return new Map(rows.map((r) => [r.id, { name: r.name, is_draft: r.is_draft }]));
}

/* GET /backoffice/ai/summary — this month's spend, readings, accuracy, failures */
backofficeRouter.get('/ai/summary', async (req, res) => {
  const { db } = auth(req);
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
  const factCount = (status: string) =>
    db
      .from('property_facts')
      .select('id', { count: 'exact', head: true })
      .eq('status', status)
      .gte('decided_at', monthStart);

  const [ops, confirmed, edited, rejected, reviewOpen, failed] = await Promise.all([
    db
      .from('ai_operations')
      .select('account_id, cost_usd, duration_ms, input_tokens, output_tokens, outcome, created_at')
      .gte('created_at', monthStart)
      .limit(5000),
    factCount('confirmed'),
    factCount('edited'),
    factCount('rejected'),
    db
      .from('property_reviews')
      .select('property_id', { count: 'exact', head: true })
      .eq('status', 'open'),
    db
      .from('document_analyses')
      .select('id, account_id, property_id, error_code, attempts, updated_at')
      .eq('status', 'failed')
      .gte('updated_at', new Date(Date.now() - 30 * 86_400_000).toISOString())
      .order('updated_at', { ascending: false })
      .limit(25),
  ]);
  const rows = must<
    {
      account_id: string | null;
      cost_usd: number | string;
      duration_ms: number;
      input_tokens: number;
      output_tokens: number;
      outcome: string;
      created_at: string;
    }[]
  >(ops);
  const failures = must<
    {
      id: string;
      account_id: string;
      property_id: string;
      error_code: string | null;
      attempts: number;
      updated_at: string;
    }[]
  >(failed);
  for (const r of [confirmed, edited, rejected, reviewOpen]) must(r);

  const spend = rows.reduce((sum, r) => sum + Number(r.cost_usd), 0);
  const okRows = rows.filter((r) => r.outcome === 'ok');
  const perAccount = new Map<string, { calls: number; cost: number }>();
  for (const r of rows) {
    if (!r.account_id) continue;
    const a = perAccount.get(r.account_id) ?? { calls: 0, cost: 0 };
    a.calls++;
    a.cost += Number(r.cost_usd);
    perAccount.set(r.account_id, a);
  }
  const [accounts, properties] = await Promise.all([
    accountLabels(db, [...new Set([...perAccount.keys(), ...failures.map((f) => f.account_id)])]),
    propertyLabels(db, [...new Set(failures.map((f) => f.property_id))]),
  ]);

  const data: AiSummary = {
    enabled: env.AI_ENABLED,
    pilot_accounts: env.AI_PILOT_ACCOUNTS.length,
    month_start: monthStart,
    budget_usd: env.AI_MONTHLY_BUDGET_USD,
    spend_usd: round(spend),
    today_spend_usd: round(
      rows.filter((r) => r.created_at >= todayStart).reduce((s, r) => s + Number(r.cost_usd), 0),
    ),
    calls: { ok: okRows.length, failed: rows.length - okRows.length },
    avg_cost_usd: okRows.length
      ? round(okRows.reduce((s, r) => s + Number(r.cost_usd), 0) / okRows.length)
      : null,
    avg_seconds: okRows.length
      ? round(okRows.reduce((s, r) => s + r.duration_ms, 0) / okRows.length / 1000, 1)
      : null,
    input_tokens: rows.reduce((s, r) => s + r.input_tokens, 0),
    output_tokens: rows.reduce((s, r) => s + r.output_tokens, 0),
    facts: {
      confirmed: confirmed.count ?? 0,
      edited: edited.count ?? 0,
      rejected: rejected.count ?? 0,
    },
    review_open: reviewOpen.count ?? 0,
    by_account: [...perAccount.entries()]
      .map(([id, a]) => ({
        account_id: id,
        customer_phone: accounts.get(id)?.phone ?? null,
        customer_name: accounts.get(id)?.name ?? null,
        calls: a.calls,
        cost_usd: round(a.cost),
      }))
      .sort((x, y) => y.cost_usd - x.cost_usd)
      .slice(0, 10),
    failures: failures.map((f) => ({
      analysis_id: f.id,
      account_id: f.account_id,
      customer_phone: accounts.get(f.account_id)?.phone ?? null,
      property_id: f.property_id,
      property_name: properties.get(f.property_id)?.name ?? 'Property removed',
      is_draft: properties.get(f.property_id)?.is_draft ?? false,
      error_code: f.error_code,
      attempts: f.attempts,
      updated_at: f.updated_at,
      can_retry: isRetryableFailure(f.error_code),
    })),
  };
  ok(res, data);
});

/* POST /backoffice/ai/analyses/:id/retry — "Read again" (may cost money) */
backofficeRouter.post('/ai/analyses/:id/retry', allow('documents.review'), async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Reading');
  const reading = must<{ account_id: string; document_id: string } | null>(
    await ctx.db
      .from('document_analyses')
      .select('account_id, document_id')
      .eq('id', id)
      .maybeSingle(),
  );
  if (!reading) throw notFound('Reading');
  if (!(await requeueFailedAnalysis(id))) {
    throw new HttpError(409, 'CONFLICT', 'This reading cannot be started again.');
  }
  waitUntil(processAnalysis(id));
  await staffAudit(ctx, 'staff.ai.reading_retried', reading.account_id, {
    type: 'document',
    id: reading.document_id,
  });
  ok(res, { queued: true });
});

/* GET /backoffice/ai/reviews?status=open|done */
const reviewListSchema = z.object({ status: z.enum(['open', 'done']).default('open') });
const REVIEW_COLUMNS =
  'property_id, account_id, reasons, status, note, reviewed_at, created_at, updated_at';

backofficeRouter.get('/ai/reviews', async (req, res) => {
  const { db } = auth(req);
  const { status } = reviewListSchema.parse(req.query);
  const rows = must<PropertyReview[]>(
    await db
      .from('property_reviews')
      .select(REVIEW_COLUMNS)
      .eq('status', status)
      .order('updated_at', { ascending: false })
      .limit(100),
  );
  const [accounts, properties] = await Promise.all([
    accountLabels(db, [...new Set(rows.map((r) => r.account_id))]),
    propertyLabels(
      db,
      rows.map((r) => r.property_id),
    ),
  ]);
  const data: ReviewListItem[] = rows.map((r) => ({
    ...r,
    property_name: properties.get(r.property_id)?.name ?? 'Property removed',
    customer_phone: accounts.get(r.account_id)?.phone ?? null,
  }));
  ok(res, data);
});

/* POST /backoffice/properties/:id/review {status: done|open, note?} */
backofficeRouter.post('/properties/:id/review', allow('documents.review'), async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Property');
  const { status, note } = reviewDecisionSchema.parse(req.body);
  const row = must<PropertyReview | null>(
    await ctx.db
      .from('property_reviews')
      .update({
        status,
        ...(note !== undefined ? { note: note || null } : {}),
        reviewed_by: ctx.userId,
        reviewed_at: status === 'done' ? new Date().toISOString() : null,
      })
      .eq('property_id', id)
      .select(REVIEW_COLUMNS)
      .maybeSingle(),
  );
  if (!row) throw notFound('Review');
  await staffAudit(
    ctx,
    status === 'done' ? 'staff.property.reviewed' : 'staff.property.review_reopened',
    row.account_id,
    { type: 'property', id },
    { reasons: row.reasons },
  );
  ok(res, row);
});

/** Pittu section of the staff property screen (null when Pittu was never involved). */
async function loadPittu(db: SupabaseClient, propertyId: string): Promise<BackofficePittu | null> {
  const [review, answers, facts] = await Promise.all([
    db.from('property_reviews').select(REVIEW_COLUMNS).eq('property_id', propertyId).maybeSingle(),
    db.from('property_answers').select('question_id, answer').eq('property_id', propertyId),
    db
      .from('property_facts')
      .select('key, value, final_value, status, confidence, pages')
      .eq('property_id', propertyId)
      .neq('status', 'superseded')
      .order('key'),
  ]);
  const data: BackofficePittu = {
    review: must<PropertyReview | null>(review),
    answers: Object.fromEntries(
      must<{ question_id: string; answer: string }[]>(answers).map((a) => [
        a.question_id,
        a.answer,
      ]),
    ),
    facts: must<BackofficePittu['facts']>(facts),
  };
  return data.review || data.facts.length || Object.keys(data.answers).length ? data : null;
}

/* ================================================================== *
 * Where we serve: areas (PIN codes), states, demand, exceptions.
 * Every change is recorded by the tables' audit triggers.
 * ================================================================== */

async function loadCoverage(db: SupabaseClient): Promise<BackofficeCoverage> {
  const [areas, pins, states, demand] = await Promise.all([
    db.from('service_areas').select('id, name, state, is_active').order('name'),
    db.from('service_area_pincodes').select('pincode, area_id').order('pincode').limit(10000),
    db.from('service_states').select('state, pincode_prefixes, is_active').order('state'),
    db.rpc('reach_demand'),
  ]);
  const byArea = new Map<string, string[]>();
  for (const p of must<{ pincode: string; area_id: string }[]>(pins)) {
    byArea.set(p.area_id, [...(byArea.get(p.area_id) ?? []), p.pincode]);
  }
  return {
    areas: must<Omit<ServiceArea, 'pincodes'>[]>(areas).map((a) => ({
      ...a,
      pincodes: byArea.get(a.id) ?? [],
    })),
    states: must<ServiceState[]>(states),
    demand: must<ReachDemand[]>(demand),
  };
}

/* GET /backoffice/coverage */
backofficeRouter.get('/coverage', async (req, res) => {
  ok(res, await loadCoverage(auth(req).db));
});

/* POST /backoffice/areas {name, state} */
backofficeRouter.post('/areas', allow('services.manage'), async (req, res) => {
  const { db } = auth(req);
  const input = createAreaSchema.parse(req.body);
  const { error } = await db.from('service_areas').insert(input);
  if (error?.code === '23505')
    throw new HttpError(409, 'CONFLICT', 'An area with this name exists');
  must({ error, data: null });
  ok(res, await loadCoverage(db), 201);
});

/* PATCH /backoffice/areas/:id {name?, is_active?} */
backofficeRouter.patch('/areas/:id', allow('services.manage'), async (req, res) => {
  const { db } = auth(req);
  const id = uuidParam(req.params.id, 'Area');
  const input = updateAreaSchema.parse(req.body);
  const row = must<{ id: string } | null>(
    await db.from('service_areas').update(input).eq('id', id).select('id').maybeSingle(),
  );
  if (!row) throw notFound('Area');
  ok(res, await loadCoverage(db));
});

/*
 * POST /backoffice/areas/:id/pincodes {pincodes} — adds PIN codes. A PIN
 * already in another area is refused (one PIN, one area) and named.
 */
backofficeRouter.post('/areas/:id/pincodes', allow('services.manage'), async (req, res) => {
  const { db } = auth(req);
  const id = uuidParam(req.params.id, 'Area');
  const pincodes = [...new Set(areaPincodesSchema.parse(req.body).pincodes)];
  const taken = must<{ pincode: string; area_id: string }[]>(
    await db.from('service_area_pincodes').select('pincode, area_id').in('pincode', pincodes),
  );
  const elsewhere = taken.filter((t) => t.area_id !== id).map((t) => t.pincode);
  if (elsewhere.length) {
    throw invalid(`Already in another area: ${elsewhere.join(', ')}`, {
      pincodes: 'Remove these from the other area first',
    });
  }
  const fresh = pincodes.filter((p) => !taken.some((t) => t.pincode === p));
  if (fresh.length) {
    must(
      await db
        .from('service_area_pincodes')
        .insert(fresh.map((pincode) => ({ pincode, area_id: id }))),
    );
  }
  ok(res, await loadCoverage(db));
});

/* DELETE /backoffice/areas/:id/pincodes/:pincode */
backofficeRouter.delete(
  '/areas/:id/pincodes/:pincode',
  allow('services.manage'),
  async (req, res) => {
    const { db } = auth(req);
    const id = uuidParam(req.params.id, 'Area');
    const pincode = String(req.params.pincode);
    if (!INDIAN_PINCODE_REGEX.test(pincode)) throw invalid('Enter a valid 6-digit PIN code');
    must(await db.from('service_area_pincodes').delete().eq('area_id', id).eq('pincode', pincode));
    ok(res, await loadCoverage(db));
  },
);

/* POST /backoffice/states {state, pincode_prefixes} */
backofficeRouter.post('/states', allow('services.manage'), async (req, res) => {
  const { db } = auth(req);
  const input = createStateSchema.parse(req.body);
  const { error } = await db.from('service_states').insert(input);
  if (error?.code === '23505') throw new HttpError(409, 'CONFLICT', 'This state is already listed');
  must({ error, data: null });
  ok(res, await loadCoverage(db), 201);
});

/* PATCH /backoffice/states/:state {is_active?, pincode_prefixes?} */
backofficeRouter.patch('/states/:state', allow('services.manage'), async (req, res) => {
  const { db } = auth(req);
  const input = updateStateSchema.parse(req.body);
  const row = must<{ state: string } | null>(
    await db
      .from('service_states')
      .update(input)
      .eq('state', String(req.params.state))
      .select('state')
      .maybeSingle(),
  );
  if (!row) throw notFound('State');
  ok(res, await loadCoverage(db));
});

/** Reach of one property for staff (with the exception reason, if any). */
async function loadStaffReach(
  db: SupabaseClient,
  accountId: string,
  propertyId: string,
): Promise<StaffPropertyReach | null> {
  const [reach, exception] = await Promise.all([
    loadReach(db, accountId),
    db
      .from('property_reach_exceptions')
      .select('reason')
      .eq('property_id', propertyId)
      .maybeSingle(),
  ]);
  const r = reach.get(propertyId);
  if (!r) return null;
  return {
    ...r,
    exception_reason: must<{ reason: string } | null>(exception)?.reason ?? null,
  };
}

async function propertyAccount(db: SupabaseClient, propertyId: string): Promise<string> {
  const row = must<{ account_id: string } | null>(
    await db.from('properties').select('account_id').eq('id', propertyId).maybeSingle(),
  );
  if (!row) throw notFound('Property');
  return row.account_id;
}

/* POST /backoffice/properties/:id/reach-exception {reason} — serve it anyway */
backofficeRouter.post(
  '/properties/:id/reach-exception',
  allow('services.manage'),
  async (req, res) => {
    const ctx = auth(req);
    const id = uuidParam(req.params.id, 'Property');
    const { reason } = reachExceptionSchema.parse(req.body);
    const accountId = await propertyAccount(ctx.db, id);
    must(
      await ctx.db
        .from('property_reach_exceptions')
        .upsert(
          { property_id: id, account_id: accountId, reason, created_by: ctx.userId },
          { onConflict: 'property_id', ignoreDuplicates: true },
        ),
    );
    await staffAudit(ctx, 'staff.property.reach_exception_added', accountId, {
      type: 'property',
      id,
    });
    ok(res, await loadStaffReach(ctx.db, accountId, id));
  },
);

/* DELETE /backoffice/properties/:id/reach-exception */
backofficeRouter.delete(
  '/properties/:id/reach-exception',
  allow('services.manage'),
  async (req, res) => {
    const ctx = auth(req);
    const id = uuidParam(req.params.id, 'Property');
    const accountId = await propertyAccount(ctx.db, id);
    must(await ctx.db.from('property_reach_exceptions').delete().eq('property_id', id));
    await staffAudit(ctx, 'staff.property.reach_exception_removed', accountId, {
      type: 'property',
      id,
    });
    ok(res, await loadStaffReach(ctx.db, accountId, id));
  },
);
