import { must } from '../errors.js';
import { serviceClient } from '../supabase.js';

/**
 * When the team last approved Pittu Watch news for each PIN code (for the
 * marker on Home cards). Places are staff-only, so this uses the server key;
 * callers pass only their own properties' PIN codes.
 */
export async function latestNewsByPincode(pincodes: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const pins = [...new Set(pincodes)];
  if (!pins.length || !serviceClient) return out;
  const places = must<{ id: string; pincodes: string[] }[]>(
    await serviceClient
      .from('watch_places')
      .select('id, pincodes')
      .eq('is_active', true)
      .overlaps('pincodes', pins),
  );
  if (!places.length) return out;
  const items = must<{ place_id: string; reviewed_at: string | null }[]>(
    await serviceClient
      .from('watch_items')
      .select('place_id, reviewed_at')
      .in(
        'place_id',
        places.map((p) => p.id),
      )
      .eq('review', 'approved')
      .order('reviewed_at', { ascending: false, nullsFirst: false })
      .limit(500),
  );
  const latest = new Map<string, string>();
  for (const i of items) {
    if (i.reviewed_at && !latest.has(i.place_id)) latest.set(i.place_id, i.reviewed_at);
  }
  for (const p of places) {
    const at = latest.get(p.id);
    if (!at) continue;
    for (const pin of p.pincodes) {
      if (!pins.includes(pin)) continue;
      const seen = out.get(pin);
      if (!seen || at > seen) out.set(pin, at);
    }
  }
  return out;
}
