import type { LocationIssue } from '@propittu/shared';
import { describe, findPlace, pinMismatch, pincodeArea, placeAt, type Place } from './geo.js';
import { logger } from './logger.js';
import type { Located } from './locationRecord.js';
import { serviceClient } from './supabase.js';

/**
 * Keeping the map pin and the PIN code honest. The last check is stored on
 * the property (location_check) so pages never wait on the place lookup;
 * it is redone whenever the pin or the PIN code has changed since.
 */

/** Pin vs PIN code, in words; null when they agree or we can't tell. */
export async function findIssue(p: Located): Promise<LocationIssue | null> {
  if (p.latitude === null || p.longitude === null || !p.pincode) return null;
  const m = await pinMismatch(p.latitude, p.longitude, p.pincode);
  return m
    ? {
        pin_place: describe(m.pin),
        pincode_place: m.area.label,
        pincode: p.pincode,
        distance_km: m.distance_km,
      }
    : null;
}

/** Recheck and store (server key: location_check is the server's record). */
export async function refreshLocationCheck(id: string, p: Located): Promise<void> {
  if (!serviceClient || p.latitude === null || p.longitude === null || !p.pincode) return;
  try {
    const issue = await findIssue(p);
    await serviceClient
      .from('properties')
      .update({
        location_check: {
          pincode: p.pincode,
          latitude: p.latitude,
          longitude: p.longitude,
          issue,
        },
      })
      .eq('id', id);
  } catch (err) {
    logger.warn({ err: String(err) }, 'location check failed');
  }
}

export const issueMessage = (i: LocationIssue) =>
  `The pin is in ${i.pin_place}, about ${i.distance_km} km from PIN code ${i.pincode} (${i.pincode_place}).`;

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
