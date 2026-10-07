import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  BILLING_PERIOD_LABELS,
  formatPrice,
  formatStorageMb,
  INCLUDED_SERVICE_LABELS,
  LIMIT_LABELS,
  ORDER_DISPLAY_LABELS,
  PLAN_STATUS_LABELS,
  RENEWAL_WINDOW_DAYS,
  type AccountPlanState,
  type LimitCode,
  type Order,
  type PlanBenefits,
  type PublicPlan,
} from '@propittu/shared';
import { PullRefresh } from '@/components/PullRefresh';
import { fetchPlanQuote, useOrders, usePlanCheckout } from '@/api/billing';
import { useAccountPlan, usePlans, useProperties, useServices } from '@/api/queries';
import { dialog } from '@/components/Dialog';
import { Icon } from '@/components/Icon';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { UsageMeter } from '@/components/UsageMeter';
import { Badge, Banner, Card, GradientCard, IconTile, Segmented } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import {
  accents,
  colors,
  gradients,
  radius,
  shadow,
  space,
  typography,
  type Accent,
} from '@/theme';

type Tab = 'usage' | 'plans' | 'payments';

/** How a plan card relates to what the customer has now. */
type CardState = 'choose' | 'current' | 'renew_later' | 'upgrade' | 'later' | 'too_small';

const PLAN_ACCENT: Record<string, Accent> = { trial: 'teal', basic: 'sky', plus: 'violet' };
const PLAN_GRADIENT: Record<string, readonly [string, string]> = {
  trial: gradients.trial,
  basic: gradients.basic,
  plus: gradients.plus,
};

/**
 * Plan & Usage (M5/M6/M7) — one place for the plan, what's used and left,
 * what Propittu has delivered, upgrades, and payments with receipts.
 * Available in Limited Access.
 */
