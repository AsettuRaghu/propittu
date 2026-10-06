import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { PROPERTY_TYPE_LABELS, requestStatusLabel, type PropertySummary } from '@propittu/shared';
import { formatDate, formatLocation } from '@/lib/format';
import { PROPERTY_TYPE_GRADIENTS, PROPERTY_TYPE_ICONS, STATUS_ICONS } from '@/lib/icons';
import { goToCompletionStep } from '@/lib/propertySteps';
import { signedImage } from '@/lib/image';
import { accents, colors, radius, shadow, space, typography } from '@/theme';
import { Icon, type IconName } from './Icon';
import { ProgressBar } from './ui';

/**
 * Home tile (§15): a property snapshot — picture, name, type, place, what's
 * there (docs / photos / requests) and the one thing that needs attention:
 * an open service request, or the next profile step.
 */
export function PropertyCard({
  property: p,
  onPress,
}: {
  property: PropertySummary;
  onPress: () => void;
}) {
  const location = formatLocation(p);
  const type = PROPERTY_TYPE_LABELS[p.property_type].split(' / ')[0];
  const r = p.active_request;
  const complete = p.completion_percent >= 100;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={p.name}
      style={({ pressed }) => [styles.card, shadow, pressed && styles.pressed]}
    >
      <View style={styles.media}>
        {p.cover_photo_url ? (
          <Image
            source={signedImage(p.cover_photo_url)}
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
              size={44}
              color="rgba(255,255,255,0.35)"
              strokeWidth={1.5}
            />
          </LinearGradient>
        )}
        <View style={styles.typeChip}>
          <Icon name={PROPERTY_TYPE_ICONS[p.property_type]} size={12} color={colors.text} />
          <Text style={styles.typeText}>{type}</Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <View style={styles.flex}>
            <Text style={typography.heading} numberOfLines={1}>
              {p.name}
            </Text>
            {location ? (
              <View style={styles.locationRow}>
                <Icon name="pin" size={12} color={colors.textMuted} />
                <Text style={typography.caption} numberOfLines={1}>
                  {location}
                </Text>
              </View>
            ) : null}
          </View>
          <Icon name="chevron" size={18} color={colors.textSubtle} />
        </View>

        {r ? (
          <Attention
            icon={STATUS_ICONS[r.status]}
            accent="teal"
            text={`${r.service_name} · ${requestStatusLabel(r.status, r.fulfilment)}${
              r.scheduled_for ? ` ${formatDate(r.scheduled_for)}` : ''
            }`}
            onPress={() => router.push(`/requests/${r.id}`)}
          />
        ) : null}
        {!complete ? (
          <View style={styles.progressRow}>
            <Text style={styles.progressLabel}>
              Profile <Text style={styles.progressPct}>{p.completion_percent}%</Text>
            </Text>
            <View style={styles.flex}>
              <ProgressBar
                progress={p.completion_percent / 100}
                height={4}
                color={colors.primary}
                track={colors.primarySoft}
              />
            </View>
          </View>
        ) : null}
        {!r && p.next_step ? (
          <Attention
            icon="add"
            accent="amber"
            text={p.next_step.label}
            onPress={() => p.next_step && goToCompletionStep(p.id, p.next_step.key)}
          />
        ) : null}

        <View style={styles.stats}>
          <Stat icon="document" value={p.document_count} label="Docs" />
          <Stat icon="image" value={p.photo_count} label="Photos" />
          <Stat icon="requests" value={p.service_request_count} label="Requests" />
          {complete ? (
            <View style={styles.complete}>
              <Icon name="verified" size={13} color={accents.teal.fg} />
              <Text style={styles.completeText}>Complete</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/** One tappable "needs attention" line inside the tile. */
function Attention({
  icon,
  accent,
  text,
  onPress,
}: {
  icon: IconName;
  accent: 'teal' | 'amber';
  text: string;
  onPress: () => void;
}) {
  const a = accents[accent];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.attention,
        { backgroundColor: a.bg },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Icon name={icon} size={13} color={a.fg} strokeWidth={2.5} />
      <Text style={[styles.attentionText, { color: a.fg }]} numberOfLines={1}>
        {text}
      </Text>
      <Icon name="chevron" size={14} color={a.fg} />
    </Pressable>
  );
}

function Stat({ icon, value, label }: { icon: IconName; value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Icon name={icon} size={13} color={colors.textMuted} />
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
        <View style={[styles.boneLine, { width: '55%', height: 14 }]} />
        <View style={[styles.boneLine, { width: '35%' }]} />
        <View style={[styles.boneLine, { width: '80%', marginTop: 6 }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  pressed: { opacity: 0.94, transform: [{ scale: 0.995 }] },
  media: { height: 112, backgroundColor: colors.surfaceMuted },
  placeholder: { alignItems: 'flex-end', justifyContent: 'center', paddingRight: space.lg },
  typeChip: {
    position: 'absolute',
    top: space.sm,
    left: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  typeText: { fontSize: 11, fontWeight: '700', color: colors.text },
  body: { paddingHorizontal: space.md, paddingTop: 10, paddingBottom: space.md, gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  progressLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  progressPct: { fontWeight: '800', color: colors.primary },
  attention: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  attentionText: { flex: 1, fontSize: 12.5, fontWeight: '700' },
  stats: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statValue: { fontSize: 13, fontWeight: '800', color: colors.text },
  complete: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto' },
  completeText: { fontSize: 12, fontWeight: '700', color: accents.teal.fg },
  bone: { backgroundColor: colors.surfaceMuted },
  boneLine: { height: 10, borderRadius: 5, backgroundColor: colors.surfaceMuted },
});
