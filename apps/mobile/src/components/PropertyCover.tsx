import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PROPERTY_TYPE_LABELS, type PropertyType } from '@propittu/shared';
import { formatLocation } from '@/lib/format';
import { signedImage } from '@/lib/image';
import { PROPERTY_TYPE_GRADIENTS, PROPERTY_TYPE_ICONS } from '@/lib/icons';
import { font, radius, space } from '@/theme';
import { Icon } from './Icon';
import { WeatherChip } from './WeatherChip';

/**
 * A property's cover: its photo (or its type's colours) with the type and
 * live weather on top and the name and place over a soft fade. Used by the
 * Home card and at the top of the property page, so they always match.
 */
export function PropertyCover({
  property: p,
  height,
  coverUrl,
  showWeatherLabel = false,
  children,
}: {
  property: {
    id: string;
    name: string;
    property_type: PropertyType;
    city: string | null;
    state: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  height: number;
  coverUrl: string | null;
  showWeatherLabel?: boolean;
  /** Rendered at the bottom-right, over the photo (e.g. an action). */
  children?: ReactNode;
}) {
  const location = formatLocation(p);
  const type = PROPERTY_TYPE_LABELS[p.property_type].split(' / ')[0];
  return (
    <View style={[styles.media, { height }]}>
      {coverUrl ? (
        <Image
          source={signedImage(coverUrl)}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
          recyclingKey={p.id}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <LinearGradient
          colors={PROPERTY_TYPE_GRADIENTS[p.property_type]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, styles.placeholder]}
        >
          <Icon
            name={PROPERTY_TYPE_ICONS[p.property_type]}
            size={Math.round(height / 2.6)}
            color="rgba(255,255,255,0.22)"
            strokeWidth={1.4}
          />
        </LinearGradient>
      )}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']}
        style={styles.fade}
        pointerEvents="none"
      />
      <View style={styles.topRow}>
        <View style={styles.chip}>
          <Icon name={PROPERTY_TYPE_ICONS[p.property_type]} size={12} color="#FFFFFF" />
          <Text style={styles.chipText}>{type}</Text>
        </View>
        <WeatherChip lat={p.latitude} lon={p.longitude} tone="light" showLabel={showWeatherLabel} />
      </View>
      <View style={styles.bottomRow}>
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={2}>
            {p.name}
          </Text>
          {location ? (
            <View style={styles.locationRow}>
              <Icon name="pin" size={12} color="rgba(255,255,255,0.9)" />
              <Text style={styles.location} numberOfLines={1}>
                {location}
              </Text>
            </View>
          ) : null}
        </View>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  media: { justifyContent: 'space-between', backgroundColor: '#1F2340' },
  placeholder: { alignItems: 'flex-end', justifyContent: 'center', paddingRight: space.xl },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, top: '35%' },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: space.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.32)',
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
  },
  chipText: { fontSize: font(12), fontWeight: '700', color: '#FFFFFF' },
  bottomRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, padding: space.md },
  name: { fontSize: font(20), fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  location: { fontSize: font(13), color: 'rgba(255,255,255,0.9)', flexShrink: 1 },
});
