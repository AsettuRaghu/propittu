import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PlanStatus, PlanSummary } from '@propittu/shared';
import { formatDate } from '@/lib/format';
import { accents, colors, gradients, radius, shadow, space, typography } from '@/theme';
import { Icon } from './Icon';
import { EmptyState } from './States';
import { Button, GradientCard, ProgressRing } from './ui';

/**
 * Limited Access (M6, strict): shown in place of property and service
 * screens when the Trial or Plan has ended. Data is kept, never deleted.
 */
export function LimitedAccessState({ status }: { status?: PlanStatus }) {
  return (
    <EmptyState
      icon="lock"
      accent="violet"
      title={status === 'expired' ? 'Your plan has ended' : 'Choose a plan to continue'}
      message="Your properties, documents and photos are safe. Pick a plan to pick up right where you left off."
      action={<Button title="See plans" icon="plan" onPress={() => router.push('/plan')} />}
    />
  );
}

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
  if (!urgent) {
    return (
      <GradientCard
        colors={gradients.trial}
        onPress={() => router.push('/plan')}
        style={styles.hero}
      >
        <ProgressRing
          progress={days / 30}
          size={46}
          stroke={5}
          color="#FFFFFF"
          track="rgba(255,255,255,0.25)"
        >
          <Text style={styles.ringText}>{days}</Text>
        </ProgressRing>
        <View style={styles.flex}>
          <Text style={styles.heroTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.heroSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <View style={styles.heroCta}>
          <Text style={styles.heroCtaText}>{cta}</Text>
          <Icon name="chevron" size={14} color={accents.teal.fg} strokeWidth={2.5} />
        </View>
      </GradientCard>
    );
  }

  return (
    <Pressable
      onPress={() => router.push('/plan')}
      accessibilityRole="button"
      style={({ pressed }) => [styles.warn, shadow, pressed && { opacity: 0.88 }]}
    >
      <View style={styles.warnIcon}>
        <Icon name="hourglass" size={20} color={colors.warning} />
      </View>
      <View style={styles.flex}>
        <Text style={typography.bodyStrong} numberOfLines={1}>
          {title}
        </Text>
        <Text style={typography.small} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <View style={styles.warnCta}>
        <Text style={styles.warnCtaText}>{cta}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  ringText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  heroTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  heroSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  heroCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 7,
  },
  heroCtaText: { color: accents.teal.fg, fontSize: 13, fontWeight: '800' },
  warn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.md,
  },
  warnIcon: {
    width: 40,
    height: 40,
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
  warnCtaText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});
