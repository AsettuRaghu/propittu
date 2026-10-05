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
      ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
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
          icon="clipboard-outline"
          title="No service requests yet"
          message="Requests you submit will appear here with their status."
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: space.lg },
  empty: { flexGrow: 1 },
});
