import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  formatIndianMobile,
  formatPrice,
  formatStorageMb,
  ORDER_DISPLAY_LABELS,
  INCLUDED_SERVICE_LABELS,
  PLAN_STATUS_LABELS,
  PROPERTY_TYPE_LABELS,
  requestStatusLabel,
  staffCan,
} from '@propittu/shared';
import {
  useBoAccount,
  useBoAccountStatus,
  useBoEndPlan,
  useBoExtendPlan,
  useBoGrantPlan,
} from '@/api/backoffice';
import { PullRefresh } from '@/components/PullRefresh';
import { useMe } from '@/api/queries';
import { ErrorState, LoadingState } from '@/components/States';
import { ActivityLog } from '@/components/ActivityLog';
import { SlotList } from '@/components/SlotList';
import { Badge, Banner, Button, Card, KeyValue, SectionTitle } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { STATUS_TONES } from '@/lib/icons';
import { colors, space, typography } from '@/theme';
import { showAlert } from '@/lib/alert';
import { Icon } from '@/components/Icon';

/** Backoffice: one customer Account — Plan, usage, why blocked, properties, requests (M9). */
export default function BackofficeAccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isPending, error, refetch } = useBoAccount(id);
  const me = useMe();
  const grant = useBoGrantPlan(id);
  const endPlan = useBoEndPlan(id);
  const extend = useBoExtendPlan(id);
  const setStatus = useBoAccountStatus(id);

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const { account, plan } = data;
  const role = me.data?.staff_role;
  const fail = (title: string) => (err: unknown) => showAlert(title, errorMessage(err));

  const confirm = (title: string, message: string, action: () => void, destructive = false) =>
    showAlert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', style: destructive ? 'destructive' : 'default', onPress: action },
    ]);

  const grantPlan = (code: string, label: string, days?: number) =>
    confirm(
      `Give ${label}?`,
      `Starts now${days ? ` for ${days} days` : ''} and replaces the current plan (a paid period is ended, not refunded). To give extra time instead, use “Add 7 days”. Recorded in the audit log.`,
      () => grant.mutate({ plan_code: code, days }, { onError: fail("Couldn't change the plan") }),
    );

  const limits = plan.plan?.benefits.limits ?? {};

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<PullRefresh onRefresh={() => refetch()} />}
    >
      <Card style={styles.card}>
        <View style={styles.row}>
          <Text style={typography.heading}>
            {account.phone ? formatIndianMobile(account.phone) : 'No phone'}
          </Text>
          <Badge label={account.status} tone={account.status === 'active' ? 'success' : 'danger'} />
        </View>
        <KeyValue label="Name" value={account.full_name} />
        <KeyValue label="Customer since" value={formatDate(account.created_at)} />
      </Card>

      {data.blocked_reason ? (
        <Banner tone="warning" message={`Why the customer is blocked: ${data.blocked_reason}`} />
      ) : (
        <Banner tone="success" message="The customer has full access." />
      )}

      <View style={styles.section}>
        <SectionTitle title="Plan and usage" />
        <Card style={styles.card}>
          <View style={styles.row}>
            <Text style={typography.bodyStrong}>{plan.plan?.name ?? 'No active plan'}</Text>
            <Badge label={PLAN_STATUS_LABELS[plan.status]} />
          </View>
          {plan.current ? (
            <Text style={typography.small}>
              {plan.current.source === 'trial' ? 'Trial' : `Source: ${plan.current.source}`} · ends{' '}
              {formatDate(plan.current.ends_at)} ({plan.current.days_left} days)
              {plan.current.cancel_at_period_end ? ' · will not renew' : ''}
            </Text>
          ) : null}
          <Text style={typography.small}>
            Properties: {plan.usage.properties}
            {limits.max_properties !== undefined ? ` of ${limits.max_properties}` : ''}
            {'\n'}Storage: {Math.ceil(plan.usage.storage_bytes / (1024 * 1024))} MB
            {limits.max_storage_mb !== undefined
              ? ` of ${formatStorageMb(limits.max_storage_mb)}`
              : ''}
            {plan.usage.included.map(
              (i) =>
                `\n${INCLUDED_SERVICE_LABELS[i.code] ?? i.code}: ${i.used} of ${i.quantity} used`,
            )}
          </Text>
          {staffCan(role, 'plans.manage') ? (
            <View style={styles.actions}>
              <Button
                title="Give Basic"
                variant="secondary"
                onPress={() => grantPlan('basic', 'Basic')}
                disabled={grant.isPending}
              />
              <Button
                title="Give Plus"
                variant="secondary"
                onPress={() => grantPlan('plus', 'Plus')}
                disabled={grant.isPending}
              />
              {plan.current ? (
                <Button
                  title="Add 7 days"
                  variant="secondary"
                  loading={extend.isPending}
                  onPress={() =>
                    confirm(
                      'Add 7 days?',
                      `The current ${plan.plan?.name ?? 'plan'} runs 7 days longer (until ${formatDate(new Date(new Date(plan.current?.ends_at ?? 0).getTime() + 7 * 86_400_000).toISOString())}). Recorded in the audit log.`,
                      () => extend.mutate(7, { onError: fail("Couldn't add days") }),
                    )
                  }
                />
              ) : null}
              {plan.current ? (
                <Button
                  title="End plan now"
                  variant="danger"
                  loading={endPlan.isPending}
                  onPress={() =>
                    confirm(
                      'End the plan now?',
                      'The customer moves to Limited Access immediately. Their data is kept.',
                      () => endPlan.mutate(undefined, { onError: fail("Couldn't end the plan") }),
                      true,
                    )
                  }
                />
              ) : null}
            </View>
          ) : null}
        </Card>
      </View>

      {staffCan(role, 'accounts.status') ? (
        account.status === 'active' ? (
          <Button
            title="Suspend account"
            variant="danger"
            loading={setStatus.isPending}
            onPress={() =>
              confirm(
                'Suspend this account?',
                'The customer will not be able to use the app until reactivated.',
                () => setStatus.mutate('suspended', { onError: fail("Couldn't suspend") }),
                true,
              )
            }
          />
        ) : (
          <Button
            title="Reactivate account"
            loading={setStatus.isPending}
            onPress={() => setStatus.mutate('active', { onError: fail("Couldn't reactivate") })}
          />
        )
      ) : null}

      <View style={styles.section}>
        <SectionTitle title={`Properties (${data.properties.length})`} />
        {data.properties.map((p) => (
          <Card
            key={p.id}
            onPress={() => router.push(`/backoffice/properties/${p.id}`)}
            style={styles.listRow}
          >
            <View style={styles.flex}>
              <Text style={typography.bodyStrong}>{p.name}</Text>
              <Text style={typography.small}>
                {PROPERTY_TYPE_LABELS[p.property_type]}
                {p.city ? ` · ${p.city}` : ''} · {p.document_count} docs · {p.photo_count} photos
              </Text>
            </View>
            <Icon name="chevron" size={18} color={colors.textSubtle} />
          </Card>
        ))}
        {data.properties.length === 0 ? (
          <Text style={typography.small}>No properties yet.</Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <SectionTitle title={`Payments (${data.orders.length})`} />
        {data.orders.map((o) => (
          <Card key={o.id} style={styles.listRow}>
            <View style={styles.flex}>
              <Text style={typography.bodyStrong}>
                {formatPrice(o.amount_paise)} · {o.description}
              </Text>
              <Text style={typography.small}>
                {o.reference} · {formatDate(o.paid_at ?? o.created_at)}
                {o.payment?.provider_payment_ref ? ` · ${o.payment.provider_payment_ref}` : ''}
                {o.refunded_paise > 0 ? ` · refunded ${formatPrice(o.refunded_paise)}` : ''}
              </Text>
            </View>
            <Badge
              label={ORDER_DISPLAY_LABELS[o.display_status]}
              tone={
                o.display_status === 'paid'
                  ? 'success'
                  : o.display_status === 'processing'
                    ? 'warning'
                    : 'neutral'
              }
            />
          </Card>
        ))}
        {data.orders.length === 0 ? <Text style={typography.small}>No payments yet.</Text> : null}
      </View>

      <View style={styles.section}>
        <SectionTitle title={`Service requests (${data.requests.length})`} />
        {data.requests.map((r) => (
          <Card
            key={r.id}
            onPress={() => router.push(`/backoffice/requests/${r.id}`)}
            style={styles.listRow}
          >
            <View style={styles.flex}>
              <Text style={typography.bodyStrong}>{r.service.name}</Text>
              <Text style={typography.small}>
                {r.reference} · {formatDate(r.created_at)}
              </Text>
            </View>
            <Badge
              label={requestStatusLabel(r.status, r.fulfilment)}
              tone={STATUS_TONES[r.status]}
            />
          </Card>
        ))}
        {data.requests.length === 0 ? <Text style={typography.small}>No requests yet.</Text> : null}
      </View>
      <View style={styles.section}>
        <SectionTitle
          title="Property slots this term"
          subtitle="Deleted properties stay counted until the term ends"
        />
        <SlotList accountId={id} canManage={staffCan(role, 'plans.manage')} />
      </View>

      <View style={styles.section}>
        <SectionTitle title="Activity" subtitle="Audit trail · newest first" />
        <ActivityLog accountId={id} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.xl, paddingBottom: space.xxl },
  card: { gap: space.md },
  section: { gap: space.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actions: { gap: space.sm },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
});
