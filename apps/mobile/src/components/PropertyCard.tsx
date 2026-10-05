import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import type { PropertySummary } from '@propittu/shared';
import { propertySubtitle } from '@/lib/format';
import { PROPERTY_TYPE_ICONS } from '@/lib/icons';
import { signedImage } from '@/lib/image';
import { colors, radius, space, typography } from '@/theme';
import { Card } from './ui';

/** Home-screen card (PRODUCT_SPEC.md §15). */
export function PropertyCard({
  property,
  onPress,
}: {
  property: PropertySummary;
  onPress: () => void;
}) {
  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.top}>
        {property.cover_photo_url ? (
          <Image
            source={signedImage(property.cover_photo_url)}
            style={styles.thumb}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
            recyclingKey={property.id}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Ionicons
              name={PROPERTY_TYPE_ICONS[property.property_type]}
              size={26}
              color={colors.primary}
            />
          </View>
        )}
        <View style={styles.titles}>
          <Text style={typography.heading} numberOfLines={1}>
            {property.name}
          </Text>
          <Text style={typography.small} numberOfLines={1}>
            {propertySubtitle(property)}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textSubtle} />
      </View>

      <View style={styles.stats}>
        <Stat label="Documents" value={property.document_count} />
        <Stat label="Service Requests" value={property.service_request_count} />
      </View>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={typography.small}>{label}</Text>
      <Text style={typography.bodyStrong}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  thumb: { width: 56, height: 56, borderRadius: radius.md },
  thumbPlaceholder: {
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titles: { flex: 1, gap: 2 },
  stats: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.md,
    gap: space.xs,
  },
  stat: { flexDirection: 'row', justifyContent: 'space-between' },
});
