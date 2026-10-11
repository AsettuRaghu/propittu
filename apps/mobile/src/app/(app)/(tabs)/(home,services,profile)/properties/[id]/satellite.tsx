import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SATELLITE_CHANGE_LABELS } from '@propittu/shared';
import { useSatellite } from '@/api/ai';
import { useServices } from '@/api/queries';
import { PropertyContext } from '@/components/PropertyContext';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { Button, ListGroup } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { accents, colors, radius, space, typography } from '@/theme';

/**
 * From space: free satellite pictures of the plot over time (Sentinel-2,
 * 10 m), and what Pittu noticed — the plot cleared, something built on it,
 * new building close by. Honest about what 10 m pictures can show.
 */
export default function SatelliteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isPending, error, refetch } = useSatellite(id, true);
  const services = useServices();
  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data.observations.length) {
    return (
      <EmptyState
        icon="satellite"
        accent="sky"
        title="Looking for a clear picture"
        message="Pittu checks the satellite pictures of your plot every month. During the monsoon clouds can hide it for weeks — the first clear one will appear here."
      />
    );
  }
  const latest = data.observations[0]!;
  const changed = latest.change !== 'none' && latest.change !== 'baseline';
  const book = () => {
    const s = (services.data ?? []).find((x) => x.code === 'site_inspection');
    router.push({
      pathname: '/services/request',
      params: { propertyId: id, ...(s ? { serviceId: s.id } : {}) },
    });
  };
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <PropertyContext propertyId={id} />
      <View style={[styles.verdict, changed && styles.verdictChanged]}>
        <Text style={typography.bodyStrong}>
          {changed ? SATELLITE_CHANGE_LABELS[latest.change] : 'No clear change from space'}
        </Text>
        <Text style={typography.small}>
          {`Latest clear picture: ${formatDate(latest.captured_at)}. ${
            changed
              ? 'Worth a look on the ground — we can visit and send photos.'
              : 'Pittu checks again every month.'
          }`}
        </Text>
        {changed ? <Button title="Book a site check" size="sm" onPress={book} /> : null}
      </View>
      <ListGroup title="Pictures over time" plain>
        <View style={styles.grid}>
          {data.observations.map((o) => (
            <View key={o.id} style={styles.tile}>
              <Image source={{ uri: o.picture_url }} style={styles.picture} contentFit="cover" />
              <Text style={typography.caption}>
                {`${formatDate(o.captured_at)}${
                  o.change !== 'none' && o.change !== 'baseline'
                    ? ` · ${SATELLITE_CHANGE_LABELS[o.change]}`
                    : ''
                }`}
              </Text>
            </View>
          ))}
        </View>
      </ListGroup>
      <Text style={typography.caption}>
        About 600 m around your pin, from the free Sentinel-2 satellites (10 m detail). Good for
        spotting clearing or new building on and around the plot — not small details like a gate or
        a boundary stone. Contains modified Copernicus Sentinel data.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingTop: space.xs, gap: space.lg, paddingBottom: space.xxl },
  verdict: {
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: 'flex-start',
  },
  verdictChanged: { backgroundColor: accents.amber.bg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, paddingHorizontal: 14 },
  tile: { width: '47%', gap: 4 },
  picture: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
});
