import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  BILLING_PERIOD_LABELS,
  FEATURE_LABELS,
  formatPrice,
  formatStorageMb,
  INCLUDED_SERVICE_LABELS,
  LIMIT_LABELS,
  LIMIT_CODES,
  PLAN_STATUS_LABELS,
  type AccountPlanState,
  type LimitCode,
  type PlanBenefits,
  type PublicPlan,
} from '@propittu/shared';
import { useAccountPlan, useCancelPlan, usePlans } from '@/api/queries';
import { ErrorState, LoadingState } from '@/components/States';
import {
  Badge,
  Banner,
  Button,
  Card,
  Divider,
  ProgressBar,
  SectionTitle,
  type Tone,
} from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { colors, space, typography } from '@/theme';

/** Shown for questions until in-app support exists. */
const SUPPORT_EMAIL = 'contact@propittu.com';

const STATUS_TONES: Record<AccountPlanState['status'], Tone> = {
  trialing: 'info',
  active: 'success',
  cancelling: 'warning',
  expired: 'danger',
};

/**
 * Plan & Usage (M5/M6). Available in Limited Access: current status,
 * usage against limits, and the available Plans.
 */
export default function PlanScreen() {
  const state = useAccountPlan();
  const plans = usePlans();
  const cancel = useCancelPlan();

  if (state.isPending) return <LoadingState />;
  if (state.error) return <ErrorState error={state.error} onRetry={() => void state.refetch()} />;
  const s = state.data;

  const confirmCancel = () =>
    Alert.alert(
      'Cancel your plan?',
      `Your plan stays active until ${s.current ? formatDate(s.current.ends_at) : 'the end of the period'} and will not renew. Your data is kept.`,
      [
        { text: 'Keep plan', style: 'cancel' },
        {
          text: 'Cancel plan',
          style: 'destructive',
          onPress: () =>
            cancel.mutate(undefined, {
              onError: (err) => Alert.alert('Could not cancel', errorMessage(err)),
            }),
        },
      ],
    );

  const choose = (plan: PublicPlan) =>
    Alert.alert(
      `${plan.name} — ${formatPrice(plan.price_paise)} ${BILLING_PERIOD_LABELS[plan.billing_period]}`,
      `Online payment is coming very soon. To activate ${plan.name} now, write to ${SUPPORT_EMAIL} from your registered mobile number's account.`,
    );

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={state.isRefetching}
          onRefresh={() => {
            void state.refetch();
            void plans.refetch();
          }}
          tintColor={colors.primary}
        />
      }
    >
      {/* Current status */}
      <Card style={styles.card}>
        <View style={styles.row}>
          <Text style={typography.heading}>{s.plan?.name ?? 'No active plan'}</Text>
          <Badge label={PLAN_STATUS_LABELS[s.status]} tone={STATUS_TONES[s.status]} />
        </View>
        {s.current ? (
          <Text style={typography.small}>
            {s.status === 'trialing'
              ? `Free trial ends ${formatDate(s.current.ends_at)} · ${s.current.days_left} days left`
              : s.current.cancel_at_period_end
                ? `Active until ${formatDate(s.current.ends_at)}. It will not renew.`
                : `Active until ${formatDate(s.current.ends_at)}`}
          </Text>
        ) : (
          <Text style={typography.small}>
            Your data is safe. Choose a plan below to continue using your properties, documents and
            services.
          </Text>
        )}
        {s.current && s.current.source !== 'trial' && !s.current.cancel_at_period_end ? (
          <Button
            title="Cancel plan"
            variant="secondary"
            onPress={confirmCancel}
            loading={cancel.isPending}
          />
        ) : null}
      </Card>

      {s.over_limit.length > 0 ? (
        <Banner
          tone="warning"
          message={`You are over your plan's ${s.over_limit
            .map((c) => LIMIT_LABELS[c].toLowerCase())
            .join(
              ', ',
            )} limit. Nothing is deleted, but you can't add more until you upgrade or remove items.`}
        />
      ) : null}

      {/* Usage */}
      {s.plan ? (
        <View style={styles.section}>
          <SectionTitle title="Usage" />
          <Card style={styles.card}>
            <UsageRow
              label="Properties"
              used={s.usage.properties}
              limit={s.plan.benefits.limits.max_properties}
            />
            <UsageRow
              label="Storage"
              used={Math.ceil(s.usage.storage_bytes / (1024 * 1024))}
              limit={s.plan.benefits.limits.max_storage_mb}
              format={formatStorageMb}
            />
            {s.usage.included.map((i) => (
              <UsageRow
                key={i.code}
                label={`${INCLUDED_SERVICE_LABELS[i.code] ?? i.code} (included)`}
                used={i.used}
                limit={i.quantity}
              />
            ))}
          </Card>
        </View>
      ) : null}

      {/* Available Plans */}
      <View style={styles.section}>
        <SectionTitle title="Available plans" />
        {plans.isPending ? (
          <LoadingState />
        ) : plans.error ? (
          <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />
        ) : (
          plans.data.map((p) => (
            <Card key={p.code} style={styles.card}>
              <View style={styles.row}>
                <Text style={typography.heading}>{p.name}</Text>
                <Text style={typography.bodyStrong}>
                  {formatPrice(p.price_paise)}
                  <Text style={typography.small}> {BILLING_PERIOD_LABELS[p.billing_period]}</Text>
                </Text>
              </View>
              {p.description ? <Text style={typography.small}>{p.description}</Text> : null}
              <Divider />
              <BenefitList benefits={p.benefits} />
              {s.plan?.code === p.code && s.status !== 'trialing' ? (
                <Badge label="Your current plan" tone="success" />
              ) : (
                <Button title={`Choose ${p.name}`} onPress={() => choose(p)} />
              )}
            </Card>
          ))
        )}
      </View>

      <Text style={[typography.caption, styles.center]}>
        Questions about plans? Write to {SUPPORT_EMAIL}
      </Text>
    </ScrollView>
  );
}

function UsageRow({
  label,
  used,
  limit,
  format = String,
}: {
  label: string;
  used: number;
  limit: number | undefined;
  format?: (n: number) => string;
}) {
  return (
    <View style={styles.usage}>
      <View style={styles.row}>
        <Text style={typography.body}>{label}</Text>
        <Text style={typography.small}>
          {format(used)}
          {limit !== undefined ? ` of ${format(limit)}` : ''}
        </Text>
      </View>
      {limit ? <ProgressBar progress={used / limit} /> : null}
    </View>
  );
}

function BenefitList({ benefits }: { benefits: PlanBenefits }) {
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
        `${i.quantity} ${(INCLUDED_SERVICE_LABELS[i.code] ?? i.code).toLowerCase()} ${i.period === 'year' ? 'per year' : 'included'}`,
    ),
    ...benefits.features.filter((f) => f in FEATURE_LABELS).map((f) => FEATURE_LABELS[f]),
  ];
  return (
    <View style={styles.benefits}>
      {lines.map((l) => (
        <Text key={l} style={typography.small}>
          ✓ {l}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.xl, paddingBottom: space.xxl },
  card: { gap: space.md },
  section: { gap: space.md },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.md,
  },
  usage: { gap: space.xs },
  benefits: { gap: space.xs },
  center: { textAlign: 'center' },
});
