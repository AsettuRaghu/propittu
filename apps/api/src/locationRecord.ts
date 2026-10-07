import type { LocationIssue } from '@propittu/shared';

/**
 * The stored pin-vs-PIN-code check (properties.location_check), and the
 * distance maths — pure, so they are unit-tested without the network.
 */

export interface Located {
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
}
interface StoredCheck {
  pincode: string;
  latitude: number;
  longitude: number;
  issue: LocationIssue | null;
}

const same = (c: StoredCheck, p: Located) =>
  c.pincode === p.pincode && c.latitude === p.latitude && c.longitude === p.longitude;

/** The stored issue, if still about the current pin and PIN code; `stale` when it needs redoing. */
export function storedIssue(
  check: unknown,
  p: Located,
): { issue: LocationIssue | null; stale: boolean } {
  if (p.latitude === null || p.longitude === null || !p.pincode)
    return { issue: null, stale: false };
  const c = check as StoredCheck | null;
  if (!c || !same(c, p)) return { issue: null, stale: true };
  return { issue: c.issue, stale: false };
}

/** What to store with a just-checked pin, so the next page load needn't check again. */
export const checkRecord = (p: Located, issue: LocationIssue | null) =>
  p.latitude !== null && p.longitude !== null && p.pincode
    ? { pincode: p.pincode, latitude: p.latitude, longitude: p.longitude, issue }
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
