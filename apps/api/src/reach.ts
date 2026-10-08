import type { SupabaseClient } from '@supabase/supabase-js';
import type { PropertyReach } from '@propittu/shared';
import { must } from './errors.js';

/**
 * What reaches each property of an account — decided in SQL by
 * property_reach() from each service's coverage (PIN codes, zones, states);
 * members and staff only.
 */
export async function loadReach(
  db: SupabaseClient,
  accountId: string,
): Promise<Map<string, PropertyReach>> {
  const rows = must<
    {
      property_id: string;
      area_name: string | null;
      reach_state: string | null;
      visits: boolean;
      paperwork: boolean;
      has_pincode: boolean;
      is_exception: boolean;
      interested: boolean;
      service_ids: string[];
    }[]
  >(await db.rpc('property_reach', { p_account: accountId }));
  return new Map(
    rows.map((r) => [
      r.property_id,
      {
        visits: r.visits,
        paperwork: r.paperwork,
        area_name: r.area_name,
        state: r.reach_state,
        has_pincode: r.has_pincode,
        exception: r.is_exception,
        interested: r.interested,
        service_ids: r.service_ids,
      },
    ]),
  );
}
