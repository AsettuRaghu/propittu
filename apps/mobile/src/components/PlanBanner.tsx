import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PlanSummary } from '@propittu/shared';
import { formatDate } from '@/lib/format';
import { accents, colors, radius, shadow, space, typography } from '@/theme';
import { Icon } from './Icon';
import { ProgressRing } from './ui';

/**
 * Plan nudge on Home: compact, and it always says what tapping does.
 * Nothing is shown for a healthy active Plan.
 */
export function PlanBanner({ plan }: { plan: PlanSummary }) {
  if (!plan.ends_at || plan.days_left === null) return null;
  const days = plan.days_left;

  let title: string;
  let subtitle: string;
  let cta: string;
  if (plan.status === 'trialing') {
    title = days <= 1 ? 'Free trial ends today' : `Free trial · ${days} days left`;
    subtitle = 'You have Plus benefits. Choose a plan to keep them.';
    cta = 'View plans';
  } else if (plan.status === 'cancelling') {
    title = `Plan ends ${formatDate(plan.ends_at)}`;
    subtitle = 'It will not renew. Renew to keep everything.';
    cta = 'Renew';
  } else if (days <= 7) {
    title = `${plan.plan_name ?? 'Plan'} ends in ${days} day${days === 1 ? '' : 's'}`;
    subtitle = 'Renew now so nothing is interrupted.';
    cta = 'Renew';
  } else {
    return null;
  }

  const urgent = plan.status !== 'trialing' || days <= 7;
  const tint = urgent ? colors.warning : accents.teal.fg;
  const soft = urgent ? colors.warningSoft : accents.teal.bg;
  return (
    <Pressable
      onPress={() => router.push('/plan')}
      accessibilityRole="button"
      style={({ pressed }) => [styles.warn, shadow, pressed && { opacity: 0.88 }]}
    >
      {urgent ? (
        <View style={[styles.warnIcon, { backgroundColor: soft }]}>
          <Icon name="hourglass" size={18} color={tint} />
        </View>
      ) : (
        <ProgressRing progress={days / 30} size={38} stroke={4} color={tint} track={soft}>
          <Text style={[styles.ringSmall, { color: tint }]}>{days}</Text>
        </ProgressRing>
      )}
      <View style={styles.flex}>
        <Text style={typography.bodyStrong} numberOfLines={1}>
          {title}
        </Text>
        <Text style={typography.small} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <View style={[styles.warnCta, { backgroundColor: tint }]}>
        <Text style={styles.warnCtaText}>{cta}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  warn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: 10,
    paddingHorizontal: space.md,
  },
  warnIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: colors.warningSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warnCta: {
    backgroundColor: colors.warning,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 7,
  },
  ringSmall: { fontSize: 13, fontWeight: '800' },
  warnCtaText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});
