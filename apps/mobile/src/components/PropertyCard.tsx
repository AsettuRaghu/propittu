import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { requestStatusLabel, type PropertySummary } from '@propittu/shared';
import { openServicesTab } from '@/lib/nav';
import { goToCompletionStep } from '@/lib/propertySteps';
import { accents, colors, font, radius, shadow, space } from '@/theme';
import { Icon, type IconName } from './Icon';
import { PropertyCover } from './PropertyCover';

/**
 * Home: one property in the locker. Its photos (swipe through them) or its
 * type's colours, with the name, place, live weather and location on top;
 * below, what's stored and what's moving as icons you can tap — documents,
 * photos, requests (a live dot while one is in progress) and how complete
 * the profile is.
 */
export function PropertyCard({
  property: p,
  onPress,
}: {
  property: PropertySummary;
  onPress: () => void;
}) {
  const r = p.active_request;
  const photos = p.photo_urls.length ? p.photo_urls : p.cover_photo_url ? [p.cover_photo_url] : [];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={p.name}
      style={({ pressed }) => [styles.card, shadow, pressed && styles.pressed]}
    >
      <PropertyCover
        property={p}
        height={186}
        photos={photos}
        approximate={p.location_approximate}
      />

      <View style={styles.icons}>
        <IconStat
          icon="document"
          count={p.document_count}
          label="Documents"
          onPress={() => router.push(`/properties/${p.id}/documents`)}
        />
        <IconStat icon="image" count={p.photo_count} label="Photos" onPress={onPress} />
        <IconStat
          icon="requests"
          count={p.service_request_count}
          label={
            r ? `${r.service_name}, ${requestStatusLabel(r.status, r.fulfilment)}` : 'Requests'
          }
          live={!!r}
          onPress={() => (r ? router.push(`/requests/${r.id}`) : openServicesTab('requests'))}
        />
        <View style={styles.flex} />
        {p.next_step ? (
          <Pressable
            onPress={() => p.next_step && goToCompletionStep(p.id, p.next_step.key)}
            accessibilityRole="button"
            accessibilityLabel={`Profile ${p.completion_percent}% complete. Next: ${p.next_step.label}`}
            hitSlop={6}
            style={({ pressed }) => [styles.profile, pressed && styles.tilePressed]}
          >
            <Text style={styles.profileText}>{p.completion_percent}%</Text>
          </Pressable>
        ) : (
          <View style={[styles.profile, styles.profileDone]} accessibilityLabel="Profile complete">
            <Icon name="verified" size={22} color={accents.teal.fg} />
          </View>
        )}
      </View>
    </Pressable>
  );
}

/** An icon with its count as a badge; `live` adds a gently pulsing dot. */
function IconStat({
  icon,
  count,
  label,
  live = false,
  onPress,
}: {
  icon: IconName;
  count: number;
  label: string;
  live?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${count}`}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
    >
      <Icon name={icon} size={22} color={count ? colors.text : colors.textSubtle} />
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
      {live ? <LiveDot /> : null}
    </Pressable>
  );
}

function LiveDot() {
  const [pulse] = useState(() => new Animated.Value(0.4));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={[styles.live, { opacity: pulse }]} />;
}

/** Placeholder tile while Home loads — same shape, gently pulsing. */
export function PropertyCardSkeleton() {
  const [pulse] = useState(() => new Animated.Value(0.55));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View style={[styles.card, shadow, { opacity: pulse }]} accessibilityLabel="Loading">
      <View style={[styles.media, styles.bone]} />
      <View style={styles.body}>
        <View style={[styles.boneLine, { width: '70%' }]} />
        <View style={[styles.boneLine, { width: '45%' }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  pressed: { opacity: 0.94, transform: [{ scale: 0.995 }] },
  media: { height: 186, backgroundColor: colors.surfaceMuted },
  body: { paddingHorizontal: space.md, paddingVertical: space.md, gap: space.md },
  icons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  tile: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tilePressed: { opacity: 0.7 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: font(10.5), fontWeight: '800', color: '#FFFFFF' },
  live: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: accents.teal.fg,
  },
  profile: {
    height: 46,
    minWidth: 46,
    paddingHorizontal: space.sm,
    borderRadius: 15,
    backgroundColor: accents.amber.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileDone: { backgroundColor: accents.teal.bg },
  profileText: { fontSize: font(15), fontWeight: '800', color: accents.amber.fg },
  bone: { backgroundColor: colors.surfaceMuted },
  boneLine: { height: 10, borderRadius: 5, backgroundColor: colors.surfaceMuted },
});
