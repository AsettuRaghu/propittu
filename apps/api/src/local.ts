import type { SupabaseClient } from '@supabase/supabase-js';
import type { LocalPlace } from '@propittu/shared';
import { distanceKm } from './locationRecord.js';
import { logger } from './logger.js';

/**
 * Nearby offices for "Something's wrong": police, fire station, hospital,
 * the local body and the Sub-Registrar — looked up once per property from
 * OpenStreetMap's search (Nominatim; one request a second, as its usage
 * policy asks) and kept for 90 days.
 */
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const UA = 'Propittu/1.0 (property care; contact@propittu.com)';
const REFRESH = 90 * 86_400_000;
const QUERIES: { kind: LocalPlace['kind']; q: string; take: number }[] = [
  { kind: 'police', q: 'police station', take: 2 },
  { kind: 'fire', q: 'fire station', take: 1 },
  { kind: 'hospital', q: 'hospital', take: 2 },
  { kind: 'local_body', q: 'municipal office', take: 1 },
  { kind: 'sub_registrar', q: 'sub registrar office', take: 1 },
];
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function search(q: string, lat: number, lon: number, km: number) {
  const d = km / 111;
  const params = new URLSearchParams({
    q,
    format: 'jsonv2',
    viewbox: `${lon - d},${lat + d},${lon + d},${lat - d}`,
    bounded: '1',
    limit: '5',
    extratags: '1',
  });
  const res = await fetch(`${NOMINATIM}?${params}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  return (await res.json()) as {
    name?: string;
    display_name: string;
    lat: string;
    lon: string;
    extratags?: Record<string, string> | null;
  }[];
}

export async function localPlaces(
  db: SupabaseClient,
  p: { id: string; account_id: string; latitude: number; longitude: number },
): Promise<LocalPlace[]> {
  const { data: cached } = await db
    .from('property_local_contacts')
    .select('places, fetched_at')
    .eq('property_id', p.id)
    .maybeSingle();
  if (cached && Date.now() - Date.parse(cached.fetched_at as string) < REFRESH)
    return cached.places as LocalPlace[];
  const places: LocalPlace[] = [];
  for (const { kind, q, take } of QUERIES) {
    try {
      // 5 km first, then 12 km if nothing is that close.
      let found = await search(q, p.latitude, p.longitude, 5);
      if (!found.length) {
        await pause(1100);
        found = await search(q, p.latitude, p.longitude, 12);
      }
      places.push(
        ...found
          .map((f) => ({
            kind,
            name: f.name || f.display_name.split(',')[0]!,
            lat: Number(f.lat),
            lon: Number(f.lon),
            phone: f.extratags?.phone ?? f.extratags?.['contact:phone'] ?? null,
            distance_km: +distanceKm(
              [p.latitude, p.longitude],
              [Number(f.lat), Number(f.lon)],
            ).toFixed(1),
          }))
          .sort((a, b) => a.distance_km - b.distance_km)
          .slice(0, take),
      );
    } catch (err) {
      logger.info({ err: String(err), kind }, 'local offices lookup failed');
    }
    await pause(1100);
  }
  await db.from('property_local_contacts').upsert({
    property_id: p.id,
    account_id: p.account_id,
    places,
    fetched_at: new Date().toISOString(),
  });
  return places;
}
