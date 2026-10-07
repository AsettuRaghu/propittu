import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PROPERTY_TYPE_LABELS, type LocationIssue, type PropertyType } from '@propittu/shared';
import { formatLocation } from '@/lib/format';
import { signedImage } from '@/lib/image';
import { PROPERTY_TYPE_GRADIENTS, PROPERTY_TYPE_ICONS } from '@/lib/icons';
import { openDirections, shareLocation } from '@/lib/maps';
import { accents, font, radius, space } from '@/theme';
import { dialog } from './Dialog';
import { Icon } from './Icon';
import { WeatherChip } from './WeatherChip';

interface CoverProperty {
  id: string;
  name: string;
  property_type: PropertyType;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  location_issue: LocationIssue | null;
}

/**
 * A property's cover: its photos (swipe through them) or its type's
 * colours, with the type, the live weather and the location on top, and
 * the name and place over a soft fade. Weather and location are tappable —
 * what the weather means for the site; directions, sharing, or pinning it.
 * Used by the Home card and (larger) at the top of the property page.
 */
export function PropertyCover({
  property: p,
  height,
  photos,
  approximate = false,
  size = 'md',
  children,
}: {
  property: CoverProperty;
  height: number;
  /** Photo URLs; more than one can be swiped. */
  photos: string[];
  /** The pin is only near the deed's area, not the exact spot. */
  approximate?: boolean;
  size?: 'md' | 'lg';
  /** Rendered at the bottom-right, over the photo (e.g. an action). */
  children?: ReactNode;
}) {
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const location = formatLocation(p);
  const type = PROPERTY_TYPE_LABELS[p.property_type].split(' / ')[0];
  const lg = size === 'lg';

  return (
    <View style={[styles.media, { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {photos.length > 1 && width > 0 ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={StyleSheet.absoluteFill}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        >
          {photos.map((url, i) => (
            <Image
              key={`${i}`}
              source={signedImage(url)}
              style={{ width, height }}
              contentFit="cover"
              cachePolicy="memory-disk"
              accessibilityLabel={`Photo ${i + 1} of ${photos.length}`}
            />
          ))}
        </ScrollView>
      ) : photos[0] ? (
        <Image
          source={signedImage(photos[0])}
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
        colors={['rgba(0,0,0,0.28)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.6)']}
        locations={[0, 0.3, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topRow} pointerEvents="box-none">
          <View style={[styles.chip, lg && styles.chipLg]}>
            <Icon name={PROPERTY_TYPE_ICONS[p.property_type]} size={lg ? 18 : 16} color="#FFFFFF" />
            <Text style={[styles.chipText, lg && styles.chipTextLg]}>{type}</Text>
          </View>
          <View style={styles.topRight} pointerEvents="box-none">
            <WeatherChip
              lat={p.latitude}
              lon={p.longitude}
              name={p.name}
              tone="light"
              size={size}
              showLabel={lg}
            />
            <LocationButton property={p} approximate={approximate} size={size} />
          </View>
        </View>

        <View style={styles.bottom} pointerEvents="box-none">
          {photos.length > 1 ? (
            <View style={styles.dots} pointerEvents="none">
              {photos.map((_, i) => (
                <View key={i} style={[styles.dot, i === page && styles.dotOn]} />
              ))}
            </View>
          ) : null}
          <View style={styles.bottomRow} pointerEvents="box-none">
            <View style={styles.flex} pointerEvents="none">
              <Text style={[styles.name, lg && styles.nameLg]} numberOfLines={2}>
                {p.name}
              </Text>
              {location ? (
                <Text style={[styles.location, lg && styles.locationLg]} numberOfLines={1}>
                  {location}
                </Text>
              ) : null}
            </View>
            {children}
          </View>
        </View>
      </View>
    </View>
  );
}

/**
 * The pin on the cover. Pinned: directions, share, or set the exact spot.
 * Not pinned: an invitation to pin it. If the pin and the PIN code disagree,
 * it turns amber and says so.
 */
function LocationButton({
  property: p,
  approximate,
  size,
}: {
  property: CoverProperty;
  approximate: boolean;
  size: 'md' | 'lg';
}) {
  const pinned = p.latitude !== null && p.longitude !== null;
  const issue = p.location_issue;
  const pin = () => router.push(`/properties/${p.id}/location`);

  const onPress = async () => {
    if (issue) {
      const fix = await dialog.confirm({
        title: 'The pin and the PIN code disagree',
        message: `The pin is in ${issue.pin_place}, but PIN code ${issue.pincode} is in ${issue.pincode_place} — about ${issue.distance_km} km apart. One of them needs fixing.`,
        confirmLabel: 'Fix it',
        tone: 'warning',
      });
      if (fix) router.push(`/properties/${p.id}`);
      return;
    }
    if (!pinned) {
      const ok = await dialog.confirm({
        title: `Pin ${p.name} on the map?`,
        message:
          'It takes a few seconds — then you can navigate there, share it, and see the weather at the site.',
        confirmLabel: 'Pin it now',
      });
      if (ok) pin();
      return;
    }
    const lat = p.latitude as number;
    const lng = p.longitude as number;
    const choice = await dialog.actions({
      title: p.name,
      actions: [
        { label: 'Directions', value: 'go' as const, icon: 'directions' as const },
        { label: 'Share the location', value: 'share' as const, icon: 'share' as const },
        approximate
          ? { label: 'Set the exact spot', value: 'pin' as const, icon: 'pin' as const }
          : { label: 'Adjust the pin', value: 'pin' as const, icon: 'pin' as const },
      ],
    });
    if (choice === 'go') await openDirections(p.name, lat, lng);
    else if (choice === 'share') shareLocation(p.name, lat, lng);
    else if (choice === 'pin') pin();
  };

  const lg = size === 'lg';
  const dim = lg ? 36 : 32;
  return (
    <Pressable
      onPress={() => void onPress()}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={
        issue ? 'Location needs fixing' : pinned ? 'Location options' : 'Pin the location'
      }
      style={({ pressed }) => [
        styles.round,
        { width: dim, height: dim, borderRadius: dim / 2 },
        issue ? styles.roundIssue : !pinned || approximate ? styles.roundPending : null,
        pressed && styles.pressed,
      ]}
    >
      <Icon
        name={issue ? 'warning' : 'pin'}
        size={lg ? 19 : 17}
        color="#FFFFFF"
        strokeWidth={2.4}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  media: { backgroundColor: '#1F2340', overflow: 'hidden' },
  placeholder: { alignItems: 'flex-end', justifyContent: 'center', paddingRight: space.xl },
  overlay: { ...StyleSheet.absoluteFill, justifyContent: 'space-between' },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: space.md,
  },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.32)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipLg: { paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: font(14), fontWeight: '700', color: '#FFFFFF' },
  chipTextLg: { fontSize: font(15) },
  round: {
    backgroundColor: 'rgba(0,0,0,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundPending: { backgroundColor: accents.teal.fg },
  roundIssue: { backgroundColor: accents.amber.fg },
  pressed: { opacity: 0.75 },
  bottom: { gap: space.xs },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotOn: { backgroundColor: '#FFFFFF' },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.md,
    padding: space.md,
    paddingTop: 0,
  },
  name: { fontSize: font(21), fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },
  nameLg: { fontSize: font(25) },
  location: { fontSize: font(14), color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  locationLg: { fontSize: font(15) },
});