export default function PlanScreen() {
  const state = useAccountPlan();
  const plans = usePlans();
  const orders = useOrders();
  const checkout = usePlanCheckout();
  const properties = useProperties();
  const services = useServices();
  const [tab, setTab] = useState<Tab>('usage');

  if (state.isPending) return <LoadingState />;
  if (state.error) return <ErrorState error={state.error} onRetry={() => void state.refetch()} />;
  const s = state.data;
  const code = s.plan?.code ?? null;

  const paidPlan = !!s.plan && s.plan.price_paise > 0;
  const currentPrice = paidPlan ? (s.plan?.price_paise ?? 0) : 0;
  const topCode = plans.data?.reduce<PublicPlan | null>(
    (top, p) => (!top || p.price_paise > top.price_paise ? p : top),
    null,
  )?.code;
  const owned = s.usage.properties;
  // Renewing opens in the last RENEWAL_WINDOW_DAYS (the server enforces it too).
  const daysLeft = s.current?.days_left ?? 0;
  const canRenew = daysLeft <= RENEWAL_WINDOW_DAYS;
  const renewFrom = s.current
    ? formatDate(
        new Date(
          new Date(s.current.ends_at).getTime() - RENEWAL_WINDOW_DAYS * 86_400_000,
        ).toISOString(),
      )
    : null;
  const cardState = (p: PublicPlan): CardState =>
    // A plan must hold every property you have today.
    p.benefits.limits.max_properties !== undefined && owned > p.benefits.limits.max_properties
      ? 'too_small'
      : !paidPlan
        ? 'choose'
        : p.code === code
          ? canRenew
            ? 'current'
            : 'renew_later'
          : p.price_paise > currentPrice
            ? 'upgrade'
            : 'later';

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
    // Decision 2026-10-06: warn (never block) when the plan's included visits
    // can't be used at any of the customer's properties yet.
    const visitCodes = new Set(
      (services.data ?? []).filter((x) => x.reach === 'area').map((x) => x.code),
    );
    const list = properties.data ?? [];
    const includesVisits = plan.benefits.included.some((i) => visitCodes.has(i.code));
    if (
      q.mode !== 'renewal' &&
      includesVisits &&
      list.length > 0 &&
      list.every((p) => p.reach && !p.reach.visits)
    ) {
      const goOn = await dialog.confirm({
        title: 'Visits don’t reach your properties yet',
        message:
          `Our team doesn’t visit the area of ${list.length === 1 ? 'your property' : 'any of your properties'} yet, ` +
          `so ${plan.name}’s included visits can’t be used there for now. Documents, Pittu and ` +
          'reminders work as usual — we’ll tell you when we arrive.',
        icon: 'map',
        confirmLabel: 'Continue anyway',
        cancelLabel: 'Not now',
      });
      if (!goOn) return;
    }
    const period = `${formatDate(q.starts_at)} – ${formatDate(q.ends_at)}`;
    const upgrade = q.mode === 'upgrade';
    const term = BILLING_PERIOD_LABELS[plan.billing_period];
    const ok = await dialog.confirm({
      title: upgrade
        ? `Upgrade to ${plan.name}`
        : q.mode === 'renewal'
          ? `Renew ${plan.name}`
          : `Welcome to ${plan.name}`,
      message: upgrade
        ? 'More room for your properties, starting today.'
        : q.mode === 'renewal'
          ? 'Another term, added after your current one — no days lost.'
          : 'Everything you need to look after your properties.',
      icon: upgrade ? 'gem' : 'sparkles',
      accent: PLAN_ACCENT[plan.code] ?? 'indigo',
      highlights:
        q.mode === 'renewal' ? undefined : gains(plan.benefits, s.plan?.benefits, upgrade),
      summary: [
        { label: `${plan.name} ${term}`, value: formatPrice(q.list_price_paise) },
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
        `Valid ${period}` +
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
      onSuccess: (order) =>
        order.status === 'paid'
          ? void dialog.alert({
              title: 'Payment received',
              message: `Your ${plan.name} plan is active.`,
              tone: 'success',
              icon: 'celebrate',
              buttonLabel: 'Great',
            })
          : void dialog.alert({
              title: 'Payment not confirmed yet',
              message:
                'If you completed the payment, it updates within a minute — pull down to refresh.',
              icon: 'clock',
            }),
      onError: (err) =>
        void dialog.alert({
          title: "Couldn't start the payment",
          message: errorMessage(err),
          tone: 'danger',
        }),
    });
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <PullRefresh
          onRefresh={() => Promise.all([state.refetch(), plans.refetch(), orders.refetch()])}
        />
      }
    >
      <CurrentPlan
        state={s}
        onTop={!!code && code === topCode}
        canRenew={canRenew}
        onAction={() => setTab('plans')}
      />

      {s.over_limit.length > 0 ? (
        <Banner
          tone="warning"
          message={`Over your ${s.over_limit.map((c) => LIMIT_LABELS[c].toLowerCase()).join(', ')} limit — nothing is deleted, but you can't add more until you upgrade.`}
          action="Upgrade"
          onPress={() => setTab('plans')}
        />
      ) : null}

      <Segmented
        options={[
          { value: 'usage', label: 'Usage' },
          { value: 'plans', label: 'Plans' },
          { value: 'payments', label: 'Payments' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'usage' ? (
        <UsageTab state={s} />
      ) : tab === 'plans' ? (
        plans.isPending ? (
          <LoadingState />
        ) : plans.error ? (
          <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />
        ) : (
          <View style={styles.list}>
            {plans.data.map((p) => (
              <PlanCard
                key={p.code}
                plan={p}
                state={cardState(p)}
                laterDate={s.current ? formatDate(s.current.ends_at) : null}
                renewFrom={renewFrom}
                popular={!paidPlan && p.code === topCode}
                busy={checkout.isPending && checkout.variables === p.code}
                disabled={checkout.isPending}
                onChoose={() => void choose(p)}
              />
            ))}
          </View>
        )
      ) : orders.isPending ? (
        <LoadingState />
      ) : (
        <Payments orders={orders.data ?? []} />
      )}
    </ScrollView>
  );
}

/* ---- Current plan: one slim card with the one action that matters ---- */

function CurrentPlan({
  state: s,
  onTop,
  canRenew,
  onAction,
}: {
  state: AccountPlanState;
  onTop: boolean;
  canRenew: boolean;
  onAction: () => void;
}) {
  const code = s.plan?.code ?? '';
  const trial = s.status === 'trialing';
  // On the top plan the only action is renewing — and only in the renewal window.
  const cta =
    s.status === 'expired' || trial
      ? 'Choose a plan'
      : !onTop
        ? 'Upgrade'
        : canRenew
          ? 'Renew'
          : null;
  const days = s.current?.days_left ?? 0;
  return (
    <GradientCard colors={PLAN_GRADIENT[code] ?? gradients.limited} style={styles.hero}>
      <View style={styles.flex}>
        <Text style={styles.heroOver}>{PLAN_STATUS_LABELS[s.status]}</Text>
        <Text style={styles.heroTitle} numberOfLines={1}>
          {s.plan?.name ?? 'No active plan'}
        </Text>
        <Text style={styles.heroLine} numberOfLines={1}>
          {s.current
            ? `${days} ${days === 1 ? 'day' : 'days'} remaining · until ${formatDate(s.current.ends_at)}`
            : 'Your data is safe — choose a plan to carry on'}
        </Text>
      </View>
      {cta ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          style={({ pressed }) => [styles.heroCta, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.heroCtaText}>{cta}</Text>
        </Pressable>
      ) : null}
    </GradientCard>
  );
}

/* ---- Payments: completed first; attempts that didn't go through, muted ---- */

function Payments({ orders }: { orders: Order[] }) {
  const done = orders.filter((o) => o.display_status !== 'failed');
  const failed = orders.filter((o) => o.display_status === 'failed').slice(0, 10);
  if (orders.length === 0) {
    return (
      <View style={styles.empty}>
        <EmptyState
          icon="receipt"
          accent="sky"
          title="No payments yet"
          message="Plan and service payments will appear here with receipts."
        />
      </View>
    );
  }
  return (
    <View style={styles.list}>
      {done.length > 0 ? (
        <Card style={styles.history}>
          {done.map((o, i) => (
            <PaymentRow key={o.id} order={o} first={i === 0} />
          ))}
        </Card>
      ) : (
        <Text style={[typography.small, styles.centerText]}>No completed payments yet.</Text>
      )}
      {failed.length > 0 ? (
        <>
          <Text style={typography.overline}>Not completed</Text>
          <Card style={[styles.history, styles.muted]}>
            {failed.map((o, i) => (
              <PaymentRow key={o.id} order={o} first={i === 0} />
            ))}
          </Card>
          <Text style={typography.caption}>
            These payments were started but not finished. You were not charged.
          </Text>
        </>
      ) : null}
    </View>
  );
}

function PaymentRow({ order: o, first }: { order: Order; first: boolean }) {
  const st = o.display_status;
  const tone = st === 'paid' ? 'success' : st === 'processing' ? 'warning' : 'neutral';
  return (
    <Pressable
      onPress={() => router.push(`/receipts/${o.id}`)}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.payment,
        !first && styles.paymentBorder,
        pressed && { opacity: 0.7 },
      ]}
    >
      <IconTile
        icon="receipt"
        accent={st === 'paid' ? 'teal' : st === 'processing' ? 'amber' : 'slate'}
        size={30}
      />
      <View style={styles.flex}>
        <Text style={typography.bodyStrong} numberOfLines={1}>
          {o.description}
        </Text>
        <Text style={typography.caption} numberOfLines={1}>
          {o.period
            ? `${formatDate(o.period.starts_at)} – ${formatDate(o.period.ends_at)}`
            : formatDate(o.paid_at ?? o.created_at)}
        </Text>
        {o.credit_paise > 0 ? (
          <Text style={typography.caption} numberOfLines={1}>
            {formatPrice(o.credit_paise)} credit applied
          </Text>
        ) : null}
      </View>
      <View style={styles.amount}>
        <Text style={[typography.bodyStrong, st === 'failed' && styles.struck]}>
          {formatPrice(o.amount_paise)}
        </Text>
        <Badge label={ORDER_DISPLAY_LABELS[st]} tone={tone} />
      </View>
    </Pressable>
  );
}

