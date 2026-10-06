import { router } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMe, useProperties } from '@/api/queries';
import { Icon, type IconName } from '@/components/Icon';
import { LimitedAccessState, PlanBanner } from '@/components/PlanGate';
import { PropertyCard } from '@/components/PropertyCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { Button, IconButton } from '@/components/ui';
import { greeting } from '@/lib/format';
import { accents, colors, radius, space, typography } from '@/theme';

function greetingIcon(now = new Date()): IconName {
  const h = now.getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 20) return 'evening';
  return 'night';
}

/** Home (PRODUCT_SPEC.md §15): a warm greeting and your properties. */
export default function HomeScreen() {
  const me = useMe();
  // Strict Limited Access (M6): property data is not even fetched.
  const limited = me.data?.plan.access === 'limited';
  const { data, isPending, error, refetch, isRefetching } = useProperties(!limited);
  const addProperty = () => router.push('/properties/new');
  const name = me.data?.full_name?.split(' ')[0];

  const header = (
    <View style={styles.header}>
      <View style={styles.greetingRow}>
        <Icon name={greetingIcon()} size={16} color={accents.amber.fg} />
        <Text style={styles.greeting}>
          {greeting()}
          {name ? `, ${name}` : ''}
        </Text>
      </View>
      <View style={styles.titleRow}>
        <Text style={typography.display}>Your properties</Text>
        {data && data.length > 0 ? (
          <View style={styles.count}>
            <Text style={styles.countText}>{data.length}</Text>
          </View>
        ) : null}
        <View style={styles.flex} />
        {!limited ? (
          <IconButton
            icon="add"
            label="Add property"
            variant="solid"
            size={42}
            onPress={addProperty}
          />
        ) : null}
      </View>
      {me.data && !limited ? <PlanBanner plan={me.data.plan} /> : null}
    </View>
  );

  const padded = <View style={styles.pad}>{header}</View>;

  if (limited) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        {padded}
        <LimitedAccessState status={me.data?.plan.status} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {isPending ? (
        <>
          {padded}
          <LoadingState />
        </>
      ) : error ? (
        <>
          {padded}
          <ErrorState error={error} onRetry={() => void refetch()} />
        </>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(p) => p.id}
          ListHeaderComponent={header}
          contentContainerStyle={data.length === 0 ? styles.emptyContainer : styles.list}
          ItemSeparatorComponent={() => <View style={{ height: space.lg }} />}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => {
                void refetch();
                void me.refetch();
              }}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <PropertyCard property={item} onPress={() => router.push(`/properties/${item.id}`)} />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="home"
              title="Add your first property"
              message="Keep its documents, photos, location and services together — all in one place."
              action={<Button title="Add property" icon="add" onPress={addProperty} />}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { paddingTop: space.md, paddingBottom: space.lg, gap: space.md },
  greetingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  greeting: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  count: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontSize: 14, fontWeight: '800', color: colors.primary },
  pad: { paddingHorizontal: space.lg },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  emptyContainer: { flexGrow: 1, paddingHorizontal: space.lg },
});
