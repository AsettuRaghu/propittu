import {
  BILLING_PERIOD_LABELS,
  formatPrice,
  type PlanBenefits,
  type PlanStatus,
  type PublicPlan,
} from '@propittu/shared';
import { fetchPlanQuote, showPaymentOutcome, usePlanCheckout } from '@/api/billing';
import { useProperties, useServices } from '@/api/queries';
import { dialog } from '@/components/Dialog';
import type { Tone } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import type { Accent } from '@/theme';

/** Plan colours (icons, dialogs). */
export const PLAN_ACCENT: Record<string, Accent> = { trial: 'teal', basic: 'sky', plus: 'violet' };

/** Plans are compared on one thing for now: how many properties they hold. */
export const propertiesHeld = (b: PlanBenefits | undefined) => b?.limits.max_properties;

/**
 * One badge for "where does my plan stand": Trial in orange, a paid plan in
 * green, no active plan (or a suspended account) Locked in red. Pass a
 * `planName` to show it on the paid badge (Profile); without it the badge
 * says "Active" (Plan & Usage, where the name is already the title).
 */
export function planBadge(p: {
  status: PlanStatus;
  planName?: string | null;
  accountActive?: boolean;
}): { label: string; tone: Tone } {
  if (p.accountActive === false || p.status === 'expired') {
    return { label: 'Locked', tone: 'danger' };
  }
  if (p.status === 'trialing') return { label: 'Trial', tone: 'warning' };
  return { label: p.planName ?? 'Active', tone: 'success' };
}

/**
 * Buying, upgrading or renewing a plan: the server's quote (refusals shown
 * as they come), a warning when included visits can't reach any property
 * (never a block), the price breakdown, then the payment and its outcome.
 */
export function usePlanPurchase(current: PlanBenefits | undefined) {
  const checkout = usePlanCheckout();
  const properties = useProperties();
  const services = useServices();

  const choose = async (plan: PublicPlan) => {
    let q;
    try {
      q = await fetchPlanQuote(plan.code);
    } catch (err) {
      void dialog.alert({
        title: "Couldn't load the price",
        message: errorMessage(err),
        tone: 'danger',
      });
      return;
    }
    if (q.blocked_reason) {
      void dialog.alert({
        title: `${plan.name} isn't available yet`,
        message: q.blocked_reason,
        icon: 'clock',
      });
      return;
    }
    if (q.mode !== 'renewal' && !(await visitsWarningAccepted(plan))) return;

    const upgrade = q.mode === 'upgrade';
    const renewal = q.mode === 'renewal';
    const held = propertiesHeld(plan.benefits);
    const had = propertiesHeld(current);
    const ok = await dialog.confirm({
      title: upgrade
        ? `Upgrade to ${plan.name}`
        : renewal
          ? `Renew ${plan.name}`
          : `Welcome to ${plan.name}`,
      message: upgrade
        ? 'More room for your properties, starting today.'
        : renewal
          ? 'Another term, added after your current one — no days lost.'
          : 'Everything you need to look after your properties.',
      icon: upgrade ? 'gem' : 'sparkles',
      accent: PLAN_ACCENT[plan.code] ?? 'indigo',
      highlights:
        renewal || held === undefined
          ? undefined
          : [
              upgrade && had !== undefined
                ? `Up to ${held} properties, up from ${had}`
                : `Up to ${held} properties`,
            ],
      summary: [
        {
          label: `${plan.name} ${BILLING_PERIOD_LABELS[plan.billing_period]}`,
          value: formatPrice(q.list_price_paise),
        },
        ...(q.credit_paise > 0
          ? [
              {
                label: `Credit for unused ${q.current_plan_name ?? 'plan'}`,
                value: `− ${formatPrice(q.credit_paise)}`,
                kind: 'credit' as const,
              },
            ]
          : []),
        { label: 'You pay today', value: formatPrice(q.amount_paise), kind: 'total' as const },
      ],
      note:
        `Valid ${formatDate(q.starts_at)} – ${formatDate(q.ends_at)}` +
        (q.bonus_days > 0
          ? ` · includes your ${q.bonus_days} trial day${q.bonus_days === 1 ? '' : 's'} left`
          : '') +
        (upgrade ? ' · visits used this year still count' : '') +
        ' · secure UPI or card payment',
      confirmLabel: upgrade
        ? `Upgrade for ${formatPrice(q.amount_paise)}`
        : `Pay ${formatPrice(q.amount_paise)}`,
      cancelLabel: 'Maybe later',
    });
    if (!ok) return;
    checkout.mutate(plan.code, {
      onSuccess: (order) => showPaymentOutcome(order, `Your ${plan.name} plan is active.`),
      onError: (err) =>
        void dialog.alert({
          title: "Couldn't start the payment",
          message: errorMessage(err),
          tone: 'danger',
        }),
    });
  };

  /** Decision 2026-10-06: warn (never block) when included visits can't be used anywhere yet. */
  const visitsWarningAccepted = async (plan: PublicPlan): Promise<boolean> => {
    const visitCodes = new Set(
      (services.data ?? []).filter((x) => x.reach === 'area').map((x) => x.code),
    );
    const list = properties.data ?? [];
    const blocked =
      plan.benefits.included.some((i) => visitCodes.has(i.code)) &&
      list.length > 0 &&
      list.every((p) => p.reach && !p.reach.visits);
    if (!blocked) return true;
    return dialog.confirm({
      title: 'Visits don’t reach your properties yet',
      message:
        `Our team doesn’t visit the area of ${list.length === 1 ? 'your property' : 'any of your properties'} yet, ` +
        `so ${plan.name}’s included visits can’t be used there for now. Documents, Pittu and ` +
        'reminders work as usual — we’ll tell you when we arrive.',
      icon: 'map',
      confirmLabel: 'Continue anyway',
      cancelLabel: 'Not now',
    });
  };

  return {
    choose,
    busy: checkout.isPending,
    busyCode: checkout.isPending ? (checkout.variables ?? null) : null,
  };
}
