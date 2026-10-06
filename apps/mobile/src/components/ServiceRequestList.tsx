import { router } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useServiceRequests } from '@/api/queries';
import { colors, space } from '@/theme';
import { ServiceRequestCard } from './ServiceRequestCard';
import { EmptyState, ErrorState, LoadingState } from './States';

/** Service request history (§8.4), optionally for one property. */
export function ServiceRequestList({ propertyId }: { propertyId?: string }) {
  const { data, isPending, error, refetch, isRefetching } = useServiceRequests(propertyId);

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <FlatList
      data={data}
      keyExtractor={(r) => r.id}
      contentContainerStyle={data.length === 0 ? styles.empty : styles.list}
      ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          tintColor={colors.primary}
        />
      }
      renderItem={({ item }) => (
        <ServiceRequestCard request={item} onPress={() => router.push(`/requests/${item.id}`)} />
      )}
      ListEmptyComponent={
        <EmptyState
          icon="requests"
          accent="coral"
          title="No requests yet"
          message="Book a service and follow every step right here."
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: space.lg, paddingTop: space.sm, paddingBottom: space.xxl },
  empty: { flexGrow: 1 },
});
