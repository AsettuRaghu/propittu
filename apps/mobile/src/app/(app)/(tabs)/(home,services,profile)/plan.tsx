import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  formatPrice,
  formatStorageMb,
  INCLUDED_SERVICE_LABELS,
  LIMIT_LABELS,
  ORDER_DISPLAY_LABELS,
  RENEWAL_WINDOW_DAYS,
  type AccountPlanState,
  type Order,
  type PublicPlan,
  withoutCodes,
} from '@propittu/shared';
import { PullRefresh } from '@/components/PullRefresh';
import { useOrders } from '@/api/billing';
import { useAccountPlan, usePlans } from '@/api/queries';
import { PageHeader, Strong } from '@/components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { UsageRow } from '@/components/UsageRow';
import { Badge, Banner, Button, ListGroup, ListRow, Segmented } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { PLAN_ACCENT, planBadge, propertiesHeld, usePlanPurchase } from '@/lib/plans';
import { colors, space, typography } from '@/theme';

type Tab = 'usage' | 'plans' | 'payments';

/** How a plan card relates to what the customer has now. */
type CardState = 'choose' | 'current' | 'renew_later' | 'upgrade' | 'later' | 'too_small';

/**
 * Plan & Usage (M5/M6/M7), flat like Profile: where the plan stands, then
 * Usage · Plans · Payments. Available in Limited Access.
 */
export default function PlanScreen() {
  const state = useAccountPlan();
  const plans = usePlans();
  const orders = useOrders();
  const [tab, setTab] = useState<Tab>('usage');
  const purchase = usePlanPurchase(state.data?.plan?.benefits);

  if (state.isPending) return <LoadingState />;
  if (state.error) return <ErrorState error={state.error} onRetry={() => void state.refetch()} />;
  const s = state.data;
  const code = s.plan?.code ?? null;

  const paidPlan = !!s.plan && s.plan.price_paise > 0;
  const currentPrice = paidPlan ? (s.plan?.price_paise ?? 0) : 0;
  // Today's price of the customer's own plan (they may have bought it at an
  // older price): what "higher" plans are compared with, and never their own.
  const mine = plans.data?.find((p) => p.code === code);
  const ownPrice = mine?.price_paise ?? currentPrice;
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
          : p.price_paise > ownPrice
            ? 'upgrade'
            : 'later';

  // The header button acts directly: upgrade to the next plan up, or renew
  // in the renewal window. Choosing a first plan opens the Plans tab.
  const nextUp = [...(plans.data ?? [])]
    .filter((p) => p.code !== code && p.price_paise > ownPrice)
    .sort((a, b) => a.price_paise - b.price_paise)[0];
  const headerAction = () => {
    if (paidPlan && code !== topCode && nextUp) return void purchase.choose(nextUp);
    if (paidPlan && canRenew && mine) return void purchase.choose(mine);
    setTab('plans');
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
      <PlanHeader
        state={s}
        onTop={!!code && code === topCode}
        canRenew={canRenew}
        busy={purchase.busy}
        onAction={headerAction}
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
        variant="text"
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
          <ListGroup plain>
            {plans.data.map((p) => (
              <PlanRow
                key={p.code}
                plan={p}
                state={cardState(p)}
                laterDate={s.current ? formatDate(s.current.ends_at) : null}
                renewFrom={renewFrom}
                busy={purchase.busyCode === p.code}
                disabled={purchase.busy}
                onChoose={() => void purchase.choose(p)}
              />
            ))}
          </ListGroup>
        )
      ) : orders.isPending ? (
        <LoadingState />
      ) : (
        <Payments orders={orders.data ?? []} />
      )}
    </ScrollView>
  );
}

/* ---- Where the plan stands: name, status, days left, the one action ---- */

