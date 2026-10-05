import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner, Button } from '@/components/ui';
import { colors, space, typography } from '@/theme';

/** "Property Added" confirmation (PRODUCT_SPEC.md §16 Step 5). */
export default function PropertyAddedScreen() {
  const { id, failed } = useLocalSearchParams<{ id: string; failed?: string }>();
  const failedCount = Number(failed) || 0;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.body}>
        <View style={styles.iconCircle}>
          <Ionicons name="checkmark" size={44} color={colors.success} />
        </View>
        <Text style={[typography.title, styles.center]}>Property Added</Text>
        <Text style={[typography.body, styles.center, styles.muted]}>
          Your property has been successfully added.
        </Text>
        {failedCount > 0 ? (
          <Banner
            tone="warning"
            message={`${failedCount} ${failedCount === 1 ? "photo couldn't" : "photos couldn't"} be uploaded. You can add ${failedCount === 1 ? 'it' : 'them'} from the property page.`}
          />
        ) : null}
      </View>
      <View style={styles.actions}>
        <Button title="View Property" onPress={() => router.replace(`/properties/${id}`)} />
        <Button title="Back to Home" variant="ghost" onPress={() => router.replace('/')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background, padding: space.xl },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: space.md },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  center: { textAlign: 'center' },
  muted: { color: colors.textMuted },
  actions: { gap: space.sm },
});
