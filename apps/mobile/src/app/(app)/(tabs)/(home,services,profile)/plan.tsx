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
  ORDER_STATUS_LABELS,
  PLAN_STATUS_LABELS,
  SUPPORT_EMAIL,
  type AccountPlanState,
  type LimitCode,
  type PlanBenefits,
  type PublicPlan,
} from '@propittu/shared';
import { useOrders, usePlanCheckout } from '@/api/billing';
import { useAccountPlan, useCancelPlan, usePlans } from '@/api/queries';
import { dialog, toast } from '@/components/Dialog';
import { Icon, type IconName } from '@/components/Icon';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import {
  Badge,
  Banner,
  Card,
  GradientCard,
  IconTile,
  LinkButton,
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
  const cancel = useCancelPlan();
  const checkout = usePlanCheckout();
  const [tab, setTab] = useState<Tab>('usage');

  if (state.isPending) return <LoadingState />;
  if (state.error) return <ErrorState error={state.error} onRetry={() => void state.refetch()} />;
  const s = state.data;
  const code = s.plan?.code ?? null;

  const choose = async (plan: PublicPlan, renewing: boolean) => {
    const ok = await dialog.confirm({
      title: `${renewing ? 'Renew' : 'Get'} ${plan.name}`,
      message:
        `${formatPrice(plan.price_paise)} ${BILLING_PERIOD_LABELS[plan.billing_period]}. ` +
        (renewing
          ? 'The new period starts when the current one ends — no days lost. '
          : s.status === 'trialing'
            ? 'It starts right away and replaces your free trial. '
            : 'It starts right away. ') +
        'Pay securely by UPI or card.',
      confirmLabel: `Pay ${formatPrice(plan.price_paise)}`,
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

  const confirmCancel = async () => {
    const ok = await dialog.confirm({
      title: 'Cancel your plan?',
      message: `It stays active until ${s.current ? formatDate(s.current.ends_at) : 'the end of the period'} and won't renew. Your data is kept.`,
      confirmLabel: 'Cancel plan',
      cancelLabel: 'Keep my plan',
      tone: 'danger',
    });
    if (!ok) return;
    cancel.mutate(undefined, {
      onSuccess: () => toast('Plan will not renew', 'info'),
      onError: (err) =>
        void dialog.alert({ title: "Couldn't cancel", message: errorMessage(err), tone: 'danger' }),
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
      <CurrentPlan state={s} onAction={() => setTab('plans')} />

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
        <UsageTab state={s} onUpgrade={() => setTab('plans')} />
      ) : tab === 'plans' ? (
        plans.isPending ? (
          <LoadingState />
        ) : plans.error ? (
          <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />
        ) : (
          <View style={styles.list}>
            {plans.data.map((p) => {
              const current = code === p.code && s.status !== 'trialing';
              return (
                <PlanCard
                  key={p.code}
                  plan={p}
                  current={current}
                  popular={p.code === 'plus'}
                  busy={checkout.isPending && checkout.variables === p.code}
                  disabled={checkout.isPending}
                  onChoose={() => void choose(p, current)}
                />
              );
            })}
            {s.current && s.current.source !== 'trial' && !s.current.cancel_at_period_end ? (
              <View style={styles.center}>
                <LinkButton title="Cancel plan" tone="muted" onPress={() => void confirmCancel()} />
              </View>
            ) : null}
          </View>
        )
      ) : orders.isPending ? (
        <LoadingState />
      ) : !orders.data || orders.data.length === 0 ? (
        <View style={styles.empty}>
          <EmptyState
            icon="receipt"
            accent="sky"
            title="No payments yet"
            message="Plan and service payments will appear here with receipts."
          />
        </View>
      ) : (
        <Card style={styles.history}>
          {orders.data.map((o, i) => (
            <Pressable
              key={o.id}
              onPress={() => router.push(`/receipts/${o.id}`)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.payment,
                i > 0 && styles.paymentBorder,
                pressed && { opacity: 0.7 },
              ]}
            >
              <IconTile icon="receipt" accent={o.status === 'paid' ? 'teal' : 'amber'} size={30} />
              <View style={styles.flex}>
                <Text style={typography.bodyStrong} numberOfLines={1}>
                  {o.description}
                </Text>
                <Text style={typography.caption} numberOfLines={1}>
                  {formatDate(o.paid_at ?? o.created_at)} · {o.reference}
                </Text>
              </View>
              <View style={styles.amount}>
                <Text style={typography.bodyStrong}>{formatPrice(o.amount_paise)}</Text>
                <Badge
                  label={ORDER_STATUS_LABELS[o.status]}
                  tone={o.status === 'paid' ? 'success' : 'warning'}
                />
              </View>
            </Pressable>
          ))}
        </Card>
      )}

      <View style={styles.secure}>
        <Icon name="lock" size={12} color={colors.textSubtle} />
        <Text style={typography.caption}>Secure payments by Razorpay · {SUPPORT_EMAIL}</Text>
      </View>
    </ScrollView>
  );
}

/* ---- Current plan: compact, with the one action that matters ---- */

function CurrentPlan({ state: s, onAction }: { state: AccountPlanState; onAction: () => void }) {
  const code = s.plan?.code ?? '';
  const paid = s.plan && s.plan.price_paise > 0;
  const cta =
    s.status === 'expired'
      ? 'Choose a plan'
      : s.status === 'trialing'
        ? 'Choose a plan'
        : code === 'plus'
          ? 'Renew'
          : 'Upgrade';
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
      <Text style={styles.heroLine}>
        {paid
          ? `${formatPrice(s.plan?.price_paise ?? 0)} ${BILLING_PERIOD_LABELS[s.plan?.billing_period ?? 'year']} · `
          : ''}
        {s.current
          ? `${s.current.cancel_at_period_end || s.status === 'trialing' ? 'Ends' : 'Renews'} ${formatDate(s.current.ends_at)} · ${s.current.days_left} days left`
          : 'Your data is safe — choose a plan to carry on'}
      </Text>
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

/* ---- Usage ---- */

function UsageTab({ state: s, onUpgrade }: { state: AccountPlanState; onUpgrade: () => void }) {
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
      {s.plan?.code !== 'plus' ? (
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
  current,
  popular,
  busy,
  disabled,
  onChoose,
}: {
  plan: PublicPlan;
  current: boolean;
  popular: boolean;
  busy: boolean;
  disabled: boolean;
  onChoose: () => void;
}) {
  const a = accents[PLAN_ACCENT[plan.code] ?? 'slate'];
  return (
    <View style={[styles.planCard, shadow, popular && { borderColor: a.fg }]}>
      <View style={styles.planHead}>
        <View style={styles.flex}>
          <View style={styles.planNameRow}>
            <Text style={typography.title}>{plan.name}</Text>
            {popular ? <Badge label="Most popular" tone="brand" icon="sparkles" /> : null}
            {current ? <Badge label="Current" tone="success" /> : null}
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
      <Pressable
        onPress={onChoose}
        disabled={disabled}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.cta,
          { backgroundColor: current ? a.bg : a.fg },
          (pressed || disabled) && { opacity: 0.8 },
        ]}
      >
        <Text style={[styles.ctaText, current && { color: a.fg }]}>
          {busy ? 'Opening payment…' : current ? 'Renew' : `Choose ${plan.name}`}
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
  center: { alignItems: 'center', paddingTop: space.xs },
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
  secure: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: space.sm,
  },
});