/** What a plan adds (vs the current one on an upgrade) — at most four lines. */
function gains(next: PlanBenefits, cur: PlanBenefits | undefined, upgrade: boolean): string[] {
  const fmt = (c: LimitCode, v: number) =>
    c === 'max_storage_mb'
      ? `${formatStorageMb(v)} storage`
      : `${v} ${LIMIT_LABELS[c].toLowerCase()}`;
  const out: string[] = [];
  // Most persuasive first.
  const order: LimitCode[] = [
    'max_properties',
    'max_storage_mb',
    'max_documents_per_property',
    'max_photos_per_property',
    'max_videos_per_property',
  ];
  for (const c of order) {
    const v = next.limits[c];
    const was = cur?.limits[c];
    if (v === undefined || (upgrade && was !== undefined && v <= was)) continue;
    const from = c === 'max_storage_mb' ? formatStorageMb(was ?? 0) : String(was);
    out.push(upgrade && was !== undefined ? `${fmt(c, v)}, up from ${from}` : fmt(c, v));
  }
  for (const i of next.included) {
    const was = cur?.included.find((x) => x.code === i.code)?.quantity ?? 0;
    if (upgrade && i.quantity <= was) continue;
    out.unshift(
      `${i.quantity} ${(INCLUDED_SERVICE_LABELS[i.code] ?? i.code).toLowerCase()} a year`,
    );
  }
  return out.slice(0, 4);
}

