import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { locationIssueText, type PropertyDetail } from '@propittu/shared';
import { useUpdateProperty } from '@/api/queries';
import { errorMessage } from '@/lib/errors';
import { colors, font, radius, space, typography } from '@/theme';
import { dialog, toast } from './Dialog';
import { Icon } from './Icon';
import { Button } from './ui';

/**
 * The map pin disagrees with the PIN code, or with the place the sale deed
 * names — one of them is wrong, and the customer is the one who knows
 * which. It stays until they choose: the pin is right, or move the pin
 * (the map then starts at the PIN code's area / the deed's village).
 */
export function LocationIssueNotice({ property: p }: { property: PropertyDetail }) {
  const update = useUpdateProperty(p.id);
  const issue = p.location_issue;
  // A confirmed gap from the deed is no longer an alert (DeedGaps shows it calmly).
  if (!issue || issue.confirmed || p.latitude === null || p.longitude === null) return null;
  const lat = p.latitude;
  const lng = p.longitude;

  // "The pin is right": against the PIN code, take the PIN code from the pin;
  // against the deed, remember the customer's word for this pin.
  const pinIsRight = () =>
    update.mutate(
      issue.kind === 'pincode'
        ? { latitude: lat, longitude: lng, address_from_pin: true }
        : { latitude: lat, longitude: lng, pin_confirmed: true },
      {
        onSuccess: () =>
          toast(issue.kind === 'pincode' ? 'Address updated from the pin' : 'Pin confirmed'),
        onError: (err) =>
          void dialog.alert({
            title: 'Couldn’t save that',
            message: errorMessage(err),
            tone: 'danger',
          }),
      },
    );

  return (
    <View style={styles.box}>
      <View style={styles.head}>
        <Icon name="warning" size={18} color={colors.danger} />
        <Text style={styles.title}>
          {issue.kind === 'pincode'
            ? 'The pin and the PIN code disagree'
            : 'The pin is far from where your deed says'}
        </Text>
      </View>
      <Text style={typography.small}>{locationIssueText(issue)} Which is right?</Text>
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
          onPress={() =>
            router.push({
              pathname: '/properties/[id]/location',
              params: {
                id: p.id,
                ...(issue.near
                  ? {
                      at: `${issue.near.latitude},${issue.near.longitude}`,
                      atLabel: issue.other_place,
                    }
                  : {}),
              },
            })
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { fontSize: font(15), fontWeight: '800', color: colors.danger, flex: 1 },
  actions: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
});
