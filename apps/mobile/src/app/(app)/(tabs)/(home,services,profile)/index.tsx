import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMe, useProperties } from '@/api/queries';
import { LimitedAccessState, PlanBanner } from '@/components/PlanGate';
import { PropertyCard } from '@/components/PropertyCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { Button } from '@/components/ui';
import { greeting, plural } from '@/lib/format';
import { colors, radius, space, typography } from '@/theme';

/** Home (PRODUCT_SPEC.md §15). */
export default function HomeScreen() {
  const me = useMe();
  // Strict Limited Access (M6): property data is not even fetched.
  const limited = me.data?.plan.access === 'limited';
  const { data, isPending, error, refetch, isRefetching } = useProperties(!limited);
  const addProperty = () => router.push('/properties/new');

  if (limited) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={typography.title}>{greeting()}</Text>
        </View>
        <LimitedAccessState status={me.data?.plan.status} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={typography.title}>{greeting()}</Text>
        <View style={styles.titleRow}>
          <Text style={typography.heading}>Your Properties</Text>
          <Pressable
            onPress={addProperty}
            style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel="Add property"
            hitSlop={8}
          >
            <Ionicons name="add" size={24} color={colors.onPrimary} />
          </Pressable>
        </View>
        {data && data.length > 0 ? (
          <Text style={typography.small}>{plural(data.length, 'Property', 'Properties')}</Text>
        ) : null}
        {me.data ? <PlanBanner plan={me.data.plan} /> : null}
      </View>

      {isPending ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(p) => p.id}
          contentContainerStyle={data.length === 0 ? styles.emptyContainer : styles.list}
          ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <PropertyCard property={item} onPress={() => router.push(`/properties/${item.id}`)} />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="home-outline"
              title="You don't have any properties yet."
              message="Add your first property and start keeping everything organized."
              action={<Button title="Add Property" icon="add" onPress={addProperty} />}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
    gap: space.sm,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space.sm,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonPressed: { backgroundColor: colors.primaryPressed },
  list: { padding: space.lg, paddingTop: space.sm },
  emptyContainer: { flexGrow: 1 },
});
