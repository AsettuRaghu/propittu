import { router } from 'expo-router';
import { useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  LayoutAnimation,
  Linking,
  Platform,
  Pressable,
  Share,
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
import { Button } from './ui';

if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);

/**
 * The property on the map, right under its name.
 *
 *   no pin     a bold prompt to pin it (why it matters, one button)
 *   pinned     the map with Directions · Share · Adjust pin · Expand/Satellite
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
      <LinearGradient
        colors={[accents.teal.fg, accents.sky.fg]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, styles.prompt]}
      >
        <View style={styles.promptIcon}>
          <Icon name="pin" size={24} color="#FFFFFF" />
        </View>
        <Text style={styles.promptTitle}>Pin the exact location</Text>
        <Text style={styles.promptText}>
          So our team finds it first time — and you can navigate there, share it with family and see
          the weather at the site.
        </Text>
        <Button title="Pin it now" icon="pin" variant="secondary" onPress={adjust} />
      </LinearGradient>
    );
  }

  const lat = property.latitude as number;
  const lng = property.longitude as number;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.create(260, 'easeInEaseOut', 'scaleY'));
    setExpanded((v) => !v);
  };

  const share = () =>
    void Share.share({
      message: `${property.name} — https://maps.google.com/?q=${lat},${lng}`,
    }).catch(() => undefined);

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
        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel="Collapse map"
          style={[styles.expandHint, styles.collapse]}
        >
          <Icon name="collapse" size={14} color={colors.text} />
          <Text style={styles.expandText}>Collapse</Text>
        </Pressable>
      ) : null}

      <View style={styles.actions}>
        <MapAction icon="directions" label="Directions" onPress={() => void directions()} primary />
        <MapAction icon="share" label="Share" onPress={share} />
        <MapAction icon="pin" label="Adjust pin" onPress={adjust} />
        {expanded ? (
          <MapAction
            icon={satellite ? 'map' : 'satellite'}
            label={satellite ? 'Map' : 'Satellite'}
            onPress={() => setSatellite((v) => !v)}
          />
        ) : (
          <MapAction icon="expand" label="Expand" onPress={toggle} />
        )}
      </View>
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
  collapse: { top: space.sm, bottom: undefined },
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
  prompt: { padding: space.xl, gap: space.md },
  promptIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptTitle: { fontSize: font(22), fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.4 },
  promptText: { fontSize: font(15), lineHeight: font(21), color: 'rgba(255,255,255,0.92)' },
});
