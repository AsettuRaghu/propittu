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
  RENEWAL_WINDOW_DAYS,
  type AccountPlanState,
  type Order,
  type PlanBenefits,
  type PublicPlan,
} from '@propittu/shared';
import { PullRefresh } from '@/components/PullRefresh';
import { fetchPlanQuote, useOrders, usePlanCheckout } from '@/api/billing';
import { useAccountPlan, usePlans, useProperties, useServices } from '@/api/queries';
import { dialog } from '@/components/Dialog';
import { FadeIn } from '@/components/FadeIn';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { UsageMeter } from '@/components/UsageMeter';
import {
  Badge,
  Banner,
  Button,
  IconTile,
  LinkButton,
  ListGroup,
  ProgressBar,
  Segmented,
} from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { planBadge } from '@/lib/planBadge';
import { accents, colors, space, typography, type Accent } from '@/theme';

type Tab = 'usage' | 'plans' | 'payments';

/** How a plan card relates to what the customer has now. */
type CardState = 'choose' | 'current' | 'renew_later' | 'upgrade' | 'later' | 'too_small';

const PLAN_ACCENT: Record<string, Accent> = { trial: 'teal', basic: 'sky', plus: 'violet' };

/** Plans are compared on one thing for now: how many properties they hold. */
const holds = (b: PlanBenefits | undefined) => b?.limits.max_properties;

/**
 * Plan & Usage (M5/M6/M7), flat like Profile: where the plan stands, then
 * Usage · Plans · Payments. Available in Limited Access.
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
        q.mode === 'renewal' || holds(plan.benefits) === undefined
          ? undefined
          : [
              upgrade && holds(s.plan?.benefits) !== undefined
                ? `Up to ${holds(plan.benefits)} properties, up from ${holds(s.plan?.benefits)}`
                : `Up to ${holds(plan.benefits)} properties`,
            ],
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
      <FadeIn>
        <PlanHeader
          state={s}
          onTop={!!code && code === topCode}
          canRenew={canRenew}
          onAction={() => setTab('plans')}
        />
      </FadeIn>

      {s.over_limit.length > 0 ? (
        <Banner
          tone="warning"
          message={`Over your ${s.over_limit.map((c) => LIMIT_LABELS[c].toLowerCase()).join(', ')} limit — nothing is deleted, but you can't add more until you upgrade.`}
          action="Upgrade"
          onPress={() => setTab('plans')}
        />
      ) : null}

      <Segmented
        variant="underline"
        options={[
          { value: 'usage', label: 'Usage' },
          { value: 'plans', label: 'Plans' },
          { value: 'payments', label: 'Payments' },
        ]}
        value={tab}
        onChange={setTab}
      />

      <FadeIn key={tab}>
        {tab === 'usage' ? (
          <UsageTab state={s} />
        ) : tab === 'plans' ? (
          plans.isPending ? (
            <LoadingState />
          ) : plans.error ? (
            <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />
          ) : (
            <ListGroup plain>
              {plans.data.map((p) => (
                <PlanRow
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
            </ListGroup>
          )
        ) : orders.isPending ? (
          <LoadingState />
        ) : (
          <Payments orders={orders.data ?? []} />
        )}
      </FadeIn>
    </ScrollView>
  );
}

/* ---- Where the plan stands: name, status, days left, the one action ---- */

