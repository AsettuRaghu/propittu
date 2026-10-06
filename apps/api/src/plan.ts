import type { Request, RequestHandler } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AccountPlanState,
  FeatureCode,
  LimitCode,
  PlanBenefits,
  PlanStatus,
  PlanSummary,
} from '@propittu/shared';
import { auth } from './auth.js';
import { HttpError, must } from './errors.js';

/**
 * Plans, Benefits and Usage (M5/M6). The API is the ONLY authority:
 * the mobile app never decides Benefits or Usage Limits.
 *
 * Authorization order for every protected operation (M10):
 *   authenticated → Account → resource belongs to Account
 *   → Benefit available (requireFeature) → Usage available (enforceLimit)
 *   → perform the action.
 */

interface BenefitRow {
  kind: 'feature' | 'limit' | 'included_service';
  code: string;
  value: number | null;
  period: 'year' | 'term' | null;
}

interface CurrentPlanRow {
  id: string;
  source: 'trial' | 'payment' | 'staff';
  starts_at: string;
  ends_at: string;
  cancel_at_period_end: boolean;
  plan_version: {
    id: string;
    version: number;
    price_paise: number;
    currency: 'INR';
    billing_period: 'none' | 'month' | 'year';
    term_days: number;
    plan: { code: string; name: string; description: string };
    benefits: BenefitRow[];
  };
}

const CURRENT_PLAN_SELECT =
  'id, source, starts_at, ends_at, cancel_at_period_end, ' +
  'plan_version:plan_versions(id, version, price_paise, currency, billing_period, term_days, ' +
  'plan:plans(code, name, description), benefits:plan_version_benefits(kind, code, value, period))';

export interface PlanState {
  access: 'full' | 'limited';
  status: PlanStatus;
  current: CurrentPlanRow | null;
  benefits: PlanBenefits;
}

export function toBenefits(rows: BenefitRow[]): PlanBenefits {
  return {
    features: rows.filter((b) => b.kind === 'feature').map((b) => b.code as FeatureCode),
    limits: Object.fromEntries(
      rows.filter((b) => b.kind === 'limit').map((b) => [b.code, b.value ?? 0]),
    ) as PlanBenefits['limits'],
    included: rows
      .filter((b) => b.kind === 'included_service')
      .map((b) => ({ code: b.code, quantity: b.value ?? 0, period: b.period ?? 'term' })),
  };
}

/**
 * The Plan in force right now: the most recently started account_plan
 * whose period covers now (a staff/paid grant during a Trial wins).
 */
export async function loadPlanState(db: SupabaseClient, accountId: string): Promise<PlanState> {
  const now = new Date().toISOString();
  const current = must<CurrentPlanRow | null>(
    await db
      .from('account_plans')
      .select(CURRENT_PLAN_SELECT)
      .eq('account_id', accountId)
      .lte('starts_at', now)
      .gt('ends_at', now)
      .order('starts_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  );

  if (!current) {
    return {
      access: 'limited',
      status: 'expired',
      current: null,
      benefits: { features: [], limits: {}, included: [] },
    };
  }

  // A Trial given or extended by staff is still a Trial.
  const status: PlanStatus =
    current.source === 'trial' || current.plan_version.plan.code === 'trial'
      ? 'trialing'
      : current.cancel_at_period_end
        ? 'cancelling'
        : 'active';
  return { access: 'full', status, current, benefits: toBenefits(current.plan_version.benefits) };
}

const daysLeft = (iso: string) =>
  Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));

export function planSummary(state: PlanState): PlanSummary {
  return {
    access: state.access,
    status: state.status,
    plan_name: state.current?.plan_version.plan.name ?? null,
    ends_at: state.current?.ends_at ?? null,
    days_left: state.current ? daysLeft(state.current.ends_at) : null,
  };
}

/* ------------------------------------------------------------------ *
 * Middleware: Limited Access gate (M6, strict)
 * ------------------------------------------------------------------ */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      planState?: PlanState;
    }
  }
}

