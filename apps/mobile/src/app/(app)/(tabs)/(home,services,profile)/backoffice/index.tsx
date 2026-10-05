import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import {
  formatIndianMobile,
  formatPrice,
  ORDER_STATUS_LABELS,
  SERVICE_REQUEST_STATUS_LABELS,
  type BackofficeOrder,
  type BackofficeAccount,
  type BackofficeRequest,
  type StaffService,
} from '@propittu/shared';
import { useBoPayments } from '@/api/billing';
import { useBoAccounts, useBoRequests, useBoServices, type RequestFilter } from '@/api/backoffice';
import { TextField } from '@/components/Field';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { Badge, Button, Card, Chips } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { STATUS_TONES } from '@/lib/icons';
import { colors, radius, space, typography } from '@/theme';

type Tab = 'requests' | 'accounts' | 'payments' | 'services';

/**
 * Backoffice (M9) — staff mode. Reachable from Profile for staff only;
 * the API returns 404 for everyone else.
 */
export default function BackofficeScreen() {
  const [tab, setTab] = useState<Tab>('requests');
  return (
    <View style={styles.flex}>
      <View style={styles.segments} accessibilityRole="tablist">
        {(
          [
            ['requests', 'Requests'],
            ['accounts', 'Customers'],
            ['payments', 'Payments'],
            ['services', 'Services'],
          ] as const
        ).map(([value, label]) => (
          <Pressable
            key={value}
            onPress={() => setTab(value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === value }}
            style={[styles.segment, tab === value && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, tab === value && styles.segmentTextActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      {tab === 'requests' ? (
        <Requests />
      ) : tab === 'accounts' ? (
        <Accounts />
      ) : tab === 'payments' ? (
        <Payments />
      ) : (
        <Services />
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */

const FILTERS: { value: RequestFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'requested', label: 'New' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
];

function Requests() {
  const [filter, setFilter] = useState<RequestFilter>('open');
  const { data, isPending, error, refetch, isRefetching } = useBoRequests(filter);

  return (
    <View style={styles.flex}>
      <View style={styles.toolbar}>
        <Chips options={FILTERS} value={filter} onChange={setFilter} />
      </View>
      {isPending ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => <RequestRow request={item} />}
          ListEmptyComponent={<EmptyState icon="file-tray-outline" title="No requests here" />}
        />
      )}
    </View>
  );
}

function RequestRow({ request }: { request: BackofficeRequest }) {
  return (
    <Card onPress={() => router.push(`/backoffice/requests/${request.id}`)} style={styles.card}>
      <View style={styles.row}>
        <Text style={typography.caption}>{request.reference}</Text>
        <Badge
          label={SERVICE_REQUEST_STATUS_LABELS[request.status]}
          tone={STATUS_TONES[request.status]}
        />
      </View>
      <Text style={typography.bodyStrong}>{request.service.name}</Text>
      <Text style={typography.small}>
        {request.customer_phone ? formatIndianMobile(request.customer_phone) : 'Unknown customer'}
        {' · '}
        {request.property?.name ?? 'Property removed'}
      </Text>
      <View style={styles.row}>
        <Badge
          label={request.coverage === 'included' ? 'Included' : 'Extra'}
          tone={request.coverage === 'included' ? 'success' : 'info'}
        />
        <Text style={typography.caption}>
          {request.scheduled_for
            ? `Scheduled ${formatDate(request.scheduled_for)}`
            : `Opened ${formatDate(request.created_at)}`}
        </Text>
      </View>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function Accounts() {
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const { data, isPending, error, refetch, isRefetching } = useBoAccounts(q);

  return (
    <View style={styles.flex}>
      <View style={[styles.toolbar, styles.search]}>
        <View style={styles.flex}>
          <TextField
            label="Search customers"
            placeholder="Mobile number or name"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => setQ(input.trim())}
            returnKeyType="search"
            autoCapitalize="none"
          />
        </View>
        <Button title="Search" variant="secondary" onPress={() => setQ(input.trim())} />
      </View>
      {isPending ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(a) => a.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => <AccountRow account={item} />}
          ListEmptyComponent={<EmptyState icon="people-outline" title="No customers found" />}
        />
      )}
    </View>
  );
}

function AccountRow({ account }: { account: BackofficeAccount }) {
  return (
    <Card onPress={() => router.push(`/backoffice/accounts/${account.id}`)} style={styles.card}>
      <View style={styles.row}>
        <Text style={typography.bodyStrong}>
          {account.phone ? formatIndianMobile(account.phone) : 'No phone'}
        </Text>
        {account.status !== 'active' ? <Badge label={account.status} tone="danger" /> : null}
      </View>
      {account.full_name ? <Text style={typography.small}>{account.full_name}</Text> : null}
      <Text style={typography.small}>
        {account.plan_name
          ? `${account.plan_name} · until ${formatDate(account.plan_ends_at as string)}`
          : 'No active plan (Limited Access)'}
      </Text>
      <Text style={typography.caption}>
        {account.property_count} properties · {account.open_request_count} open requests
      </Text>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function Services() {
  const { data, isPending, error, refetch, isRefetching } = useBoServices();
  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  return (
    <FlatList
      data={data}
      keyExtractor={(s) => s.id}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          tintColor={colors.primary}
        />
      }
      renderItem={({ item }) => <ServiceRow service={item} />}
    />
  );
}

/* ------------------------------------------------------------------ */

/** M9 Payments: customer, Plan/Extra, amount, status, date, provider ref, refunds. */
function Payments() {
  const { data, isPending, error, refetch, isRefetching } = useBoPayments();
  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  return (
    <FlatList
      data={data}
      keyExtractor={(o) => o.id}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          tintColor={colors.primary}
        />
      }
      renderItem={({ item }) => <PaymentRow order={item} />}
      ListEmptyComponent={<EmptyState icon="card-outline" title="No payments yet" />}
    />
  );
}

function PaymentRow({ order }: { order: BackofficeOrder }) {
  return (
    <Card
      onPress={() => router.push(`/backoffice/accounts/${order.account_id}`)}
      style={styles.card}
    >
      <View style={styles.row}>
        <Text style={typography.bodyStrong}>{formatPrice(order.amount_paise)}</Text>
        <Badge
          label={ORDER_STATUS_LABELS[order.status]}
          tone={order.status === 'paid' ? 'success' : 'warning'}
        />
      </View>
      <Text style={typography.small}>{order.description}</Text>
      <Text style={typography.caption}>
        {order.customer_phone ? formatIndianMobile(order.customer_phone) : 'Unknown'} ·{' '}
        {order.reference} · {formatDate(order.paid_at ?? order.created_at)}
      </Text>
      {order.payment?.provider_payment_ref ? (
        <Text style={typography.caption}>
          {order.payment.provider} {order.payment.provider_payment_ref}
          {order.payment.method ? ` · ${order.payment.method}` : ''}
          {order.refunded_paise > 0 ? ` · refunded ${formatPrice(order.refunded_paise)}` : ''}
        </Text>
      ) : null}
    </Card>
  );
}

function ServiceRow({ service }: { service: StaffService }) {
  return (
    <Card
      onPress={() => router.push(`/backoffice/services/${service.id}`)}
      style={[styles.card, styles.serviceRow]}
    >
      <View style={styles.flex}>
        <Text style={typography.bodyStrong}>{service.name}</Text>
        <Text style={typography.small}>
          {service.price_paise !== null ? formatPrice(service.price_paise) : 'Price on review'}
          {service.is_extra_available ? '' : ' · not sold as Extra'}
        </Text>
      </View>
      {!service.is_active ? <Badge label="Inactive" /> : null}
      <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  segments: {
    flexDirection: 'row',
    margin: space.lg,
    marginBottom: 0,
    padding: 4,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  segment: { flex: 1, paddingVertical: space.sm, borderRadius: radius.sm, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { fontSize: 14, fontWeight: '500', color: colors.textMuted },
  segmentTextActive: { color: colors.text, fontWeight: '600' },
  toolbar: { paddingHorizontal: space.lg, paddingTop: space.lg },
  search: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  list: { padding: space.lg, flexGrow: 1 },
  card: { gap: space.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
