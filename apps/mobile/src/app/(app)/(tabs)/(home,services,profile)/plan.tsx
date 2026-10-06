import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  BILLING_PERIOD_LABELS,
  FEATURE_LABELS,
  formatPrice,
  formatStorageMb,
  INCLUDED_SERVICE_LABELS,
  LIMIT_CODES,
  LIMIT_LABELS,
  ORDER_DISPLAY_LABELS,
  PLAN_STATUS_LABELS,
  SUPPORT_EMAIL,
  type AccountPlanState,
  type LimitCode,
  type Order,
  type PlanBenefits,
  type PublicPlan,
} from '@propittu/shared';
import { fetchPlanQuote, useOrders, usePlanCheckout } from '@/api/billing';
import { useAccountPlan, usePlans } from '@/api/queries';
import { dialog } from '@/components/Dialog';
import { Icon, type IconName } from '@/components/Icon';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import {
  Badge,
  Banner,
  Card,
  GradientCard,
  IconTile,
  ProgressBar,
  Segmented,
} from '@/components/ui';
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
type CardState = 'choose' | 'current' | 'upgrade' | 'later';

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
  const cardState = (p: PublicPlan): CardState =>
    !paidPlan
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
    const period = `${formatDate(q.starts_at)} – ${formatDate(q.ends_at)}`;
    const lines =
      q.mode === 'upgrade'
        ? [
            `${plan.name} price: ${formatPrice(q.list_price_paise)}`,
            `Credit for unused ${q.current_plan_name ?? 'plan'}: − ${formatPrice(q.credit_paise)}`,
            `${plan.name} starts now: ${period}. Visits you've already used this year still count.`,
          ]
        : q.mode === 'renewal'
          ? [`Adds another term after your current one: ${period}. No days lost.`]
          : [
              `Valid ${period}.` +
                (q.bonus_days > 0
                  ? ` Includes the ${q.bonus_days} trial day${q.bonus_days === 1 ? '' : 's'} you had left.`
                  : ''),
            ];
    const ok = await dialog.confirm({
      title:
        q.mode === 'upgrade'
          ? `Upgrade to ${plan.name}`
          : q.mode === 'renewal'
            ? `Renew ${plan.name}`
            : `Get ${plan.name}`,
      message: [...lines, 'Pay securely by UPI or card.'].join('\n\n'),
      confirmLabel: `Pay ${formatPrice(q.amount_paise)}`,
      cancelLabel: 'Not now',
      icon: 'card',
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
        <RefreshControl
          refreshing={state.isRefetching}
          onRefresh={() => {
            void state.refetch();
            void plans.refetch();
            void orders.refetch();
          }}
          tintColor={colors.primary}
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
        <UsageTab state={s} onTop={!!code && code === topCode} onUpgrade={() => setTab('plans')} />
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

      <View style={styles.secure}>
        <Icon name="lock" size={12} color={colors.textSubtle} />
        <Text style={typography.caption}>Secure payments by Razorpay · {SUPPORT_EMAIL}</Text>
      </View>
    </ScrollView>
  );
}