/**
 * Mounted in front of all normal property-management functionality.
 * No active Plan → 402 LIMITED_ACCESS. A suspended Account → 403.
 */
export const requireActivePlan: RequestHandler = async (req, _res, next) => {
  const ctx = auth(req);
  if (ctx.accountStatus !== 'active') {
    throw new HttpError(403, 'FORBIDDEN', 'Your account is not active. Please contact support.');
  }
  const state = await loadPlanState(ctx.db, ctx.accountId);
  if (state.access === 'limited') {
    throw new HttpError(
      402,
      'LIMITED_ACCESS',
      'Your free trial or plan has ended. Choose a plan to continue using Propittu — your data is safe.',
    );
  }
  req.planState = state;
  next();
};

export function planOf(req: Request): PlanState {
  if (!req.planState) throw new Error('requireActivePlan must run before this handler');
  return req.planState;
}

/* ------------------------------------------------------------------ *
 * Benefit and Usage checks (authoritative)
 * ------------------------------------------------------------------ */

function planName(state: PlanState): string {
  return state.current?.plan_version.plan.name ?? 'current';
}

export function requireFeature(state: PlanState, code: FeatureCode, what: string): void {
  if (!state.benefits.features.includes(code)) {
    throw new HttpError(
      403,
      'FEATURE_NOT_INCLUDED',
      `${what} is not included in your ${planName(state)} plan. Upgrade to use it.`,
    );
  }
}

/**
 * Throws LIMIT_REACHED when `used + adding` would exceed the Plan's limit.
 * A limit that is not configured for the Plan means "no limit".
 */
export function enforceLimit(
  state: PlanState,
  code: LimitCode,
  used: number,
  adding: number,
  label: [one: string, many: string],
): void {
  const limit = state.benefits.limits[code];
  if (limit === undefined) return;
  if (used + adding > limit) {
    throw new HttpError(
      403,
      'LIMIT_REACHED',
      `Your ${planName(state)} plan allows ${limit} ${limit === 1 ? label[0] : label[1]}. Upgrade your plan to add more.`,
      { limit: String(limit), used: String(used), code },
    );
  }
}

/** Storage limit (MB) against READY files across the Account. */
export async function enforceStorage(
  db: SupabaseClient,
  state: PlanState,
  accountId: string,
  addingBytes: number,
): Promise<void> {
  const limitMb = state.benefits.limits.max_storage_mb;
  if (limitMb === undefined) return;
  const row = must<{ storage_bytes: number } | null>(
    await db
      .from('account_usage')
      .select('storage_bytes')
      .eq('account_id', accountId)
      .maybeSingle(),
  );
  const used = Number(row?.storage_bytes ?? 0);
  if (used + addingBytes > limitMb * 1024 * 1024) {
    throw new HttpError(
      403,
      'LIMIT_REACHED',
      `Your ${planName(state)} plan includes ${limitMb} MB of storage, and this file would exceed it. Upgrade your plan or remove some files.`,
      {
        limit: String(limitMb),
        used: String(Math.ceil(used / (1024 * 1024))),
        code: 'max_storage_mb',
      },
    );
  }
}

/** Counts rows of a per-property resource (READY only) for limit checks. */
export async function countForProperty(
  db: SupabaseClient,
  table: 'property_photos' | 'property_videos' | 'property_documents',
  accountId: string,
  propertyId: string,
): Promise<number> {
  const res = await db
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('property_id', propertyId)
    .eq('upload_status', 'ready');
  must(res);
  return res.count ?? 0;
}

/* ------------------------------------------------------------------ *
 * Full state for GET /account/plan
 * ------------------------------------------------------------------ */

