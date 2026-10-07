import { router } from 'expo-router';
import { useState } from 'react';
import {
  LayoutAnimation,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import type { Property } from '@propittu/shared';
import { accents, colors, font, radius, shadow, space } from '@/theme';
import { dialog } from './Dialog';
import { Icon, type IconName } from './Icon';

if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);

/**
 * The property on the map, right under its name.
 *
 *   collapsed  a calm preview (no gestures) — tap to expand
 *   expanded   a live map + Directions / Satellite / Adjust pin / Collapse
 *
 * iPhone uses Apple Maps and Android uses Google Maps (react-native-maps).
 * Directions hand off to the user's maps app of choice.
 */
export function PropertyMapCard({ property }: { property: Property }) {
  const [expanded, setExpanded] = useState(false);
  const [satellite, setSatellite] = useState(false);
  const hasPin = property.latitude !== null && property.longitude !== null;
  const adjust = () => router.push(`/properties/${property.id}/location`);

  if (!hasPin) {
    return (
      <Pressable
        onPress={adjust}
        accessibilityRole="button"
        style={({ pressed }) => [styles.card, shadow, styles.empty, pressed && { opacity: 0.85 }]}
      >
        <View style={styles.emptyIcon}>
          <Icon name="pin" size={18} color={accents.teal.fg} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.emptyTitle}>Pin the exact location</Text>
          <Text style={styles.emptyText}>Helps our team find it for visits.</Text>
        </View>
        <View style={styles.emptyCta}>
          <Text style={styles.emptyCtaText}>Set pin</Text>
        </View>
      </Pressable>
    );
  }

  const lat = property.latitude as number;
  const lng = property.longitude as number;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.create(260, 'easeInEaseOut', 'scaleY'));
    setExpanded((v) => !v);
  };

  const directions = async () => {
    const label = encodeURIComponent(property.name);
    const choice = await dialog.actions({
      title: 'Open directions in',
      actions: [
        ...(Platform.OS === 'ios'
          ? [{ label: 'Apple Maps', value: 'apple' as const, icon: 'map' as const }]
          : []),
        { label: 'Google Maps', value: 'google' as const, icon: 'navigate' as const },
      ],
    });
    if (!choice) return;
    const url =
      choice === 'apple'
        ? `http://maps.apple.com/?daddr=${lat},${lng}&q=${label}`
        : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    await Linking.openURL(url).catch(() => undefined);
  };

  return (
    <View style={[styles.card, shadow]}>
      <Pressable
        onPress={expanded ? undefined : toggle}
        disabled={expanded}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Property map' : 'Expand map'}
      >
        <MapView
          style={{ height: expanded ? 320 : 150 }}
          pointerEvents={expanded ? 'auto' : 'none'}
          scrollEnabled={expanded}
          zoomEnabled={expanded}
          rotateEnabled={false}
          pitchEnabled={false}
          showsPointsOfInterests={expanded}
          showsBuildings={expanded}
          toolbarEnabled={false}
          mapType={satellite ? 'hybrid' : 'standard'}
          initialRegion={{
            latitude: lat,
            longitude: lng,
            latitudeDelta: 0.008,
            longitudeDelta: 0.008,
          }}
        >
          <Marker coordinate={{ latitude: lat, longitude: lng }} pinColor={colors.primary} />
        </MapView>
        {!expanded ? (
          <View style={styles.expandHint} pointerEvents="none">
            <Icon name="expand" size={14} color={colors.text} />
            <Text style={styles.expandText}>Tap to expand</Text>
          </View>
        ) : null}
      </Pressable>

      {expanded ? (
        <View style={styles.actions}>
          <MapAction
            icon="directions"
            label="Directions"
            onPress={() => void directions()}
            primary
          />
          <MapAction
            icon={satellite ? 'map' : 'satellite'}
            label={satellite ? 'Map' : 'Satellite'}
            onPress={() => setSatellite((v) => !v)}
          />
          <MapAction icon="pin" label="Adjust pin" onPress={adjust} />
          <MapAction icon="collapse" label="Collapse" onPress={toggle} />
        </View>
      ) : null}
    </View>
  );
}

function MapAction({
  icon,
  label,
  onPress,
  primary = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.actionIcon, primary && styles.actionIconPrimary]}>
        <Icon name={icon} size={18} color={primary ? '#FFFFFF' : accents.teal.fg} />
      </View>
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  expandHint: {
    position: 'absolute',
    right: space.sm,
    bottom: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  expandText: { fontSize: font(12), fontWeight: '700', color: colors.text },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
  },
  action: { alignItems: 'center', gap: 6, minWidth: 70 },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: accents.teal.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconPrimary: { backgroundColor: accents.teal.fg },
  actionText: { fontSize: font(12), fontWeight: '600', color: colors.text },
  empty: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  emptyIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: accents.teal.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { color: colors.text, fontSize: font(15), fontWeight: '700' },
  emptyText: { color: colors.textMuted, fontSize: font(12), marginTop: 1 },
  emptyCta: {
    backgroundColor: accents.teal.bg,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 6,
  },
  emptyCtaText: { color: accents.teal.fg, fontSize: font(13), fontWeight: '800' },
});
