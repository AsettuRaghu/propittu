import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import type { PropertyReach } from '@propittu/shared';
import { useReachInterest } from '@/api/queries';
import { showAlert } from '@/lib/alert';
import { errorMessage } from '@/lib/errors';
import { accents, radius, space, typography } from '@/theme';
import { Icon } from './Icon';
import { Button } from './ui';

/**
 * Property page: shown only when our team cannot visit this property yet
 * (or we can't tell without a PIN code). Never blocks anything else.
 */
export function ReachNotice({
  propertyId,
  reach,
}: {
  propertyId: string;
  reach: PropertyReach | null;
}) {
  const interest = useReachInterest(propertyId);
  if (!reach || reach.visits) return null;
  const a = accents.sky;

  if (!reach.has_pincode) {
    return (
      <View style={[styles.box, { backgroundColor: a.bg }]}>
        <Icon name="pin" size={20} color={a.fg} />
        <View style={styles.flex}>
          <Text style={typography.bodyStrong}>Add the PIN code</Text>
          <Text style={typography.small}>
            It tells us which of our services can reach this property.
          </Text>
          <Button
            title="Add PIN code"
            variant="secondary"
            onPress={() => router.push(`/properties/${propertyId}/edit`)}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.box, { backgroundColor: a.bg }]}>
      <Icon name="map" size={20} color={a.fg} />
      <View style={styles.flex}>
        <Text style={typography.bodyStrong}>Our team doesn’t visit this area yet</Text>
        <Text style={typography.small}>
          Documents, Pittu and reminders work as usual
          {reach.paperwork ? ', and paperwork help is available' : ''}. Site visits will come once
          we’re in your area.
        </Text>
        {reach.interested ? (
          <View style={styles.done}>
            <Icon name="check" size={16} color={a.fg} />
            <Text style={typography.small}>We’ll tell you when we arrive</Text>
          </View>
        ) : (
          <Button
            title="Tell me when you arrive"
            variant="secondary"
            icon="bell"
            loading={interest.isPending}
            onPress={() =>
              interest.mutate(undefined, {
                onError: (err) => showAlert("Couldn't save that", errorMessage(err)),
              })
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: space.xs },
  box: { flexDirection: 'row', gap: space.md, padding: space.lg, borderRadius: radius.lg },
  done: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: space.xs },
});
