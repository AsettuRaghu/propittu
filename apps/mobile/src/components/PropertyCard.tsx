import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PROPERTY_TYPE_LABELS, type PropertySummary } from '@propittu/shared';
import { formatLocation } from '@/lib/format';
import { PROPERTY_TYPE_GRADIENTS, PROPERTY_TYPE_ICONS } from '@/lib/icons';
import { signedImage } from '@/lib/image';
import { colors, radius, shadow, space, typography } from '@/theme';
import { Icon, type IconName } from './Icon';

/** Home-screen card (PRODUCT_SPEC.md §15): photo-led, with quick facts. */
export function PropertyCard({
  property,
  onPress,
}: {
  property: PropertySummary;
  onPress: () => void;
}) {
  const location = formatLocation(property);
  const type = PROPERTY_TYPE_LABELS[property.property_type].split(' / ')[0];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={property.name}
      style={({ pressed }) => [styles.card, shadow, pressed && styles.pressed]}
    >
      <View style={styles.media}>
        {property.cover_photo_url ? (
          <Image
            source={signedImage(property.cover_photo_url)}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
            recyclingKey={property.id}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <LinearGradient
            colors={PROPERTY_TYPE_GRADIENTS[property.property_type]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, styles.placeholder]}
          >
            <View style={styles.placeholderIcon}>
              <Icon
                name={PROPERTY_TYPE_ICONS[property.property_type]}
                size={64}
                color="rgba(255,255,255,0.28)"
                strokeWidth={1.5}
              />
            </View>
          </LinearGradient>
        )}
        <LinearGradient
          colors={['rgba(20,24,51,0)', 'rgba(20,24,51,0.55)']}
          style={styles.scrim}
          pointerEvents="none"
        />
        <View style={styles.typeChip}>
          <Icon name={PROPERTY_TYPE_ICONS[property.property_type]} size={13} color={colors.text} />
          <Text style={styles.typeText}>{type}</Text>
        </View>
        <View style={styles.titleOnImage}>
          <Text style={styles.name} numberOfLines={1}>
            {property.name}
          </Text>
          {location ? (
            <View style={styles.locationRow}>
              <Icon name="pin" size={13} color="rgba(255,255,255,0.9)" />
              <Text style={styles.location} numberOfLines={1}>
                {location}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.stats}>
        <Stat icon="document" value={property.document_count} label="Docs" />
        <Stat icon="image" value={property.photo_count} label="Photos" />
        <Stat icon="requests" value={property.service_request_count} label="Requests" />
        <View style={styles.flex} />
        <Icon name="chevron" size={18} color={colors.textSubtle} />
      </View>
    </Pressable>
  );
}

function Stat({ icon, value, label }: { icon: IconName; value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Icon name={icon} size={14} color={colors.textMuted} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={typography.caption}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  pressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  media: { height: 148, backgroundColor: colors.surfaceMuted, justifyContent: 'flex-end' },
  placeholder: { alignItems: 'flex-end', justifyContent: 'center' },
  placeholderIcon: { marginRight: space.lg },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, top: '35%' },
  typeChip: {
    position: 'absolute',
    top: space.md,
    left: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  typeText: { fontSize: 12, fontWeight: '700', color: colors.text },
  titleOnImage: { padding: space.lg, paddingBottom: space.md, gap: 3 },
  name: { fontSize: 19, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  location: { fontSize: 13, color: 'rgba(255,255,255,0.92)', fontWeight: '500' },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statValue: { fontSize: 14, fontWeight: '800', color: colors.text },
});
