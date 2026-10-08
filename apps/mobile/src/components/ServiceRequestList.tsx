import { router } from 'expo-router';
import { openServicesTab } from '@/lib/nav';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  OPEN_REQUEST_STATUSES,
  requestExpectedBy,
  requestStatusLabel,
  type ServiceRequest,
} from '@propittu/shared';
import { useServiceRequests } from '@/api/queries';
import { formatDate } from '@/lib/format';
import { serviceVisual, STATUS_TONES } from '@/lib/icons';
import { space, typography } from '@/theme';
import { PullRefresh } from './PullRefresh';
import { EmptyState, ErrorState, LoadingState } from './States';
import { Badge, Button, ListGroup, ListRow } from './ui';

/** Past requests shown: the last 18 months (older ones are kept, just not listed). */
const HISTORY_MONTHS = 18;

/**
 * My requests (§8.4) — one page, no second row of tabs: what's in progress
 * first, then past requests (last 18 months, newest first) in a section
 * that folds away while something is in progress.
 */
export function ServiceRequestList({
  propertyId,
  header,
}: {
  propertyId?: string;
  /** Shown above the list (e.g. which property these requests belong to). */
  header?: ReactNode;
}) {
  const { data, isPending, error, refetch } = useServiceRequests(propertyId);
  const [since] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - HISTORY_MONTHS);
    return d.getTime();
  });

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const isOpen = (r: ServiceRequest) => OPEN_REQUEST_STATUSES.includes(r.status);
  const active = data.filter(isOpen);
  const past = data.filter((r) => !isOpen(r) && new Date(r.created_at).getTime() >= since);

  if (active.length === 0 && past.length === 0) {
    return (
      <View style={styles.flex}>
        {header ? <View style={styles.header}>{header}</View> : null}
        <EmptyState
          icon="requests"
          accent="coral"
          title="No requests yet"
          message="Book a visit, an inspection or paperwork help — you'll follow it here."
          action={<Button title="Browse services" onPress={() => openServicesTab()} />}
        />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<PullRefresh onRefresh={() => refetch()} />}
    >
      {header}
      <ListGroup title={active.length ? `In progress · ${active.length}` : 'In progress'} plain>
        {active.length ? (
          active.map((r) => <RequestRow key={r.id} request={r} />)
        ) : (
          <Text style={[typography.small, styles.none]}>Nothing in progress right now.</Text>
        )}
      </ListGroup>
      {past.length ? (
        <ListGroup
          title={`Past requests · ${past.length}`}
          plain
          collapsible
          initiallyOpen={active.length === 0}
        >
          {past.map((r) => (
            <RequestRow key={r.id} request={r} />
          ))}
        </ListGroup>
      ) : null}
    </ScrollView>
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
  content: { padding: space.lg, paddingTop: space.md, gap: space.xl, paddingBottom: space.xxl },
  none: { paddingHorizontal: 14, paddingVertical: space.md },
  flex: { flex: 1 },
  header: { paddingHorizontal: space.lg, paddingTop: space.md },
});
