import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { StaffRole } from '@propittu/shared';
import { auth } from '../auth.js';
import { audit } from '../audit.js';
import { HttpError, must, notFound, ok, uuidParam } from '../errors.js';
import { describeAccountPlan } from '../plan.js';

/**
 * Backoffice (M9) — staff mode. Staff are identified by an ACTIVE
 * staff_members row; RLS (is_staff()) is the second, independent check
 * on every query below.
 *
 * Checkpoint 3 ships only the Plan operations; the full Backoffice
 * (customers, service requests, document review) follows in checkpoint 4.
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

const requireRole =
  (...roles: StaffRole[]): RequestHandler =>
  (req, _res, next) => {
    if (req.staffRole === 'super_admin' || roles.includes(req.staffRole as StaffRole))
      return next();
    throw new HttpError(403, 'FORBIDDEN', 'Your staff role does not allow this action');
  };

backofficeRouter.use(requireStaff);

async function assertAccountExists(db: ReturnType<typeof auth>['db'], accountId: string) {
  const row = must<{ id: string } | null>(
    await db.from('accounts').select('id').eq('id', accountId).maybeSingle(),
  );
  if (!row) throw notFound('Account');
}

/* GET /backoffice/accounts/:accountId/plan */
backofficeRouter.get('/accounts/:accountId/plan', async (req, res) => {
  const { db } = auth(req);
  const accountId = uuidParam(req.params.accountId, 'Account');
  await assertAccountExists(db, accountId);
  ok(res, await describeAccountPlan(db, accountId));
});

/*
 * POST /backoffice/accounts/:accountId/plan/end — ends the current Plan
 * (or Trial) now. The Account drops to Limited Access; data is kept.
 */
backofficeRouter.post(
  '/accounts/:accountId/plan/end',
  requireRole('operations', 'finance'),
  async (req, res) => {
    const ctx = auth(req);
    const accountId = uuidParam(req.params.accountId, 'Account');
    await assertAccountExists(ctx.db, accountId);

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
    await audit(
      ctx,
      'staff.plan.ended',
      undefined,
      { ended: ended.map((r) => r.id) },
      'staff',
      accountId,
    );
    ok(res, await describeAccountPlan(ctx.db, accountId));
  },
);

/*
 * POST /backoffice/accounts/:accountId/plan — grants a Plan (current
 * version) starting now, replacing whatever is in force.
 */
const grantSchema = z.object({
  plan_code: z.string().regex(/^[a-z][a-z0-9_]*$/),
  days: z.number().int().min(1).max(3660).optional(),
});

backofficeRouter.post(
  '/accounts/:accountId/plan',
  requireRole('operations', 'finance'),
  async (req, res) => {
    const ctx = auth(req);
    const accountId = uuidParam(req.params.accountId, 'Account');
    const input = grantSchema.parse(req.body);
    await assertAccountExists(ctx.db, accountId);

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
    await audit(
      ctx,
      'staff.plan.granted',
      { type: 'account_plan', id: row.id },
      { plan_code: input.plan_code, ends_at: ends.toISOString() },
      'staff',
      accountId,
    );
    ok(res, await describeAccountPlan(ctx.db, accountId), 201);
  },
);