/* ---- Current plan: compact, with the one action that matters ---- */

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
  const paid = s.plan && s.plan.price_paise > 0;
  const trial = s.status === 'trialing';
  // No "Upgrade" on the top plan — renewing early is the only thing to do.
  const cta = s.status === 'expired' || trial ? 'Choose a plan' : onTop ? 'Renew early' : 'Upgrade';
  return (
    <GradientCard colors={PLAN_GRADIENT[code] ?? gradients.limited} style={styles.hero}>
      <View style={styles.heroRow}>
        <View style={styles.flex}>
          <Text style={styles.heroOver}>Current plan</Text>
          <Text style={styles.heroTitle} numberOfLines={1}>
            {s.plan?.name ?? 'No active plan'}
          </Text>
        </View>
        <View style={styles.heroPill}>
          <Text style={styles.heroPillText}>{PLAN_STATUS_LABELS[s.status]}</Text>
        </View>
      </View>
      {s.current ? (
        <>
          <Text style={styles.heroLine}>
            {paid
              ? `${formatPrice(s.plan?.price_paise ?? 0)} ${BILLING_PERIOD_LABELS[s.plan?.billing_period ?? 'year']} · `
              : ''}
            {formatDate(s.current.starts_at)} – {formatDate(s.current.ends_at)}
          </Text>
          <Text style={styles.heroLine}>
            {trial ? 'Trial ends' : 'Valid till'} {formatDate(s.current.ends_at)} ·{' '}
            {s.current.days_left} day{s.current.days_left === 1 ? '' : 's'} left
          </Text>
        </>
      ) : (
        <Text style={styles.heroLine}>Your data is safe — choose a plan to carry on</Text>
      )}
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

/* ---- Usage ---- */

function UsageTab({
  state: s,
  onTop,
  onUpgrade,
}: {
  state: AccountPlanState;
  onTop: boolean;
  onUpgrade: () => void;
}) {
  const l = s.plan?.benefits.limits ?? {};
  const u = s.usage;
  const visits = u.included.find((i) => i.code === 'property_visit');
  const visitsLeft = visits ? Math.max(0, visits.quantity - visits.used) : 0;

  return (
    <View style={styles.list}>
      <Card style={styles.usageCard}>
        <UsageRow
          icon="home"
          accent="indigo"
          label="Properties"
          used={u.properties}
          limit={l.max_properties}
        />
        <UsageRow
          icon="document"
          accent="amber"
          label="Documents"
          hint={`${u.documents} in total · per property`}
          used={u.max_documents_on_a_property}
          limit={l.max_documents_per_property}
        />
        <UsageRow
          icon="image"
          accent="sky"
          label="Photos"
          hint={`${u.photos} in total · per property`}
          used={u.max_photos_on_a_property}
          limit={l.max_photos_per_property}
        />
        <UsageRow
          icon="video"
          accent="rose"
          label="Videos"
          hint={`${u.videos} in total · per property`}
          used={u.max_videos_on_a_property}
          limit={l.max_videos_per_property}
        />
        <UsageRow
          icon="storage"
          accent="violet"
          label="Storage"
          used={Math.ceil(u.storage_bytes / (1024 * 1024))}
          limit={l.max_storage_mb}
          format={formatStorageMb}
        />
        {u.included.map((i) => (
          <UsageRow
            key={i.code}
            icon="compass"
            accent="teal"
            label={INCLUDED_SERVICE_LABELS[i.code] ?? i.code}
            hint="included this year"
            used={i.used}
            limit={i.quantity}
            last
          />
        ))}
      </Card>

      <Card style={styles.received}>
        <Text style={typography.overline}>Received from Propittu</Text>
        <View style={styles.receivedRow}>
          <Received value={s.received.services_completed} label="Services done" />
          <Received value={s.received.visit_reports} label="Visit reports" />
          <Received value={s.received.paid_orders} label="Payments" />
        </View>
      </Card>

      {visitsLeft > 0 ? (
        <Nudge
          icon="compass"
          accent="teal"
          title={`${visitsLeft} included visit${visitsLeft === 1 ? '' : 's'} left`}
          text="Book a property visit — photos and a report included."
          cta="Book"
          onPress={() => router.push('/services/request')}
        />
      ) : (
        <Nudge
          icon="services"
          accent="teal"
          title="Need help at your property?"
          text="Inspections, cleaning, repairs and more as extra services."
          cta="Browse"
          onPress={() => router.push('/services')}
        />
      )}
      {!onTop && s.status !== 'trialing' ? (
        <Nudge
          icon="gem"
          accent="violet"
          title="Need more room?"
          text="Plus: 5 properties, 2 GB and 2 visits a year."
          cta="Upgrade"
          onPress={onUpgrade}
        />
      ) : null}
    </View>
  );
}

function UsageRow({
  icon,
  accent,
  label,
  hint,
  used,
  limit,
  format = String,
  last = false,
}: {
  icon: IconName;
  accent: Accent;
  label: string;
  hint?: string;
  used: number;
  limit: number | undefined;
  format?: (n: number) => string;
  last?: boolean;
}) {
  const a = accents[accent];
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : null;
  const over = limit !== undefined && used > limit;
  return (
    <View style={[styles.usageRow, !last && styles.usageBorder]}>
      <View style={styles.usageTop}>
        <Icon name={icon} size={16} color={a.fg} />
        <Text style={[typography.bodyStrong, styles.flex]} numberOfLines={1}>
          {label}
          {hint ? <Text style={typography.caption}> {hint}</Text> : null}
        </Text>
        <Text style={[styles.usageNum, over && { color: colors.warning }]}>
          {format(used)}
          {limit !== undefined ? <Text style={styles.usageOf}> / {format(limit)}</Text> : null}
        </Text>
      </View>
      {pct !== null ? (
        <View style={styles.usageBar}>
          <View style={styles.flex}>
            <ProgressBar
              progress={used / (limit as number)}
              height={5}
              color={over ? colors.warning : a.fg}
              track={a.bg}
            />
          </View>
          <Text style={styles.usagePct}>{pct}%</Text>
        </View>
      ) : null}
    </View>
  );
}

function Received({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.receivedItem}>
      <Text style={styles.receivedValue}>{value}</Text>
      <Text style={typography.caption}>{label}</Text>
    </View>
  );
}

