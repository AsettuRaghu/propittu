import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import type { PlanStatus, PlanSummary } from '@propittu/shared';
import { formatDate } from '@/lib/format';
import { space } from '@/theme';
import { EmptyState } from './States';
import { Banner, Button } from './ui';

/**
 * Limited Access (M6, strict): shown in place of property and service
 * screens when the Trial or Plan has ended. Data is kept, never deleted.
 */
export function LimitedAccessState({ status }: { status?: PlanStatus }) {
  return (
    <EmptyState
      icon="lock-closed-outline"
      title={
        status === 'expired' ? 'Your free trial or plan has ended' : 'Choose a plan to continue'
      }
      message="Your properties, documents and photos are safe. Choose a plan to continue using Propittu."
      action={
        <Button title="View plans" icon="pricetags-outline" onPress={() => router.push('/plan')} />
      }
    />
  );
}

/** Trial countdown / cancellation notice on Home. Nothing for a plain active Plan. */
export function PlanBanner({ plan }: { plan: PlanSummary }) {
  if (!plan.ends_at || plan.days_left === null) return null;
  const daysLeft = plan.days_left;

  let message: string | null = null;
  if (plan.status === 'trialing') {
    message =
      daysLeft <= 1
        ? 'Your free trial ends today. Choose a plan to keep using Propittu.'
        : `Free trial · ${daysLeft} days left. Tap to see plans.`;
  } else if (plan.status === 'cancelling') {
    message = `Your ${plan.plan_name ?? ''} plan ends on ${formatDate(plan.ends_at)}.`;
  } else if (daysLeft <= 7) {
    message = `Your ${plan.plan_name ?? ''} plan renews or ends in ${daysLeft} days.`;
  }
  if (!message) return null;

  return (
    <Pressable
      onPress={() => router.push('/plan')}
      accessibilityRole="button"
      style={styles.banner}
    >
      <Banner
        message={message}
        tone={plan.status === 'trialing' && daysLeft > 7 ? 'info' : 'warning'}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: { marginTop: space.sm },
});
