/**
 * Plot satellite watch — the rules (pure; no network). Sentinel-2 pixels
 * are 10 m, so a small city plot is a pixel or two: we compare the plot
 * (about 40 m around the pin) and the area around it (about 150 m) with the
 * last clear picture, and only call out clear changes.
 */

export type SatelliteChange = 'none' | 'baseline' | 'site_cleared' | 'site_built' | 'area_built';

export interface Indices {
  ndvi_site: number | null;
  ndvi_area: number | null;
  ndbi_site: number | null;
  ndbi_area: number | null;
}

/** Greenery falling this much on the plot = cleared; built-up rising = construction. */
const CLEARED = -0.15;
const BUILT_SITE = 0.1;
const BUILT_AREA = 0.08;

export function changeBetween(before: Indices | null, now: Indices): SatelliteChange {
  if (!before) return 'baseline';
  const d = (a: number | null, b: number | null) => (a === null || b === null ? 0 : b - a);
  if (d(before.ndbi_site, now.ndbi_site) >= BUILT_SITE) return 'site_built';
  if (d(before.ndvi_site, now.ndvi_site) <= CLEARED) return 'site_cleared';
  if (d(before.ndbi_area, now.ndbi_area) >= BUILT_AREA) return 'area_built';
  return 'none';
}

/** A square around a point, `half` metres each way: [west, south, east, north]. */
export function square(lat: number, lon: number, half: number): [number, number, number, number] {
  const dLat = half / 111_320;
  const dLon = half / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat].map((v) => +v.toFixed(6)) as [
    number,
    number,
    number,
    number,
  ];
}

/** Cloud, cloud shadow or snow in the scene classification (SCL) classes. */
const CLOUDY = new Set([3, 8, 9, 10, 11]);

/** Share of the area's pixels that are cloudy, from an SCL histogram [[counts],[classes]]. */
export function cloudyShare(histogram: [number[], number[]]): number {
  const [counts, classes] = histogram;
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return 1;
  const cloudy = counts.reduce((a, c, i) => a + (CLOUDY.has(Math.round(classes[i]!)) ? c : 0), 0);
  return cloudy / total;
}
