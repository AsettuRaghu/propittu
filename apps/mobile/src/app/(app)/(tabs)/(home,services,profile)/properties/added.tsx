import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { Banner, Button, GradientCard } from '@/components/ui';
import { colors, gradients, space, typography } from '@/theme';

/** "Property Added" confirmation (PRODUCT_SPEC.md §16 Step 5). */
export default function PropertyAddedScreen() {
  const { id, failed } = useLocalSearchParams<{ id: string; failed?: string }>();
  const failedCount = Number(failed) || 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.body}>
        <GradientCard colors={gradients.brand} style={styles.badge}>
          <Icon name="celebrate" size={40} color="#FFFFFF" strokeWidth={1.8} />
        </GradientCard>
        <Text style={[typography.display, styles.center]}>Property added</Text>
        <Text style={[typography.body, styles.center, styles.muted]}>
          Next, pin it on the map and add the sale deed — it takes a minute.
        </Text>
        {failedCount > 0 ? (
          <Banner
            tone="warning"
            message={`${failedCount} ${failedCount === 1 ? "photo couldn't" : "photos couldn't"} be uploaded. You can add ${failedCount === 1 ? 'it' : 'them'} from the property page.`}
          />
        ) : null}
      </View>
      <View style={styles.actions}>
        <Button
          title="Pin it on the map"
          icon="pin"
          onPress={() => {
            router.replace(`/properties/${id}`);
            router.push(`/properties/${id}/location`);
          }}
        />
        <Button
          title="View property"
          variant="secondary"
          onPress={() => router.replace(`/properties/${id}`)}
        />
        <Button title="Back to Home" variant="ghost" onPress={() => router.replace('/')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background, padding: space.xl },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: space.md },
  badge: {
    width: 96,
    height: 96,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  center: { textAlign: 'center' },
  muted: { color: colors.textMuted, maxWidth: 300 },
  actions: { gap: space.sm },
});