export async function describeAccountPlan(
  db: SupabaseClient,
  accountId: string,
): Promise<AccountPlanState> {
  const state = await loadPlanState(db, accountId);
  const count = (q: PromiseLike<{ count: number | null; error: { message: string } | null }>) =>
    Promise.resolve(q).then((r) => {
      must({ data: null, error: r.error });
      return r.count ?? 0;
    });
  const [usageRes, summariesRes, included, servicesCompleted, visitReports, paidOrders] =
    await Promise.all([
      db
        .from('account_usage')
        .select('property_count, storage_bytes')
        .eq('account_id', accountId)
        .maybeSingle(),
      db
        .from('property_summaries')
        .select('document_count, photo_count, video_count')
        .eq('account_id', accountId),
      // Included Services: same rule the database applies when a request is
      // opened (consumed + still awaiting confirmation), so the numbers agree.
      Promise.all(
        state.benefits.included.map(async (b) => {
          const remaining = must<number | null>(
            await db.rpc('included_remaining', { p_account: accountId, p_code: b.code }),
          );
          return {
            code: b.code,
            used: b.quantity - (remaining ?? b.quantity),
            quantity: b.quantity,
          };
        }),
      ),
      count(
        db
          .from('service_requests')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', accountId)
          .eq('status', 'completed'),
      ),
      // RLS shows customers only published (completed) reports.
      count(
        db
          .from('visit_reports')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', accountId),
      ),
      count(
        db
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', accountId)
          .eq('status', 'paid'),
      ),
    ]);

  const usage = must<{ property_count: number; storage_bytes: number } | null>(usageRes);
  const perProperty =
    must<{ document_count: number; photo_count: number; video_count: number }[]>(summariesRes);

  const properties = usage?.property_count ?? 0;
  const storageBytes = Number(usage?.storage_bytes ?? 0);
  const limits = state.benefits.limits;

  const over: LimitCode[] = [];
  const exceeds = (code: LimitCode, value: number) =>
    limits[code] !== undefined && value > (limits[code] as number);
  if (exceeds('max_properties', properties)) over.push('max_properties');
  if (perProperty.some((p) => exceeds('max_documents_per_property', p.document_count)))
    over.push('max_documents_per_property');
  if (perProperty.some((p) => exceeds('max_photos_per_property', p.photo_count)))
    over.push('max_photos_per_property');
  if (perProperty.some((p) => exceeds('max_videos_per_property', p.video_count)))
    over.push('max_videos_per_property');
  if (limits.max_storage_mb !== undefined && storageBytes > limits.max_storage_mb * 1024 * 1024)
    over.push('max_storage_mb');

  const current = state.current;

  return {
    access: state.access,
    status: state.status,
    plan: current
      ? {
          code: current.plan_version.plan.code,
          name: current.plan_version.plan.name,
          description: current.plan_version.plan.description,
          version: current.plan_version.version,
          price_paise: current.plan_version.price_paise,
          currency: current.plan_version.currency,
          billing_period: current.plan_version.billing_period,
          term_days: current.plan_version.term_days,
          benefits: state.benefits,
        }
      : null,
    current: current
      ? {
          id: current.id,
          source: current.source,
          starts_at: current.starts_at,
          ends_at: current.ends_at,
          cancel_at_period_end: current.cancel_at_period_end,
          days_left: daysLeft(current.ends_at),
        }
      : null,
    usage: {
      properties,
      storage_bytes: storageBytes,
      included,
      documents: perProperty.reduce((n, p) => n + p.document_count, 0),
      photos: perProperty.reduce((n, p) => n + p.photo_count, 0),
      videos: perProperty.reduce((n, p) => n + p.video_count, 0),
      max_documents_on_a_property: Math.max(0, ...perProperty.map((p) => p.document_count)),
      max_photos_on_a_property: Math.max(0, ...perProperty.map((p) => p.photo_count)),
      max_videos_on_a_property: Math.max(0, ...perProperty.map((p) => p.video_count)),
    },
    received: {
      services_completed: servicesCompleted,
      visit_reports: visitReports,
      paid_orders: paidOrders,
    },
    over_limit: over,
  };
}