/* ---- Usage: every allowance, measured in full ---- */

function UsageTab({ state: s }: { state: AccountPlanState }) {
  const l = s.plan?.benefits.limits ?? {};
  const u = s.usage;
  const deleted = u.deleted_still_counted.length;
  return (
    <Card style={styles.usage}>
      <UsageMeter
        icon="home"
        accent="indigo"
        label="Properties"
        hint={deleted ? `This term · incl. ${deleted} deleted` : 'This term'}
        used={u.property_slots_used}
        limit={l.max_properties}
      />
      {u.included.map((i) => (
        <UsageMeter
          key={i.code}
          icon="compass"
          accent="teal"
          label={INCLUDED_SERVICE_LABELS[i.code] ?? i.code}
          hint="Included this year"
          used={i.used}
          limit={i.quantity}
        />
      ))}
      <UsageMeter
        icon="storage"
        accent="violet"
        label="Storage"
        used={Math.ceil(u.storage_bytes / (1024 * 1024))}
        limit={l.max_storage_mb}
        format={formatStorageMb}
      />
      <UsageMeter
        icon="document"
        accent="amber"
        label="Documents"
        hint={`${u.documents} in total · fullest property`}
        used={u.max_documents_on_a_property}
        limit={l.max_documents_per_property}
      />
      <UsageMeter
        icon="image"
        accent="sky"
        label="Photos"
        hint={`${u.photos} in total · fullest property`}
        used={u.max_photos_on_a_property}
        limit={l.max_photos_per_property}
      />
      <UsageMeter
        icon="video"
        accent="rose"
        label="Videos"
        hint={`${u.videos} in total · fullest property`}
        used={u.max_videos_on_a_property}
        limit={l.max_videos_per_property}
      />
    </Card>
  );
}

/* ---- Plans: one card each, showing only what matters when choosing ---- */

/** The four things people choose a plan on. */
function keyBenefits(b: PlanBenefits): string[] {
  const visits = b.included.find((i) => i.code === 'property_visit')?.quantity ?? 0;
  return [
    b.limits.max_properties !== undefined ? `${b.limits.max_properties} properties` : null,
    b.limits.max_storage_mb ? `${formatStorageMb(b.limits.max_storage_mb)} storage` : null,
    b.limits.max_documents_per_property !== undefined
      ? `${b.limits.max_documents_per_property} documents per property`
      : null,
    `${visits} property visit${visits === 1 ? '' : 's'} a year`,
  ].filter((x): x is string => x !== null);
}

