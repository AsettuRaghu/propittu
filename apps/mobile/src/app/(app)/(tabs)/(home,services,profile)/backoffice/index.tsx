import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  formatIndianMobile,
  formatPrice,
  ORDER_DISPLAY_LABELS,
  requestStatusLabel,
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  type BackofficeOrder,
  type BackofficeTicket,
  type BackofficeAccount,
  type BackofficeRequest,
  type StaffService,
} from '@propittu/shared';
import { PullRefresh } from '@/components/PullRefresh';
import { useBoPayments } from '@/api/billing';
import { useBoTickets } from '@/api/support';
import { useBoAccounts, useBoRequests, useBoServices, type RequestFilter } from '@/api/backoffice';
import { TextField } from '@/components/Field';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { Badge, Button, Card, Chips } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { STATUS_TONES, TICKET_TONES } from '@/lib/icons';
import { colors, radius, space, typography } from '@/theme';
import { Icon } from '@/components/Icon';

type Tab = 'requests' | 'tickets' | 'accounts' | 'payments' | 'services';

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
            ['tickets', 'Tickets'],
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
      ) : tab === 'tickets' ? (
        <Tickets />
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

const TICKET_FILTERS = [
  { value: 'open', label: 'Open' },
  { value: 'waiting_on_customer', label: 'Awaiting customer' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All' },
];

function Tickets() {
  const [filter, setFilter] = useState('open');
  const { data, isPending, error, refetch } = useBoTickets(filter);
  return (
    <View style={styles.flex}>
      <View style={styles.toolbar}>
        <Chips options={TICKET_FILTERS} value={filter} onChange={setFilter} />
      </View>
      {isPending ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
          refreshControl={<PullRefresh onRefresh={() => refetch()} />}
          renderItem={({ item }) => <TicketRow ticket={item} />}
          ListEmptyComponent={<EmptyState icon="support" title="No tickets here" />}
        />
      )}
    </View>
  );
}

function TicketRow({ ticket }: { ticket: BackofficeTicket }) {
  return (
    <Card onPress={() => router.push(`/backoffice/tickets/${ticket.id}`)} style={styles.card}>
      <View style={styles.row}>
        <Text style={typography.caption}>
          {ticket.reference} · {TICKET_CATEGORY_LABELS[ticket.category]}
        </Text>
        <Badge label={TICKET_STATUS_LABELS[ticket.status]} tone={TICKET_TONES[ticket.status]} />
      </View>
      <Text style={typography.bodyStrong} numberOfLines={1}>
        {ticket.subject}
      </Text>
      <Text style={typography.small} numberOfLines={1}>
        {ticket.customer_phone ? formatIndianMobile(ticket.customer_phone) : 'Unknown'}
        {ticket.property ? ` · ${ticket.property.name}` : ''} · {formatDate(ticket.last_message_at)}
      </Text>
    </Card>
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
  const { data, isPending, error, refetch } = useBoRequests(filter);

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
          refreshControl={<PullRefresh onRefresh={() => refetch()} />}
          renderItem={({ item }) => <RequestRow request={item} />}
          ListEmptyComponent={<EmptyState icon="requests" title="No requests here" />}
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
          label={requestStatusLabel(request.status, request.fulfilment)}
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
  const { data, isPending, error, refetch } = useBoAccounts(q);

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
          refreshControl={<PullRefresh onRefresh={() => refetch()} />}
          renderItem={({ item }) => <AccountRow account={item} />}
          ListEmptyComponent={<EmptyState icon="users" title="No customers found" />}
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
  const { data, isPending, error, refetch } = useBoServices();
  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  return (
    <FlatList
      data={data}
      keyExtractor={(s) => s.id}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
      refreshControl={<PullRefresh onRefresh={() => refetch()} />}
      renderItem={({ item }) => <ServiceRow service={item} />}
    />
  );
}

/* ------------------------------------------------------------------ */

/** M9 Payments: customer, Plan/Extra, amount, status, date, provider ref, refunds. */
function Payments() {
  const { data, isPending, error, refetch } = useBoPayments();
  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  return (
    <FlatList
      data={data}
      keyExtractor={(o) => o.id}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
      refreshControl={<PullRefresh onRefresh={() => refetch()} />}
      renderItem={({ item }) => <PaymentRow order={item} />}
      ListEmptyComponent={<EmptyState icon="card" title="No payments yet" />}
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
          label={ORDER_DISPLAY_LABELS[order.display_status]}
          tone={
            order.display_status === 'paid'
              ? 'success'
              : order.display_status === 'processing'
                ? 'warning'
                : 'neutral'
          }
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
      <Icon name="chevron" size={18} color={colors.textSubtle} />
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
  segmentText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  segmentTextActive: { color: colors.text, fontWeight: '600' },
  toolbar: { paddingHorizontal: space.lg, paddingTop: space.lg },
  search: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  list: { padding: space.lg, flexGrow: 1 },
  card: { gap: space.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
