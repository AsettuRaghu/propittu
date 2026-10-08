import { Router, type RequestHandler } from 'express';
import {
  planCreateSchema,
  planUpdateSchema,
  planVersionRenewalsSchema,
  planVersionSchema,
  staffCan,
  type PlanBenefits,
  type StaffPlan,
  type StaffPlanVersion,
} from '@propittu/shared';
import { audit } from '../audit.js';
import { auth } from '../auth.js';
import { HttpError, invalid, must, notFound, ok, uuidParam } from '../errors.js';
import { toBenefits } from '../plan.js';

/**
 * The plans console (Backoffice portal): what we sell, at what price, with
 * which benefits. Mounted inside backofficeRouter (active staff only).
 * Name, description, on sale and order change in place; price, term and
 * benefits only through a new version (staff_publish_plan_version), so
 * customers keep what they bought.
 */
export const plansConsoleRouter = Router();

const canManage: RequestHandler = (req, _res, next) => {
  if (staffCan(req.staffRole, 'plans.manage')) return next();
  throw new HttpError(403, 'FORBIDDEN', 'Your staff role does not allow this action');
};

type VersionRow = Omit<StaffPlanVersion, 'benefits' | 'customers_now'> & {
  benefits: Parameters<typeof toBenefits>[0];
};
type PlanRow = Omit<StaffPlan, 'current' | 'versions' | 'customers_now'> & {
  versions: VersionRow[];
};

async function listPlans(db: ReturnType<typeof auth>['db']): Promise<StaffPlan[]> {
  const now = new Date().toISOString();
  const [plans, inForce] = await Promise.all([
    db
      .from('plans')
      .select(
        'id, code, name, description, is_public, is_active, sort_order, created_at, ' +
          'versions:plan_versions(id, version, price_paise, billing_period, term_days, is_current, renewals_keep, created_at, ' +
          'benefits:plan_version_benefits(kind, code, value, period))',
      )
      .order('sort_order'),
    db
      .from('account_plans')
      .select('account_id, plan_version_id, starts_at')
      .lte('starts_at', now)
      .gt('ends_at', now)
      .limit(50_000),
  ]);
  // One plan in force per account: the most recently started one.
  const latest = new Map<string, { plan_version_id: string; starts_at: string }>();
  for (const r of must<{ account_id: string; plan_version_id: string; starts_at: string }[]>(
    inForce,
  )) {
    const seen = latest.get(r.account_id);
    if (!seen || r.starts_at > seen.starts_at) latest.set(r.account_id, r);
  }
  const perVersion = new Map<string, number>();
  for (const r of latest.values())
    perVersion.set(r.plan_version_id, (perVersion.get(r.plan_version_id) ?? 0) + 1);

  return must<PlanRow[]>(plans).map((p) => {
    const versions = p.versions
      .map((v): StaffPlanVersion => ({
        ...v,
        benefits: toBenefits(v.benefits) as PlanBenefits,
        customers_now: perVersion.get(v.id) ?? 0,
      }))
      .sort((a, b) => b.version - a.version);
    return {
      ...p,
      versions,
      current: versions.find((v) => v.is_current) ?? null,
      customers_now: versions.reduce((n, v) => n + v.customers_now, 0),
    };
  });
}

const toRows = (b: PlanBenefits) => [
  ...b.features.map((code) => ({ kind: 'feature', code, value: null, period: null })),
  ...Object.entries(b.limits).map(([code, value]) => ({
    kind: 'limit',
    code,
    value,
    period: null,
  })),
  ...b.included.map((i) => ({
    kind: 'included_service',
    code: i.code,
    value: i.quantity,
    period: i.period,
  })),
];

/* GET /backoffice/plans */
plansConsoleRouter.get('/plans', async (req, res) => {
  ok(res, await listPlans(auth(req).db));
});

/* POST /backoffice/plans {code, name, description, is_public, is_active, sort_order, version} */
plansConsoleRouter.post('/plans', canManage, async (req, res) => {
  const ctx = auth(req);
  const { version, ...plan } = planCreateSchema.parse(req.body);
  const codes = new Set(version.benefits.included.map((i) => i.code));
  if (codes.size !== version.benefits.included.length)
    throw invalid('Each service can be included once');
  const row = must<{ id: string }>(await ctx.db.from('plans').insert(plan).select('id').single());
  must(
    await ctx.db.rpc('staff_publish_plan_version', {
      p_plan: row.id,
      p_price_paise: version.price_paise,
      p_billing_period: version.billing_period,
      p_term_days: version.term_days,
      p_benefits: toRows(version.benefits),
    }),
  );
  await audit(
    ctx,
    'staff.plan.created',
    { type: 'plan', id: row.id },
    { code: plan.code },
    'staff',
  );
  res.status(201);
  ok(
    res,
    (await listPlans(ctx.db)).find((p) => p.id === row.id),
  );
});

/* PATCH /backoffice/plans/:id {name?, description?, is_public?, is_active?, sort_order?} */
plansConsoleRouter.patch('/plans/:id', canManage, async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Plan');
  const input = planUpdateSchema.parse(req.body);
  if (Object.keys(input).length === 0) throw invalid('Nothing to update');
  const row = must<{ id: string; code: string } | null>(
    await ctx.db.from('plans').update(input).eq('id', id).select('id, code').maybeSingle(),
  );
  if (!row) throw notFound('Plan');
  if (row.code === 'trial' && input.is_public) throw invalid('The Free Trial cannot be sold');
  await audit(ctx, 'staff.plan.updated', { type: 'plan', id }, input, 'staff');
  ok(
    res,
    (await listPlans(ctx.db)).find((p) => p.id === id),
  );
});

/* POST /backoffice/plans/:id/versions {price_paise, billing_period, term_days, benefits} */
plansConsoleRouter.post('/plans/:id/versions', canManage, async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Plan');
  const v = planVersionSchema.parse(req.body);
  const codes = new Set(v.benefits.included.map((i) => i.code));
  if (codes.size !== v.benefits.included.length) throw invalid('Each service can be included once');
  const versionId = must<string>(
    await ctx.db.rpc('staff_publish_plan_version', {
      p_plan: id,
      p_price_paise: v.price_paise,
      p_billing_period: v.billing_period,
      p_term_days: v.term_days,
      p_benefits: toRows(v.benefits),
      p_keep_renewals: v.keep_renewals ?? false,
    }),
  );
  await audit(
    ctx,
    'staff.plan.version_published',
    { type: 'plan_version', id: versionId },
    { plan_id: id, price_paise: v.price_paise, term_days: v.term_days },
    'staff',
  );
  res.status(201);
  ok(
    res,
    (await listPlans(ctx.db)).find((p) => p.id === id),
  );
});

/* PATCH /backoffice/plan-versions/:id {renewals_keep} — renewals stay on this version, or move on */
plansConsoleRouter.patch('/plan-versions/:id', canManage, async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Plan version');
  const { renewals_keep } = planVersionRenewalsSchema.parse(req.body);
  must(await ctx.db.rpc('staff_set_version_renewals', { p_version: id, p_keep: renewals_keep }));
  await audit(
    ctx,
    'staff.plan.version_renewals',
    { type: 'plan_version', id },
    { renewals_keep },
    'staff',
  );
  res.status(204).end();
});
