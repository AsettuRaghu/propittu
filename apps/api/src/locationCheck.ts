import type { SupabaseClient } from '@supabase/supabase-js';
import type { LocationIssue } from '@propittu/shared';
import { describe, findPlace, pinMismatch, pincodeArea, placeAt, type Place } from './geo.js';
import { logger } from './logger.js';
import {
  checkRecord,
  deedKey,
  distanceKm,
  type DeedPlace,
  type Located,
} from './locationRecord.js';
import { serviceClient } from './supabase.js';

/**
 * Keeping the map pin honest: it must agree with the PIN code typed in and
 * with the place the sale deed names. The last check is stored on the
 * property (location_check) so pages never wait on the place lookup; it is
 * redone whenever the pin, the PIN code or the deed's reading has changed.
 * An issue stays until the customer resolves it — moving the pin or fixing
 * the PIN code. Saying "the pin is right" against the deed turns the alert
 * into a quiet, lasting gap (the deed is the most reliable source we have).
 */

/** How far a pin may be from the deed's village (or, failing that, its taluk). */
const DEED_RADIUS_KM = [20, 35];

/** The pin vs the PIN code, then vs the deed's place; null when they agree or we can't tell. */
export async function findIssue(
  p: Located,
  deed: DeedPlace | null = null,
  pinConfirmed = false,
): Promise<LocationIssue | null> {
  if (p.latitude === null || p.longitude === null) return null;
  if (p.pincode) {
    const m = await pinMismatch(p.latitude, p.longitude, p.pincode);
    if (m) {
      return {
        kind: 'pincode',
        pin_place: describe(m.pin),
        other_place: m.area.label,
        pincode: p.pincode,
        distance_km: m.distance_km,
        near: { latitude: m.area.latitude, longitude: m.area.longitude },
        confirmed: false,
      };
    }
  }
  if (!deed) return null;
  const named = await findPlace([deed.village, deed.hobli, deed.taluk, deed.district, deed.state]);
  // Only a village- or taluk-level match is precise enough to judge a pin by.
  const radius = named ? DEED_RADIUS_KM[named.dropped] : undefined;
  if (!named || radius === undefined) return null;
  const km = distanceKm([p.latitude, p.longitude], [named.latitude, named.longitude]);
  if (km <= radius) return null;
  const pin = await placeAt(p.latitude, p.longitude);
  return {
    kind: 'deed',
    pin_place: describe(pin),
    other_place: [deed.village, deed.taluk].filter(Boolean).join(', ') || named.label,
    pincode: null,
    distance_km: Math.round(km),
    near: { latitude: named.latitude, longitude: named.longitude },
    // "The pin is right": no longer an alert, but still a gap from the deed.
    confirmed: pinConfirmed,
  };
}

const DEED_KEYS = ['village', 'hobli', 'taluk_or_mandal', 'district', 'state'] as const;

/** The deed's place for each property (from Pittu's facts; the customer's edits win). */
export async function loadDeedPlaces(
  db: SupabaseClient,
  propertyIds: string[],
): Promise<Map<string, DeedPlace>> {
  const out = new Map<string, DeedPlace>();
  if (propertyIds.length === 0) return out;
  const { data } = await db
    .from('property_facts')
    .select('property_id, key, value, final_value, status, created_at')
    .in('property_id', propertyIds)
    .in('key', DEED_KEYS)
    .not('status', 'in', '(rejected,superseded)')
    .order('created_at', { ascending: true });
  for (const f of (data ?? []) as {
    property_id: string;
    key: (typeof DEED_KEYS)[number];
    value: unknown;
    final_value: unknown;
    status: string;
  }[]) {
    const v = f.status === 'edited' ? f.final_value : f.value;
    if (typeof v !== 'string' || !v.trim()) continue;
    const d = out.get(f.property_id) ?? {
      village: null,
      hobli: null,
      taluk: null,
      district: null,
      state: null,
    };
    const field = f.key === 'taluk_or_mandal' ? 'taluk' : f.key;
    d[field] = v.trim();
    out.set(f.property_id, d);
  }
  return out;
}

/** Recheck and store (server key: location_check is the server's record). */
export async function refreshLocationCheck(
  id: string,
  p: Located,
  deed: DeedPlace | null,
  confirmed: boolean,
): Promise<void> {
  if (!serviceClient || p.latitude === null || p.longitude === null) return;
  try {
    const issue = await findIssue(p, deed, confirmed);
    await serviceClient
      .from('properties')
      .update({ location_check: checkRecord(p, issue, deedKey(deed), confirmed) })
      .eq('id', id);
  } catch (err) {
    logger.warn({ err: String(err) }, 'location check failed');
  }
}

/** The address at a pin — used when the customer says "the pin is right". */
export const addressAt = (lat: number, lon: number): Promise<Place | null> => placeAt(lat, lon);

/**
 * Roughly where a deed's property is: its village / taluk / district (or
 * its PIN code). Never the exact plot — the customer confirms the spot.
 */
export async function placeFromDeed(parts: {
  village?: string | null;
  hobli?: string | null;
  taluk?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}): Promise<(Place & { pincode: string | null }) | null> {
  const named = await findPlace([
    parts.village,
    parts.hobli,
    parts.taluk,
    parts.district ?? parts.city,
    parts.state,
  ]);
  const place = named ?? (parts.pincode ? await pincodeArea(parts.pincode) : null);
  if (!place) return null;
  if (place.pincode) return place;
  // Searches by name rarely carry a PIN code; the point's own address does.
  const at = await placeAt(place.latitude, place.longitude);
  return { ...place, pincode: at?.pincode ?? null, city: place.city ?? at?.city ?? null };
}

/** Gives up after `ms` (the lookup may be slow; nothing should wait long on it). */
export function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}
