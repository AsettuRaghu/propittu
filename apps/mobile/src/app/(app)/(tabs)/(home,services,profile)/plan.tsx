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
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { UsageMeter } from '@/components/UsageMeter';
import { Badge, Banner, Card, GradientCard, IconTile, Segmented } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { accents, colors, gradients, radius, space, typography, type Accent } from '@/theme';

type Tab = 'usage' | 'plans' | 'payments';

/** How a plan card relates to what the customer has now. */
type CardState = 'choose' | 'current' | 'upgrade' | 'later' | 'too_small';

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
  const cardState = (p: PublicPlan): CardState =>
    // A plan must hold every property you have today.
    p.benefits.limits.max_properties !== undefined && owned > p.benefits.limits.max_properties
      ? 'too_small'
      : !paidPlan
        ? 'choose'
        : p.code === code
          ? 'current'
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
    if (includesVisits && list.length > 0 && list.every((p) => p.reach && !p.reach.visits)) {
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
      <CurrentPlan state={s} onTop={!!code && code === topCode} onAction={() => setTab('plans')} />

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
          <PlanComparison
            plans={plans.data}
            stateOf={cardState}
            laterDate={s.current ? formatDate(s.current.ends_at) : null}
            popular={paidPlan ? null : (topCode ?? null)}
            busyCode={checkout.isPending ? (checkout.variables ?? null) : null}
            onChoose={(p) => void choose(p)}
          />
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
  onAction,
}: {
  state: AccountPlanState;
  onTop: boolean;
  onAction: () => void;
}) {
  const code = s.plan?.code ?? '';
  const trial = s.status === 'trialing';
  // No "Upgrade" on the top plan — renewing early is the only thing to do.
  const cta = s.status === 'expired' || trial ? 'Choose a plan' : onTop ? 'Renew' : 'Upgrade';
  return (
    <GradientCard colors={PLAN_GRADIENT[code] ?? gradients.limited} style={styles.hero}>
      <View style={styles.flex}>
        <Text style={styles.heroOver}>{PLAN_STATUS_LABELS[s.status]}</Text>
        <Text style={styles.heroTitle} numberOfLines={1}>
          {s.plan?.name ?? 'No active plan'}
        </Text>
        <Text style={styles.heroLine} numberOfLines={1}>
          {s.current
            ? `${formatDate(s.current.starts_at)} – ${formatDate(s.current.ends_at)}`
            : 'Your data is safe — choose a plan to carry on'}
        </Text>
      </View>
      <Pressable
        onPress={onAction}
        accessibilityRole="button"
        style={({ pressed }) => [styles.heroCta, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.heroCtaText}>{cta}</Text>
      </Pressable>
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
            : formatDate(o.paid_at ?? o.created_at)}{' '}
          · {o.reference}
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

/* ---- Plans: side by side, only what matters when choosing ---- */

/** The four things people compare plans on. */
const COMPARE: { label: string; value: (b: PlanBenefits) => string }[] = [
  { label: 'Properties', value: (b) => String(b.limits.max_properties ?? '—') },
  {
    label: 'Storage',
    value: (b) => (b.limits.max_storage_mb ? formatStorageMb(b.limits.max_storage_mb) : '—'),
  },
  {
    label: 'Documents per property',
    value: (b) => String(b.limits.max_documents_per_property ?? '—'),
  },
  {
    label: 'Property visits a year',
    value: (b) => String(b.included.find((i) => i.code === 'property_visit')?.quantity ?? 0),
  },
];

function PlanComparison({
  plans,
  stateOf,
  laterDate,
  popular,
  busyCode,
  onChoose,
}: {
  plans: PublicPlan[];
  stateOf: (p: PublicPlan) => CardState;
  laterDate: string | null;
  popular: string | null;
  busyCode: string | null;
  onChoose: (p: PublicPlan) => void;
}) {
  const label = (p: PublicPlan, st: CardState) =>
    st === 'current'
      ? 'Renew'
      : st === 'upgrade'
        ? 'Upgrade'
        : st === 'too_small'
          ? `Holds ${p.benefits.limits.max_properties}`
          : st === 'later'
            ? `After ${laterDate ?? 'renewal'}`
            : 'Choose';
  return (
    <View style={styles.list}>
      <Card style={styles.compare}>
        <View style={styles.compareRow}>
          <View style={styles.compareLabel} />
          {plans.map((p) => {
            const a = accents[PLAN_ACCENT[p.code] ?? 'slate'];
            const st = stateOf(p);
            return (
              <View key={p.code} style={styles.compareCol}>
                <Text style={[styles.planName, { color: a.fg }]}>{p.name}</Text>
                <Text style={styles.price}>{formatPrice(p.price_paise)}</Text>
                <Text style={typography.caption}>
                  {p.billing_period === 'month' ? 'a month' : 'a year'}
                </Text>
                {st === 'current' ? (
                  <Badge label="Your plan" tone="success" />
                ) : popular === p.code ? (
                  <Badge label="Popular" tone="brand" />
                ) : null}
              </View>
            );
          })}
        </View>
        {COMPARE.map((c) => (
          <View key={c.label} style={[styles.compareRow, styles.compareLine]}>
            <Text style={[typography.small, styles.compareLabel]}>{c.label}</Text>
            {plans.map((p) => (
              <Text key={p.code} style={[typography.bodyStrong, styles.compareCol]}>
                {c.value(p.benefits)}
              </Text>
            ))}
          </View>
        ))}
        <View style={[styles.compareRow, styles.compareLine]}>
          <View style={styles.compareLabel} />
          {plans.map((p) => {
            const st = stateOf(p);
            const a = accents[PLAN_ACCENT[p.code] ?? 'slate'];
            const muted = st === 'current' || st === 'later' || st === 'too_small';
            return (
              <View key={p.code} style={styles.compareCol}>
                <Pressable
                  onPress={() => onChoose(p)}
                  disabled={busyCode !== null || st === 'later' || st === 'too_small'}
                  accessibilityRole="button"
                  accessibilityLabel={`${label(p, st)} ${p.name}`}
                  style={({ pressed }) => [
                    styles.cta,
                    { backgroundColor: muted ? a.bg : a.fg },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text style={[styles.ctaText, muted && { color: a.fg }]} numberOfLines={1}>
                    {busyCode === p.code ? '…' : label(p, st)}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      </Card>
      {plans.some((p) => stateOf(p) === 'upgrade') ? (
        <Text style={[typography.caption, styles.centerText]}>
          Upgrading? You pay only the difference — unused days are credited.
        </Text>
      ) : null}
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
  compare: { paddingVertical: space.xs },
  compareRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 10 },
  compareLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  compareLabel: { flex: 1.3 },
  compareCol: { flex: 1, alignItems: 'center', textAlign: 'center', gap: 2 },
  planName: { fontSize: 15, fontWeight: '800' },
  price: { fontSize: 20, fontWeight: '800', color: colors.text },
  cta: {
    alignSelf: 'stretch',
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  ctaText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  history: { paddingVertical: space.xs },
  payment: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10 },
  paymentBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  amount: { alignItems: 'flex-end', gap: 3 },
  muted: { opacity: 0.75 },
  struck: { color: colors.textSubtle, textDecorationLine: 'line-through' },
  centerText: { textAlign: 'center' },
});
