import type { LocationIssue } from '@propittu/shared';

/**
 * The stored location check (pin vs PIN code and deed; properties.location_check), and the
 * distance maths — pure, so they are unit-tested without the network.
 */

export interface Located {
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** Where the sale deed says the property is, as Pittu read it. */
export interface DeedPlace {
  village: string | null;
  hobli: string | null;
  taluk: string | null;
  district: string | null;
  state: string | null;
}

/** A short fingerprint of the deed's place, so a changed reading triggers a recheck. */
export const deedKey = (d: DeedPlace | null) =>
  d ? [d.village, d.hobli, d.taluk, d.district, d.state].map((x) => x ?? '').join('|') : '';

interface StoredCheck {
  pincode: string | null;
  latitude: number;
  longitude: number;
  deed: string;
  /** The customer said "the pin is right" for this pin, despite the deed. */
  confirmed: boolean;
  issue: LocationIssue | null;
}

const same = (c: StoredCheck, p: Located, deed: string) =>
  (c.pincode ?? null) === p.pincode &&
  c.latitude === p.latitude &&
  c.longitude === p.longitude &&
  (c.deed ?? '') === deed;

/**
 * The stored issue, if the check is still about the current pin, PIN code
 * and deed; `stale` when it needs redoing. `confirmed` carries over while
 * the pin and the deed stay the same.
 */
export function storedIssue(
  check: unknown,
  p: Located,
  deed = '',
): { issue: LocationIssue | null; stale: boolean; confirmed: boolean } {
  const c = check as StoredCheck | null;
  const confirmed =
    !!c?.confirmed && c.latitude === p.latitude && c.longitude === p.longitude && c.deed === deed;
  if (p.latitude === null || p.longitude === null || (!p.pincode && !deed))
    return { issue: null, stale: false, confirmed };
  if (!c || !same(c, p, deed)) return { issue: null, stale: true, confirmed };
  return { issue: c.issue, stale: false, confirmed };
}

/** What to store with a just-checked pin, so the next page load needn't check again. */
export const checkRecord = (
  p: Located,
  issue: LocationIssue | null,
  deed = '',
  confirmed = false,
) =>
  p.latitude !== null && p.longitude !== null
    ? {
        pincode: p.pincode,
        latitude: p.latitude,
        longitude: p.longitude,
        deed,
        confirmed,
        issue,
      }
    : null;

/** Straight-line distance in km. */
export function distanceKm(a: [number, number], b: [number, number]): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
