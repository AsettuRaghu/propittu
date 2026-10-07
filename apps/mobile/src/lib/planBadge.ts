import type { PlanStatus } from '@propittu/shared';
import type { Tone } from '@/components/ui';

/**
 * One badge for "where does my plan stand", used on Profile and Plan &
 * Usage: Trial in orange, a paid plan in green, no active plan in red.
 * An account that isn't active (suspended) is always Locked.
 */
export function planBadge(p: {
  status: PlanStatus;
  planName: string | null;
  accountActive?: boolean;
}): { label: string; tone: Tone } {
  if (p.accountActive === false || p.status === 'expired')
    return { label: 'Locked', tone: 'danger' };
  if (p.status === 'trialing') return { label: 'Trial', tone: 'warning' };
  return { label: p.planName ?? 'Active', tone: 'success' };
}
