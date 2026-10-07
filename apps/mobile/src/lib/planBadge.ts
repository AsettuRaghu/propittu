import type { PlanStatus } from '@propittu/shared';
import type { Tone } from '@/components/ui';

/**
 * One badge for "where does my plan stand": Trial in orange, a paid plan in
 * green, no active plan (or a suspended account) Locked in red. Pass a
 * `planName` to show it on the paid badge (Profile); without it the badge
 * says "Active" (Plan & Usage, where the name is already the title).
 */
export function planBadge(p: {
  status: PlanStatus;
  planName?: string | null;
  accountActive?: boolean;
}): { label: string; tone: Tone } {
  if (p.accountActive === false || p.status === 'expired')
    return { label: 'Locked', tone: 'danger' };
  if (p.status === 'trialing') return { label: 'Trial', tone: 'warning' };
  return { label: p.planName ?? 'Active', tone: 'success' };
}
