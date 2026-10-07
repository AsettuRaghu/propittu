import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  OPEN_REQUEST_STATUSES,
  requestExpectedBy,
  requestStatusLabel,
  type ServiceRequest,
} from '@propittu/shared';
import { useServiceRequests } from '@/api/queries';
import { formatDate } from '@/lib/format';
import { serviceVisual, STATUS_TONES } from '@/lib/icons';
import { colors, space } from '@/theme';
import { PullRefresh } from './PullRefresh';
import { EmptyState, ErrorState, LoadingState } from './States';
import { Badge, ListRow, Segmented } from './ui';

type Tab = 'active' | 'history';
/** History shows the last 18 months; older requests are kept, just not listed. */
const HISTORY_MONTHS = 18;

/**
 * Service requests (§8.4), flat: Active (still open) · History (closed,
 * last 18 months, newest first). One row each: the service, the property
 * (may wrap — names can be long), when it was requested and is expected,
 * and its status.
 */
export function ServiceRequestList({ propertyId }: { propertyId?: string }) {
  const { data, isPending, error, refetch } = useServiceRequests(propertyId);
  const [tab, setTab] = useState<Tab>('active');
  const [since] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - HISTORY_MONTHS);
    return d.getTime();
  });

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const open = (r: ServiceRequest) => OPEN_REQUEST_STATUSES.includes(r.status);
  const rows = data.filter((r) =>
    tab === 'active' ? open(r) : !open(r) && new Date(r.created_at).getTime() >= since,
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
            ]}
            value={tab}
            onChange={setTab}
          />
        </View>
      }
      ItemSeparatorComponent={() => <View style={styles.divider} />}
      renderItem={({ item }) => <RequestRow request={item} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <EmptyState
            icon="requests"
            accent="coral"
            title={tab === 'active' ? 'Nothing in progress' : 'No past requests'}
            message={
              tab === 'active'
                ? 'Requests you book appear here until they are done.'
                : 'Completed and cancelled requests from the last 18 months appear here.'
            }
          />
        </View>
      }
    />
  );
}

/** One request as a row (service, property, dates, status) — also used on the property page. */
export function RequestRow({ request: r }: { request: ServiceRequest }) {
  const expected = OPEN_REQUEST_STATUSES.includes(r.status) ? requestExpectedBy(r) : null;
  const done = r.completed_at ?? r.cancelled_at;
  const detail = [
    `Requested ${formatDate(r.created_at)}`,
    expected
      ? `${r.scheduled_for ? 'Visit' : 'Expected by'} ${formatDate(expected)}`
      : done
        ? `${r.status === 'cancelled' ? 'Cancelled' : 'Done'} ${formatDate(done)}`
        : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <ListRow
      {...serviceVisual(r.service.code, r.service.category)}
      title={r.service.name}
      subtitle={r.property?.name ?? 'Property removed'}
      subtitleLines={2}
      detail={detail}
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
  header: { paddingHorizontal: 14, marginBottom: space.sm },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  empty: { minHeight: 260 },
});
