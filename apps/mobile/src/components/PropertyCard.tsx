import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { requestStatusLabel, type PropertySummary } from '@propittu/shared';
import { formatDate } from '@/lib/format';
import { STATUS_ICONS } from '@/lib/icons';
import { goToCompletionStep } from '@/lib/propertySteps';
import { colors, font, radius, shadow, space, typography } from '@/theme';
import { Icon, type IconName } from './Icon';
import { PropertyCover } from './PropertyCover';

/**
 * Home: one property in the locker. A photo (or its type's colours) with
 * the name, place and live weather over a soft fade; below, the one thing
 * that needs attention and what's stored — documents, photos, requests.
 */
export function PropertyCard({
  property: p,
  onPress,
}: {
  property: PropertySummary;
  onPress: () => void;
}) {
  const r = p.active_request;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={p.name}
      style={({ pressed }) => [styles.card, shadow, pressed && styles.pressed]}
    >
      <PropertyCover property={p} height={176} coverUrl={p.cover_photo_url} />

      <View style={styles.body}>
        {r ? (
          <Attention
            icon={STATUS_ICONS[r.status]}
            tone={colors.primary}
            text={`${r.service_name} · ${requestStatusLabel(r.status, r.fulfilment)}${
              r.scheduled_for ? ` ${formatDate(r.scheduled_for)}` : ''
            }`}
            onPress={() => router.push(`/requests/${r.id}`)}
          />
        ) : p.next_step ? (
          <Attention
            icon="add"
            tone={colors.warning}
            text={`${p.next_step.label} · profile ${p.completion_percent}%`}
            onPress={() => p.next_step && goToCompletionStep(p.id, p.next_step.key)}
          />
        ) : null}
        <View style={styles.stats}>
          <Stat icon="document" value={p.document_count} label="Documents" />
          <Stat icon="image" value={p.photo_count} label="Photos" />
          <Stat icon="requests" value={p.service_request_count} label="Requests" />
        </View>
      </View>
    </Pressable>
  );
}

/** The one tappable "needs attention" line under the photo. */
function Attention({
  icon,
  tone,
  text,
  onPress,
}: {
  icon: IconName;
  tone: string;
  text: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={6}
      style={({ pressed }) => [styles.attention, pressed && { opacity: 0.7 }]}
    >
      <Icon name={icon} size={15} color={tone} strokeWidth={2.5} />
      <Text style={[styles.attentionText, { color: tone }]} numberOfLines={1}>
        {text}
      </Text>
      <Icon name="chevron" size={15} color={tone} />
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
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  pressed: { opacity: 0.94, transform: [{ scale: 0.995 }] },
  media: { height: 176, backgroundColor: colors.surfaceMuted },
  body: { paddingHorizontal: space.md, paddingVertical: space.md, gap: space.md },
  attention: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  attentionText: { flex: 1, fontSize: font(14), fontWeight: '700' },
  stats: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statValue: { fontSize: font(14), fontWeight: '800', color: colors.text },
  bone: { backgroundColor: colors.surfaceMuted },
  boneLine: { height: 10, borderRadius: 5, backgroundColor: colors.surfaceMuted },
});
