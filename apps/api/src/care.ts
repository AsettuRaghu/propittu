import type { SupabaseClient } from '@supabase/supabase-js';
import { auditPittu } from './audit.js';
import { logger } from './logger.js';
import { notify } from './notify.js';

/**
 * Care schedule — the daily run (keep-alive cron). Each active schedule due
 * within a week: booked by itself when the plan still includes the service
 * (create_scheduled_request), else the owner gets a one-tap reminder; then
 * the next date moves on by its interval.
 */

const addMonths = (iso: string, months: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};

export async function runCareSchedules(
  db: SupabaseClient,
): Promise<{ booked: number; reminded: number }> {
  const soon = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const { data } = await db
    .from('care_schedules')
    .select('id, account_id, property_id, service_id, every_months, next_on')
    .eq('active', true)
    .lte('next_on', soon)
    .limit(200);
  let booked = 0;
  let reminded = 0;
  for (const s of (data ?? []) as {
    id: string;
    account_id: string;
    property_id: string;
    service_id: string;
    every_months: number;
    next_on: string;
  }[]) {
    try {
      const { data: requestId, error } = await db.rpc('create_scheduled_request', {
        p_schedule: s.id,
      });
      if (error) throw new Error(error.message);
      if (requestId) {
        booked++;
        notify({ type: 'care.booked', requestId: requestId as string });
      } else {
        reminded++;
        notify({ type: 'care.due', scheduleId: s.id });
      }
      // Never let the date fall behind today (e.g. after a pause).
      let next = addMonths(s.next_on, s.every_months);
      const today = new Date().toISOString().slice(0, 10);
      while (next <= today) next = addMonths(next, s.every_months);
      await db
        .from('care_schedules')
        .update({
          next_on: next,
          last_run_at: new Date().toISOString(),
          ...(requestId ? { last_request_id: requestId } : {}),
        })
        .eq('id', s.id);
      await auditPittu(
        db,
        s.account_id,
        requestId ? 'care.booked' : 'care.reminded',
        {
          type: 'property',
          id: s.property_id,
        },
        { schedule: s.id },
      );
    } catch (err) {
      logger.warn({ err: String(err), schedule: s.id }, 'care schedule run failed');
    }
  }
  return { booked, reminded };
}
