import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { OPEN_REQUEST_STATUSES, requestStatusLabel, type ServiceRequest } from '@propittu/shared';
import { useServiceRequests } from '@/api/queries';
import { formatDate } from '@/lib/format';
import { serviceVisual, STATUS_TONES } from '@/lib/icons';
import { colors, space } from '@/theme';
import { PullRefresh } from './PullRefresh';
import { Select } from './Select';
import { EmptyState, ErrorState, LoadingState } from './States';
import { Badge, ListRow, Segmented } from './ui';

type Tab = 'active' | 'history' | 'all';
type Range = '3' | '6' | '12' | 'all';
const MONTH = 30 * 86_400_000;
const RANGES: { value: Range; label: string }[] = [
  { value: '3', label: 'Last 3 months' },
  { value: '6', label: 'Last 6 months' },
  { value: '12', label: 'Last 12 months' },
  { value: 'all', label: 'All time' },
];

/**
 * Service requests (§8.4), flat: Active · History · All, a period for
 * history, and one row per request (service, property and date, status).
 * Everything is kept — old requests are never deleted.
 */
export function ServiceRequestList({ propertyId }: { propertyId?: string }) {
  const { data, isPending, error, refetch } = useServiceRequests(propertyId);
  const [tab, setTab] = useState<Tab>('active');
  const [range, setRange] = useState<Range>('all');
  const [now] = useState(() => Date.now());

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const open = (r: ServiceRequest) => OPEN_REQUEST_STATUSES.includes(r.status);
  const since = range === 'all' ? null : now - Number(range) * MONTH;
  const rows = data.filter((r) =>
    tab === 'active'
      ? open(r)
      : tab === 'history'
        ? !open(r) && (since === null || new Date(r.created_at).getTime() >= since)
        : true,
  );
  const activeCount = data.filter(open).length;

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.id}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      refreshControl={<PullRefresh onRefresh={() => refetch()} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Segmented
            variant="text"
            options={[
              { value: 'active', label: activeCount ? `Active · ${activeCount}` : 'Active' },
              { value: 'history', label: 'History' },
              { value: 'all', label: 'All' },
            ]}
            value={tab}
            onChange={setTab}
          />
          {tab === 'history' ? (
            <Select
              variant="flat"
              label="Period"
              value={range}
              options={RANGES}
              onChange={(v) => setRange(v ?? 'all')}
            />
          ) : null}
        </View>
      }
      ItemSeparatorComponent={() => <View style={styles.divider} />}
      renderItem={({ item }) => <RequestRow request={item} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <EmptyState
            icon="requests"
            accent="coral"
            title={tab === 'active' ? 'Nothing in progress' : 'No requests here'}
            message={
              tab === 'active'
                ? 'Requests you book appear here until they are done.'
                : 'Completed and cancelled requests are kept here for reference.'
            }
          />
        </View>
      }
    />
  );
}

function RequestRow({ request: r }: { request: ServiceRequest }) {
  const when = r.scheduled_for
    ? `Visit ${formatDate(r.scheduled_for)}`
    : `Requested ${formatDate(r.created_at)}`;
  return (
    <ListRow
      {...serviceVisual(r.service.code, r.service.category)}
      title={r.service.name}
      subtitle={`${r.property?.name ?? 'Property removed'} · ${when}`}
      right={
        <Badge label={requestStatusLabel(r.status, r.fulfilment)} tone={STATUS_TONES[r.status]} />
      }
      showChevron={false}
      onPress={() => router.push(`/requests/${r.id}`)}
    />
  );
}

const styles = StyleSheet.create({
  // Rows bleed by their 14 pt padding so their content sits on the 16 pt page edge.
  list: { paddingHorizontal: 2, paddingTop: space.md, paddingBottom: space.xxl },
  header: { gap: space.md, paddingHorizontal: 14, marginBottom: space.sm },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  empty: { minHeight: 260 },
});
