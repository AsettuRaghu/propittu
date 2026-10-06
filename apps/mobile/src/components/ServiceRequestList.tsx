import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { OPEN_REQUEST_STATUSES } from '@propittu/shared';
import { PullRefresh } from './PullRefresh';
import { useServiceRequests } from '@/api/queries';
import { colors, radius, shadow, space, typography } from '@/theme';
import { Icon } from './Icon';
import { ServiceRequestCard } from './ServiceRequestCard';
import { EmptyState, ErrorState, LoadingState } from './States';
import { Chips, IconTile, Segmented } from './ui';

type Tab = 'active' | 'history' | 'all';
type Range = '3' | '6' | '12' | 'all';
const MONTH = 30 * 86_400_000;

/**
 * Service requests (§8.4): Active / History / All, with a time filter for
 * history. Everything is kept — old requests are never deleted.
 */
export function ServiceRequestList({
  propertyId,
  showCta = true,
}: {
  propertyId?: string;
  showCta?: boolean;
}) {
  const { data, isPending, error, refetch } = useServiceRequests(propertyId);
  const [tab, setTab] = useState<Tab>('active');
  const [range, setRange] = useState<Range>('all');
  const [since, setSince] = useState<number | null>(null);

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const open = (s: string) => (OPEN_REQUEST_STATUSES as string[]).includes(s);
  const rows = data.filter((r) => {
    if (tab === 'active') return open(r.status);
    if (tab === 'history' && open(r.status)) return false;
    if (tab === 'history' && since !== null) return new Date(r.created_at).getTime() >= since;
    return true;
  });
  const activeCount = data.filter((r) => open(r.status)).length;

  const pickRange = (r: Range) => {
    setRange(r);
    setSince(r === 'all' ? null : Date.now() - Number(r) * MONTH);
  };

  const header = (
    <View style={styles.header}>
      {showCta ? (
        <Pressable
          onPress={() =>
            router.push(
              propertyId ? { pathname: '/services/request', params: { propertyId } } : '/services',
            )
          }
          accessibilityRole="button"
          style={({ pressed }) => [styles.cta, shadow, pressed && { opacity: 0.85 }]}
        >
          <IconTile icon="services" accent="indigo" size={34} />
          <View style={styles.flex}>
            <Text style={typography.bodyStrong}>Need help with your property?</Text>
            <Text style={typography.small}>Book a visit, inspection or repair.</Text>
          </View>
          <View style={styles.ctaBtn}>
            <Icon name="add" size={14} color="#FFFFFF" strokeWidth={3} />
            <Text style={styles.ctaText}>Request</Text>
          </View>
        </Pressable>
      ) : null}
      <Segmented
        options={[
          { value: 'active', label: activeCount ? `Active · ${activeCount}` : 'Active' },
          { value: 'history', label: 'History' },
          { value: 'all', label: 'All' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'history' ? (
        <Chips
          options={[
            { value: '3', label: '3 months' },
            { value: '6', label: '6 months' },
            { value: '12', label: '12 months' },
            { value: 'all', label: 'All time' },
          ]}
          value={range}
          onChange={pickRange}
        />
      ) : null}
    </View>
  );

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.id}
      ListHeaderComponent={header}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
      showsVerticalScrollIndicator={false}
      refreshControl={<PullRefresh onRefresh={() => refetch()} />}
      renderItem={({ item }) => (
        <ServiceRequestCard request={item} onPress={() => router.push(`/requests/${item.id}`)} />
      )}
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

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  list: { padding: space.lg, paddingTop: space.sm, paddingBottom: space.xxl },
  header: { gap: space.md, marginBottom: space.md },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.md,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 7,
  },
  ctaText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  empty: { minHeight: 260 },
});