function PlanCard({
  plan,
  state,
  laterDate,
  renewFrom,
  popular,
  busy,
  disabled,
  onChoose,
}: {
  plan: PublicPlan;
  state: CardState;
  laterDate: string | null;
  renewFrom: string | null;
  popular: boolean;
  busy: boolean;
  disabled: boolean;
  onChoose: () => void;
}) {
  const a = accents[PLAN_ACCENT[plan.code] ?? 'slate'];
  const mine = state === 'current' || state === 'renew_later';
  const locked = state === 'later' || state === 'too_small' || state === 'renew_later';
  const label = busy
    ? 'Opening payment…'
    : state === 'current'
      ? 'Renew'
      : state === 'renew_later'
        ? `Renew from ${renewFrom ?? 'later'}`
        : state === 'upgrade'
          ? `Upgrade to ${plan.name}`
          : state === 'too_small'
            ? `Holds ${plan.benefits.limits.max_properties} properties — you have more`
            : state === 'later'
              ? `Available after ${laterDate ?? 'your plan ends'}`
              : `Choose ${plan.name}`;
  return (
    <View style={[styles.planCard, shadow, mine && { borderColor: a.fg }]}>
      <View style={styles.planHead}>
        <View style={styles.flex}>
          <View style={styles.planNameRow}>
            <Text style={typography.title}>{plan.name}</Text>
            {mine ? <Badge label="Your plan" tone="success" icon="check" /> : null}
            {popular ? <Badge label="Most popular" tone="brand" icon="sparkles" /> : null}
          </View>
          {plan.description ? (
            <Text style={typography.small} numberOfLines={2}>
              {plan.description}
            </Text>
          ) : null}
        </View>
        <Text style={styles.price}>
          {formatPrice(plan.price_paise)}
          <Text style={styles.per}>/{plan.billing_period === 'month' ? 'mo' : 'yr'}</Text>
        </Text>
      </View>
      <View style={styles.benefits}>
        {keyBenefits(plan.benefits).map((l) => (
          <View key={l} style={styles.benefit}>
            <Icon name="check" size={14} color={a.fg} strokeWidth={3} />
            <Text style={[typography.small, styles.benefitText]}>{l}</Text>
          </View>
        ))}
      </View>
      {state === 'upgrade' ? (
        <Text style={typography.caption}>
          Pay only the difference — unused days on your current plan are credited.
        </Text>
      ) : null}
      <Pressable
        onPress={onChoose}
        disabled={disabled || locked}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.cta,
          { backgroundColor: mine || locked ? a.bg : a.fg },
          (pressed || disabled) && { opacity: 0.8 },
        ]}
      >
        <Text style={[styles.ctaText, (mine || locked) && { color: a.fg }]}>{label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  content: { padding: space.lg, paddingTop: space.xs, gap: space.md, paddingBottom: space.xxl },
  list: { gap: space.md },
  empty: { minHeight: 260 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  heroOver: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  heroLine: { color: 'rgba(255,255,255,0.9)', fontSize: 12 },
  heroCta: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: space.lg,
  },
  heroCtaText: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  usage: { paddingVertical: 0 },
  planCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 14,
    gap: space.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  planHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  planNameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  price: { fontSize: 22, fontWeight: '800', color: colors.text },
  per: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  benefits: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 6 },
  benefit: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 4 },
  benefitText: { flex: 1, color: colors.text },
  cta: { borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
  ctaText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  history: { paddingVertical: space.xs },
  payment: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10 },
  paymentBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  amount: { alignItems: 'flex-end', gap: 3 },
  muted: { opacity: 0.75 },
  struck: { color: colors.textSubtle, textDecorationLine: 'line-through' },
  centerText: { textAlign: 'center' },
});