function PlanHeader({
  state: s,
  onTop,
  canRenew,
  busy,
  onAction,
}: {
  state: AccountPlanState;
  onTop: boolean;
  canRenew: boolean;
  busy: boolean;
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
  return (
    <PageHeader
      title={s.plan?.name ?? 'No active plan'}
      badge={<Badge {...planBadge({ status: s.status })} />}
      subtitle={
        c ? (
          <>
            <Strong>
              {days} {days === 1 ? 'day' : 'days'} remaining
            </Strong>
            {` · until ${formatDate(c.ends_at)}`}
          </>
        ) : (
          'Your data is safe — choose a plan to carry on.'
        )
      }
      action={
        cta ? <Button title={cta} size="sm" icon="gem" loading={busy} onPress={onAction} /> : null
      }
    />
  );
}

/* ---- Usage: every allowance as a row — used / limit and what's left ---- */

function UsageTab({ state: s }: { state: AccountPlanState }) {
  const l = s.plan?.benefits.limits ?? {};
  const u = s.usage;
  const deleted = u.deleted_still_counted.length;
  return (
    <ListGroup plain>
      <UsageRow
        icon="home"
        accent="indigo"
        label="Properties"
        hint={deleted ? `This term · incl. ${deleted} deleted` : 'This term'}
        used={u.property_slots_used}
        limit={l.max_properties}
      />
      {u.included.map((i) => (
        <UsageRow
          key={i.code}
          icon="compass"
          accent="teal"
          label={INCLUDED_SERVICE_LABELS[i.code] ?? i.code}
          hint="Included this year"
          used={i.used}
          limit={i.quantity}
        />
      ))}
      <UsageRow
        icon="storage"
        accent="violet"
        label="Storage"
        used={Math.ceil(u.storage_bytes / (1024 * 1024))}
        limit={l.max_storage_mb}
        format={formatStorageMb}
      />
      <UsageRow
        icon="document"
        accent="amber"
        label="Documents"
        hint={`${u.documents} in total · fullest property`}
        used={u.max_documents_on_a_property}
        limit={l.max_documents_per_property}
      />
      <UsageRow
        icon="image"
        accent="sky"
        label="Photos"
        hint={`${u.photos} in total · fullest property`}
        used={u.max_photos_on_a_property}
        limit={l.max_photos_per_property}
      />
      <UsageRow
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

/* ---- Plans: one row each, like Payments — what it holds, and the action ---- */

function PlanRow({
  plan,
  state,
  laterDate,
  renewFrom,
  busy,
  disabled,
  onChoose,
}: {
  plan: PublicPlan;
  state: CardState;
  laterDate: string | null;
  renewFrom: string | null;
  busy: boolean;
  disabled: boolean;
  onChoose: () => void;
}) {
  const price = formatPrice(plan.price_paise);
  const holdsText = `Up to ${propertiesHeld(plan.benefits) ?? '—'} properties`;
  const action = (title: string) => (
    <Button title={title} size="sm" loading={busy} disabled={disabled} onPress={onChoose} />
  );
  let subtitle = holdsText;
  let right: ReactNode = null;
  if (state === 'current') {
    subtitle = `Current plan · ${holdsText}`;
    right = action(`Renew · ${price}`);
  } else if (state === 'renew_later') {
    right = <Badge label="Current plan" tone="success" />;
  } else if (state === 'upgrade') {
    right = action(`Upgrade · ${price}`);
  } else if (state === 'choose') {
    right = action(`Choose · ${price}`);
  } else if (state === 'too_small') {
    subtitle = `${holdsText} — fewer than you have`;
  } else {
    subtitle = `${holdsText} · from ${laterDate ?? 'your renewal'}`;
  }
  return (
    <ListRow
      icon={plan.code === 'plus' ? 'gem' : 'shield'}
      accent={PLAN_ACCENT[plan.code] ?? 'slate'}
      title={plan.name}
      subtitle={subtitle}
      right={right}
    />
  );
}

/* ---- Payments: one list, newest first ---- */

function Payments({ orders }: { orders: Order[] }) {
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
  // One list, newest first (the API sends the last 18 months, sorted).
  return (
    <ListGroup plain>
      {orders.map((o) => (
        <PaymentRow key={o.id} order={o} />
      ))}
    </ListGroup>
  );
}

function PaymentRow({ order: o }: { order: Order }) {
  const st = o.display_status;
  const tone = st === 'paid' ? 'success' : st === 'processing' ? 'warning' : 'neutral';
  return (
    <ListRow
      icon="receipt"
      accent={st === 'paid' ? 'teal' : st === 'processing' ? 'amber' : 'slate'}
      title={withoutCodes(o.description)}
      subtitle={
        (o.period
          ? `${formatDate(o.period.starts_at)} – ${formatDate(o.period.ends_at)}`
          : formatDate(o.paid_at ?? o.created_at)) +
        (o.credit_paise > 0 ? ` · ${formatPrice(o.credit_paise)} credit` : '')
      }
      right={
        <View style={styles.amount}>
          <Text style={[typography.bodyStrong, st === 'failed' && styles.struck]}>
            {formatPrice(o.amount_paise)}
          </Text>
          <Badge label={ORDER_DISPLAY_LABELS[st]} tone={tone} />
        </View>
      }
      showChevron={false}
      onPress={() => router.push(`/receipts/${o.id}`)}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  content: { padding: space.lg, paddingTop: space.md, gap: space.lg, paddingBottom: space.xxl },
  empty: { minHeight: 260 },
  amount: { alignItems: 'flex-end', gap: 3 },
  struck: { color: colors.textSubtle, textDecorationLine: 'line-through' },
});