function Nudge({
  icon,
  accent,
  title,
  text,
  cta,
  onPress,
}: {
  icon: IconName;
  accent: Accent;
  title: string;
  text: string;
  cta: string;
  onPress: () => void;
}) {
  const a = accents[accent];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.nudge, shadow, pressed && { opacity: 0.85 }]}
    >
      <IconTile icon={icon} accent={accent} size={34} />
      <View style={styles.flex}>
        <Text style={typography.bodyStrong} numberOfLines={1}>
          {title}
        </Text>
        <Text style={typography.small} numberOfLines={1}>
          {text}
        </Text>
      </View>
      <View style={[styles.nudgeCta, { backgroundColor: a.bg }]}>
        <Text style={[styles.nudgeCtaText, { color: a.fg }]}>{cta}</Text>
      </View>
    </Pressable>
  );
}

/* ---- Plans ---- */

function PlanCard({
  plan,
  state,
  laterDate,
  popular,
  busy,
  disabled,
  onChoose,
}: {
  plan: PublicPlan;
  state: CardState;
  laterDate: string | null;
  popular: boolean;
  busy: boolean;
  disabled: boolean;
  onChoose: () => void;
}) {
  const a = accents[PLAN_ACCENT[plan.code] ?? 'slate'];
  const current = state === 'current';
  const later = state === 'later';
  const label = busy
    ? 'Opening payment…'
    : current
      ? 'Renew'
      : state === 'upgrade'
        ? `Upgrade to ${plan.name}`
        : later
          ? `Available after ${laterDate ?? 'your plan ends'}`
          : `Choose ${plan.name}`;
  return (
    <View style={[styles.planCard, shadow, current && { borderColor: a.fg }]}>
      <View style={styles.planHead}>
        <View style={styles.flex}>
          <View style={styles.planNameRow}>
            <Text style={typography.title}>{plan.name}</Text>
            {current ? <Badge label="Your plan" tone="success" icon="check" /> : null}
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
      <BenefitList benefits={plan.benefits} color={a.fg} />
      {state === 'upgrade' ? (
        <Text style={typography.caption}>
          Pay only the difference — unused days on your current plan are credited.
        </Text>
      ) : null}
      <Pressable
        onPress={onChoose}
        disabled={disabled || later}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.cta,
          { backgroundColor: current || later ? a.bg : a.fg },
          (pressed || disabled) && { opacity: 0.8 },
        ]}
      >
        <Text
          style={[styles.ctaText, (current || later) && { color: a.fg }, later && styles.ctaLater]}
        >
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

function BenefitList({ benefits, color }: { benefits: PlanBenefits; color: string }) {
  const limitText = (c: LimitCode, v: number) =>
    c === 'max_storage_mb'
      ? `${formatStorageMb(v)} storage`
      : `${v} ${LIMIT_LABELS[c].toLowerCase()}`;
  const lines = [
    ...LIMIT_CODES.filter((c) => benefits.limits[c] !== undefined).map((c) =>
      limitText(c, benefits.limits[c] as number),
    ),
    ...benefits.included.map(
      (i) => `${i.quantity} ${(INCLUDED_SERVICE_LABELS[i.code] ?? i.code).toLowerCase()} a year`,
    ),
    ...benefits.features.filter((f) => f in FEATURE_LABELS).map((f) => FEATURE_LABELS[f]),
  ];
  return (
    <View style={styles.benefits}>
      {lines.map((l) => (
        <View key={l} style={styles.benefit}>
          <Icon name="check" size={14} color={color} strokeWidth={3} />
          <Text style={[typography.small, styles.benefitText]}>{l}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  content: { padding: space.lg, paddingTop: space.xs, gap: space.md, paddingBottom: space.xxl },
  list: { gap: space.md },
  empty: { minHeight: 260 },
  hero: { gap: space.sm, padding: space.lg },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  heroOver: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroTitle: { color: '#FFFFFF', fontSize: 21, fontWeight: '800', letterSpacing: -0.4 },
  heroPill: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroPillText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  heroLine: { color: 'rgba(255,255,255,0.9)', fontSize: 13 },
  heroCta: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: space.xs,
  },
  heroCtaText: { color: colors.primary, fontSize: 14, fontWeight: '800' },
  usageCard: { paddingVertical: space.xs },
  usageRow: { paddingVertical: 10, gap: 6 },
  usageBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  usageTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  usageNum: { fontSize: 14, fontWeight: '800', color: colors.text },
  usageOf: { fontSize: 12, fontWeight: '600', color: colors.textSubtle },
  usageBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: 24 },
  usagePct: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSubtle,
    width: 32,
    textAlign: 'right',
  },
  received: { gap: space.sm },
  receivedRow: { flexDirection: 'row' },
  receivedItem: { flex: 1, gap: 1 },
  receivedValue: { fontSize: 20, fontWeight: '800', color: colors.text },
  nudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.md,
  },
  nudgeCta: { borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6 },
  nudgeCtaText: { fontSize: 13, fontWeight: '800' },
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
  benefit: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: space.xs,
  },
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
  ctaLater: { fontSize: 13, fontWeight: '700' },
  secure: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: space.sm,
  },
});
