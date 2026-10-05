import { Router } from 'express';
import type { PublicPlan } from '@propittu/shared';
import { auth } from '../auth.js';
import { audit } from '../audit.js';
import { must, ok } from '../errors.js';
import { describeAccountPlan, toBenefits } from '../plan.js';

/**
 * Plans (M5) and the Account's Plan state (M6). Mounted BEFORE the
 * Limited Access gate: a customer whose Trial ended must still see their
 * status and the available Plans.
 */
export const plansRouter = Router();

interface PlanRow {
  code: string;
  name: string;
  description: string;
  sort_order: number;
  versions: {
    id: string;
    version: number;
    price_paise: number;
    currency: 'INR';
    billing_period: 'none' | 'month' | 'year';
    term_days: number;
    is_current: boolean;
    benefits: {
      kind: 'feature' | 'limit' | 'included_service';
      code: string;
      value: number | null;
      period: 'year' | 'term' | null;
    }[];
  }[];
}

/* GET /plans — purchasable Plans, current version of each */
plansRouter.get('/plans', async (req, res) => {
  const { db } = auth(req);
  const rows = must<PlanRow[]>(
    await db
      .from('plans')
      .select(
        'code, name, description, sort_order, ' +
          'versions:plan_versions(id, version, price_paise, currency, billing_period, term_days, is_current, ' +
          'benefits:plan_version_benefits(kind, code, value, period))',
      )
      .eq('is_public', true)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
  );

  const plans: PublicPlan[] = rows.flatMap((p) => {
    const v = p.versions.find((x) => x.is_current);
    if (!v) return [];
    return [
      {
        code: p.code,
        name: p.name,
        description: p.description,
        version: v.version,
        plan_version_id: v.id,
        price_paise: v.price_paise,
        currency: v.currency,
        billing_period: v.billing_period,
        term_days: v.term_days,
        benefits: toBenefits(v.benefits),
      },
    ];
  });
  ok(res, plans);
});

/* GET /account/plan — status, Benefits, Usage */
plansRouter.get('/account/plan', async (req, res) => {
  const { db, accountId } = auth(req);
  ok(res, await describeAccountPlan(db, accountId));
});

/*
 * POST /account/plan/cancel — stop renewal; the paid period continues (M7).
 * A Trial cannot be cancelled (it simply ends).
 */
plansRouter.post('/account/plan/cancel', async (req, res) => {
  const ctx = auth(req);
  const affected = must<number>(await ctx.db.rpc('cancel_current_plan'));
  if (affected > 0) await audit(ctx, 'plan.cancelled');
  ok(res, await describeAccountPlan(ctx.db, ctx.accountId));
});