function PlanHeader({
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
  const c = s.current;
  const days = c?.days_left ?? 0;
  const termDays = c
    ? Math.max(1, (new Date(c.ends_at).getTime() - new Date(c.starts_at).getTime()) / 86_400_000)
    : 1;
  return (
    <View style={styles.header}>
      <View style={styles.headRow}>
        <Text style={typography.display} numberOfLines={1}>
          {s.plan?.name ?? 'No active plan'}
        </Text>
        <Badge {...planBadge({ status: s.status, planName: s.plan?.name ?? null })} />
        <View style={styles.flex} />
        {cta ? <LinkButton title={cta} onPress={onAction} /> : null}
      </View>
      {c ? (
        <>
          <Text style={typography.small}>
            {days} {days === 1 ? 'day' : 'days'} remaining · until {formatDate(c.ends_at)}
          </Text>
          <ProgressBar progress={days / termDays} height={4} />
        </>
      ) : (
        <Text style={typography.small}>Your data is safe — choose a plan to carry on.</Text>
      )}
    </View>
  );
}

/* ---- Usage: every allowance, measured in full ---- */

function UsageTab({ state: s }: { state: AccountPlanState }) {
  const l = s.plan?.benefits.limits ?? {};
  const u = s.usage;
  const deleted = u.deleted_still_counted.length;
  return (
    <ListGroup plain>
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
    </ListGroup>
  );
}

/* ---- Plans: one row each — name, price, properties, the action ---- */

function PlanRow({
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
  const label =
    state === 'current'
      ? 'Renew'
      : state === 'renew_later'
        ? `Renew from ${renewFrom ?? 'later'}`
        : state === 'upgrade'
          ? `Upgrade to ${plan.name}`
          : state === 'too_small'
            ? 'Holds fewer properties than you have'
            : state === 'later'
              ? `Available after ${laterDate ?? 'your plan ends'}`
              : `Choose ${plan.name}`;
  return (
    <View style={styles.plan}>
      <View style={styles.headRow}>
        <View style={[styles.dot, { backgroundColor: a.fg }]} />
        <Text style={typography.title}>{plan.name}</Text>
        {mine ? <Badge label="Your plan" tone="success" /> : null}
        {popular ? <Badge label="Most popular" tone="brand" /> : null}
        <View style={styles.flex} />
        <Text style={styles.price}>
          {formatPrice(plan.price_paise)}
          <Text style={styles.per}>/{plan.billing_period === 'month' ? 'mo' : 'yr'}</Text>
        </Text>
      </View>
      <Text style={typography.body}>
        Up to <Text style={typography.bodyStrong}>{holds(plan.benefits) ?? '—'} properties</Text>
      </Text>
      {state === 'upgrade' ? (
        <Text style={typography.caption}>
          You pay only the difference — unused days are credited.
        </Text>
      ) : null}
      <Button
        title={label}
        variant={mine || locked ? 'secondary' : 'primary'}
        disabled={disabled || locked}
        loading={busy}
        onPress={onChoose}
      />
    </View>
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
    <View style={styles.sections}>
      {done.length > 0 ? (
        <ListGroup plain>
          {done.map((o) => (
            <PaymentRow key={o.id} order={o} />
          ))}
        </ListGroup>
      ) : (
        <Text style={[typography.small, styles.centerText]}>No completed payments yet.</Text>
      )}
      {failed.length > 0 ? (
        <View style={styles.muted}>
          <ListGroup title="Not completed" plain>
            {failed.map((o) => (
              <PaymentRow key={o.id} order={o} />
            ))}
          </ListGroup>
          <Text style={[typography.caption, styles.note]}>
            Started but not finished — you were not charged.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function PaymentRow({ order: o }: { order: Order }) {
  const st = o.display_status;
  const tone = st === 'paid' ? 'success' : st === 'processing' ? 'warning' : 'neutral';
  return (
    <Pressable
      onPress={() => router.push(`/receipts/${o.id}`)}
      accessibilityRole="button"
      style={({ pressed }) => [styles.payment, pressed && { opacity: 0.7 }]}
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
          {o.credit_paise > 0 ? ` · ${formatPrice(o.credit_paise)} credit applied` : ''}
        </Text>
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

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  content: { padding: space.lg, paddingTop: space.md, gap: space.lg, paddingBottom: space.xxl },
  sections: { gap: space.xl },
  empty: { minHeight: 260 },
  header: { gap: space.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  plan: { gap: space.sm, paddingHorizontal: 14, paddingVertical: space.lg },
  dot: { width: 8, height: 8, borderRadius: 4 },
  price: { fontSize: 18, fontWeight: '800', color: colors.text },
  per: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  payment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  amount: { alignItems: 'flex-end', gap: 3 },
  muted: { opacity: 0.75 },
  note: { marginTop: space.sm, marginLeft: 2 },
  struck: { color: colors.textSubtle, textDecorationLine: 'line-through' },
  centerText: { textAlign: 'center' },
});
