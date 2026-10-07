import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import type { PropertyDetail } from '@propittu/shared';
import { useUpdateProperty } from '@/api/queries';
import { errorMessage } from '@/lib/errors';
import { colors, font, radius, space, typography } from '@/theme';
import { dialog, toast } from './Dialog';
import { Icon } from './Icon';
import { Button } from './ui';

/**
 * The map pin and the PIN code point to different places — one of them is
 * wrong, and the customer is the one who knows which. Two ways out: the pin
 * is right (take the PIN code, city and state from it), or move the pin.
 */
export function LocationIssueNotice({ property: p }: { property: PropertyDetail }) {
  const update = useUpdateProperty(p.id);
  const issue = p.location_issue;
  if (!issue || p.latitude === null || p.longitude === null) return null;
  const lat = p.latitude;
  const lng = p.longitude;

  const pinIsRight = () =>
    update.mutate(
      { latitude: lat, longitude: lng, address_from_pin: true },
      {
        onSuccess: () => toast('Address updated from the pin'),
        onError: (err) =>
          void dialog.alert({
            title: 'Couldn’t update the address',
            message: errorMessage(err),
            tone: 'danger',
          }),
      },
    );

  return (
    <View style={styles.box}>
      <View style={styles.head}>
        <Icon name="warning" size={18} color={colors.warning} />
        <Text style={styles.title}>The pin and the PIN code disagree</Text>
      </View>
      <Text style={typography.small}>
        The pin is in {issue.pin_place}, but PIN code {issue.pincode} is in {issue.pincode_place} —
        about {issue.distance_km} km apart. Which is right?
      </Text>
      <View style={styles.actions}>
        <Button
          title="The pin is right"
          size="sm"
          onPress={pinIsRight}
          loading={update.isPending}
        />
        <Button
          title="Move the pin"
          size="sm"
          variant="secondary"
          icon="pin"
          onPress={() => router.push(`/properties/${p.id}/location`)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { fontSize: font(15), fontWeight: '800', color: colors.warning, flex: 1 },
  actions: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
});
