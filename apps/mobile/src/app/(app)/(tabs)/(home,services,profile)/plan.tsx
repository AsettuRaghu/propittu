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
  type LimitCode,
  type PlanBenefits,
  type PublicPlan,
} from '@propittu/shared';
import { useOrders, usePlanCheckout } from '@/api/billing';
import { useAccountPlan, useCancelPlan, usePlans } from '@/api/queries';
import { dialog, toast } from '@/components/Dialog';
import { Icon, type IconName } from '@/components/Icon';
import { ErrorState, LoadingState } from '@/components/States';
import {
  Badge,
  Banner,
  Card,
  GradientCard,
  IconTile,
  LinkButton,
  ProgressBar,
  ProgressRing,
  SectionTitle,
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

const SUPPORT_EMAIL = 'contact@propittu.com';

const PLAN_STYLE: Record<string, { gradient: readonly [string, string]; accent: Accent }> = {
  trial: { gradient: gradients.trial, accent: 'teal' },
  basic: { gradient: gradients.basic, accent: 'sky' },
  plus: { gradient: gradients.plus, accent: 'violet' },
};
const styleFor = (code: string | null | undefined) =>
  (code && PLAN_STYLE[code]) || { gradient: gradients.limited, accent: 'slate' as Accent };

/**
 * Plan & Usage (M5/M6). Available in Limited Access: status, usage against
 * limits, the available Plans and payment history.
 */
export default function PlanScreen() {
  const state = useAccountPlan();
  const plans = usePlans();
  const cancel = useCancelPlan();
  const checkout = usePlanCheckout();
  const orders = useOrders();

  if (state.isPending) return <LoadingState />;
  if (state.error) return <ErrorState error={state.error} onRetry={() => void state.refetch()} />;
  const s = state.data;
  const current = styleFor(s.plan?.code);
  const termDays = s.plan?.term_days ?? 30;

  const confirmCancel = async () => {
    const ok = await dialog.confirm({
      title: 'Cancel your plan?',
      message: `It stays active until ${s.current ? formatDate(s.current.ends_at) : 'the end of the period'} and won't renew. Your data is kept.`,
      confirmLabel: 'Cancel plan',
      cancelLabel: 'Keep my plan',
      tone: 'danger',
      icon: 'plan',
    });
    if (!ok) return;
    cancel.mutate(undefined, {
      onSuccess: () => toast('Plan will not renew', 'info'),
      onError: (err) =>
        void dialog.alert({ title: "Couldn't cancel", message: errorMessage(err), tone: 'danger' }),
    });
  };

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
        "You'll pay on Razorpay's secure page by UPI or card.",
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
              message: `Thank you! Your ${plan.name} plan is active.`,
              tone: 'success',
              icon: 'celebrate',
              buttonLabel: 'Great',
            })
          : void dialog.alert({
              title: 'Payment not confirmed yet',
              message:
                'If you completed the payment, your plan updates within a minute — pull down to refresh.',
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

  const limits = s.plan?.benefits.limits ?? {};

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
      {/* Current plan hero */}
      <GradientCard colors={current.gradient} style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.flex}>
            <Text style={styles.heroOver}>Your plan</Text>
            <Text style={styles.heroTitle} numberOfLines={1}>
              {s.plan?.name ?? 'No active plan'}
            </Text>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillText}>{PLAN_STATUS_LABELS[s.status]}</Text>
            </View>
          </View>
          {s.current ? (
            <ProgressRing
              progress={s.current.days_left / termDays}
              size={74}
              stroke={7}
              color="#FFFFFF"
              track="rgba(255,255,255,0.25)"
            >
              <Text style={styles.ringDays}>{s.current.days_left}</Text>
              <Text style={styles.ringLabel}>days</Text>
            </ProgressRing>
          ) : (
            <Icon name="lock" size={40} color="rgba(255,255,255,0.8)" />
          )}
        </View>
        <Text style={styles.heroFoot}>
          {s.current
            ? s.status === 'trialing'
              ? `Free trial with Plus benefits · ends ${formatDate(s.current.ends_at)}`
              : s.current.cancel_at_period_end
                ? `Active until ${formatDate(s.current.ends_at)} · will not renew`
                : `Renews or ends ${formatDate(s.current.ends_at)}`
            : 'Your data is safe. Choose a plan below to carry on.'}
        </Text>
      </GradientCard>

      {s.over_limit.length > 0 ? (
        <Banner
          tone="warning"
          title="You're over a plan limit"
          message={`${s.over_limit
            .map((c) => LIMIT_LABELS[c])
            .join(
              ', ',
            )}: nothing is deleted, but you can't add more until you upgrade or remove items.`}
        />
      ) : null}

      {/* Usage */}
      {s.plan ? (
        <View>
          <SectionTitle title="Usage" />
          <View style={styles.usage}>
            <UsageTile
              icon="home"
              accent="indigo"
              label="Properties"
              used={s.usage.properties}
              limit={limits.max_properties}
            />
            <UsageTile
              icon="storage"
              accent="sky"
              label="Storage"
              used={Math.ceil(s.usage.storage_bytes / (1024 * 1024))}
              limit={limits.max_storage_mb}
              format={formatStorageMb}
            />
            {s.usage.included.map((i) => (
              <UsageTile
                key={i.code}
                icon="compass"
                accent="teal"
                label={INCLUDED_SERVICE_LABELS[i.code] ?? i.code}
                used={i.used}
                limit={i.quantity}
              />
            ))}
          </View>
        </View>
      ) : null}

      {/* Plans */}
      <View>
        <SectionTitle title="Choose your plan" subtitle="Simple yearly pricing · cancel anytime" />
        {plans.isPending ? (
          <LoadingState />
        ) : plans.error ? (
          <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />
        ) : (
          <View style={styles.plans}>
            {plans.data.map((p) => {
              const isCurrent = s.plan?.code === p.code && s.status !== 'trialing';
              return (
                <PlanCard
                  key={p.code}
                  plan={p}
                  current={isCurrent}
                  popular={p.code === 'plus'}
                  busy={checkout.isPending && checkout.variables === p.code}
                  disabled={checkout.isPending}
                  onChoose={() => void choose(p, isCurrent)}
                />
              );
            })}
          </View>
        )}
      </View>

      {/* Payments */}
      {orders.data && orders.data.length > 0 ? (
        <View>
          <SectionTitle title="Payment history" />
          <Card style={styles.history}>
            {orders.data.map((o) => (
              <View key={o.id} style={styles.payment}>
                <IconTile
                  icon="receipt"
                  accent={o.status === 'paid' ? 'teal' : 'amber'}
                  size={36}
                />
                <View style={styles.flex}>
                  <Text style={typography.bodyStrong} numberOfLines={1}>
                    {o.description}
                  </Text>
                  <Text style={typography.caption} numberOfLines={1}>
                    {formatDate(o.paid_at ?? o.created_at)}
                    {o.payment?.method ? ` · ${o.payment.method.toUpperCase()}` : ''}
                    {o.refunded_paise > 0 ? ` · refunded ${formatPrice(o.refunded_paise)}` : ''}
                  </Text>
                </View>
                <View style={styles.amount}>
                  <Text style={typography.bodyStrong}>{formatPrice(o.amount_paise)}</Text>
                  <Badge
                    label={ORDER_STATUS_LABELS[o.status]}
                    tone={o.status === 'paid' ? 'success' : 'warning'}
                  />
                </View>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      <View style={styles.footer}>
        {s.current && s.current.source !== 'trial' && !s.current.cancel_at_period_end ? (
          <LinkButton title="Cancel plan" tone="muted" onPress={() => void confirmCancel()} />
        ) : null}
        <View style={styles.secure}>
          <Icon name="lock" size={13} color={colors.textSubtle} />
          <Text style={typography.caption}>Secure payments by Razorpay · {SUPPORT_EMAIL}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function UsageTile({
  icon,
  accent,
  label,
  used,
  limit,
  format = String,
}: {
  icon: IconName;
  accent: Accent;
  label: string;
  used: number;
  limit: number | undefined;
  format?: (n: number) => string;
}) {
  const over = limit !== undefined && used > limit;
  const a = accents[accent];
  return (
    <View style={[styles.usageTile, shadow]}>
      <IconTile icon={icon} accent={accent} size={32} />
      <Text style={styles.usageValue} numberOfLines={1}>
        {format(used)}
        {limit !== undefined ? <Text style={styles.usageOf}> / {format(limit)}</Text> : null}
      </Text>
      <Text style={typography.caption} numberOfLines={1}>
        {label}
      </Text>
      {limit ? (
        <ProgressBar
          progress={used / limit}
          height={5}
          color={over ? colors.warning : a.fg}
          track={a.bg}
        />
      ) : null}
    </View>
  );
}

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
  const st = styleFor(plan.code);
  const a = accents[st.accent];
  return (
    <View style={[styles.planCard, shadow, popular && { borderColor: a.fg }]}>
      {popular ? (
        <View style={[styles.ribbon, { backgroundColor: a.fg }]}>
          <Icon name="sparkles" size={12} color="#FFFFFF" />
          <Text style={styles.ribbonText}>Most popular</Text>
        </View>
      ) : null}
      <View style={styles.planHead}>
        <IconTile icon={plan.code === 'plus' ? 'gem' : 'plan'} accent={st.accent} size={40} />
        <View style={styles.flex}>
          <Text style={typography.title}>{plan.name}</Text>
          {plan.description ? (
            <Text style={typography.small} numberOfLines={2}>
              {plan.description}
            </Text>
          ) : null}
        </View>
      </View>
      <Text style={styles.price}>
        {formatPrice(plan.price_paise)}
        <Text style={styles.per}> {BILLING_PERIOD_LABELS[plan.billing_period]}</Text>
      </Text>
      <BenefitList benefits={plan.benefits} color={a.fg} />
      <Pressable
        onPress={onChoose}
        disabled={disabled}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.cta,
          current ? { backgroundColor: a.bg } : { backgroundColor: a.fg },
          (pressed || disabled) && { opacity: 0.8 },
        ]}
      >
        <Text style={[styles.ctaText, current && { color: a.fg }]}>
          {busy ? 'Opening payment…' : current ? 'Your plan · Renew' : `Choose ${plan.name}`}
        </Text>
      </Pressable>
    </View>
  );
}

function BenefitList({ benefits, color }: { benefits: PlanBenefits; color: string }) {
  const limitText = (code: LimitCode, value: number) =>
    code === 'max_storage_mb'
      ? `${formatStorageMb(value)} storage`
      : `${value} ${LIMIT_LABELS[code].toLowerCase()}`;
  const lines = [
    ...LIMIT_CODES.filter((c) => benefits.limits[c] !== undefined).map((c) =>
      limitText(c, benefits.limits[c] as number),
    ),
    ...benefits.included.map(
      (i) =>
        `${i.quantity} ${(INCLUDED_SERVICE_LABELS[i.code] ?? i.code).toLowerCase()} ${i.period === 'year' ? 'a year' : 'included'}`,
    ),
    ...benefits.features.filter((f) => f in FEATURE_LABELS).map((f) => FEATURE_LABELS[f]),
  ];
  return (
    <View style={styles.benefits}>
      {lines.map((l) => (
        <View key={l} style={styles.benefit}>
          <Icon name="check" size={15} color={color} strokeWidth={3} />
          <Text style={[typography.body, styles.flex]}>{l}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  content: { padding: space.lg, paddingTop: space.xs, gap: space.xl, paddingBottom: space.xxl },
  hero: { gap: space.lg, padding: space.xl },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  heroOver: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginVertical: 4,
  },
  heroPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 5,
  },
  heroPillText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  ringDays: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', lineHeight: 22 },
  ringLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '700' },
  heroFoot: { color: 'rgba(255,255,255,0.9)', fontSize: 13 },
  usage: { flexDirection: 'row', gap: space.sm },
  usageTile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    gap: 6,
  },
  usageValue: { fontSize: 17, fontWeight: '800', color: colors.text, marginTop: 2 },
  usageOf: { fontSize: 13, fontWeight: '600', color: colors.textSubtle },
  plans: { gap: space.lg },
  planCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  ribbon: {
    position: 'absolute',
    top: -12,
    right: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 5,
  },
  ribbonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  price: { fontSize: 30, fontWeight: '800', color: colors.text, letterSpacing: -0.8 },
  per: { fontSize: 14, fontWeight: '600', color: colors.textMuted, letterSpacing: 0 },
  benefits: { gap: 8 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cta: { borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', marginTop: space.xs },
  ctaText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  history: { gap: space.md },
  payment: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  amount: { alignItems: 'flex-end', gap: 4 },
  footer: { alignItems: 'center', gap: space.md },
  secure: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});
