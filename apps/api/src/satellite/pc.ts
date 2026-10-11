import { cloudyShare, square, type Indices } from './rules.js';

/**
 * Microsoft Planetary Computer — free Sentinel-2 L2A pictures and their
 * statistics (no key). We only ask for small areas; nothing is downloaded
 * or stored but the numbers and the picture's id.
 */
const STAC = 'https://planetarycomputer.microsoft.com/api/stac/v1/search';
const DATA = 'https://planetarycomputer.microsoft.com/api/data/v1/item';
const COLLECTION = 'sentinel-2-l2a';

interface Item {
  id: string;
  datetime: string;
}

type Box = [number, number, number, number];
const polygon = ([w, s, e, n]: Box) => ({
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ],
  },
});

async function json<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`Planetary Computer ${res.status}`);
  return (await res.json()) as T;
}

/** Fairly clear scenes over the point between two dates, newest first. */
async function scenes(lat: number, lon: number, from: Date, to: Date): Promise<Item[]> {
  const d = await json<{ features: { id: string; properties: { datetime: string } }[] }>(STAC, {
    collections: [COLLECTION],
    bbox: square(lat, lon, 20),
    datetime: `${from.toISOString()}/${to.toISOString()}`,
    query: { 'eo:cloud_cover': { lt: 40 } },
    sortby: [{ field: 'datetime', direction: 'desc' }],
    limit: 30,
  });
  return d.features.map((f) => ({ id: f.id, datetime: f.properties.datetime }));
}

async function stats(item: string, box: Box, params: string) {
  type S = { mean: number; histogram: [number[], number[]] };
  const d = await json<{ properties: { statistics: Record<string, S> } }>(
    `${DATA}/statistics?collection=${COLLECTION}&item=${encodeURIComponent(item)}&${params}`,
    polygon(box),
  );
  return d.properties.statistics;
}

/** The newest scene in the window that is clear over the area itself (≤ 10% cloud). */
export async function clearScene(
  lat: number,
  lon: number,
  from: Date,
  to: Date,
  skip: Set<string> = new Set(),
): Promise<Item | null> {
  const area = square(lat, lon, 150);
  for (const s of (await scenes(lat, lon, from, to)).filter((x) => !skip.has(x.id)).slice(0, 8)) {
    const scl = Object.values(await stats(s.id, area, 'assets=SCL&categorical=true'))[0];
    if (scl && cloudyShare(scl.histogram) <= 0.1) return s;
  }
  return null;
}

const NDVI = '(B08-B04)/(B08+B04)';
const NDBI = '(B11-B08)/(B11+B08)';

/** Greenery (NDVI) and built-up (NDBI) on the plot and the area around it. */
export async function indices(item: string, lat: number, lon: number): Promise<Indices> {
  const expr = `expression=${encodeURIComponent(`${NDVI};${NDBI}`)}&asset_as_band=true`;
  const [site, area] = await Promise.all([
    stats(item, square(lat, lon, 40), expr),
    stats(item, square(lat, lon, 150), expr),
  ]);
  const mean = (s: Record<string, { mean: number }>, i: number) => {
    const v = Object.values(s)[i]?.mean;
    return typeof v === 'number' && Number.isFinite(v) ? +v.toFixed(4) : null;
  };
  return {
    ndvi_site: mean(site, 0),
    ndbi_site: mean(site, 1),
    ndvi_area: mean(area, 0),
    ndbi_area: mean(area, 1),
  };
}

/** A true-colour picture of about 600 m around the plot (public URL, rendered on demand). */
export function pictureUrl(item: string, box: Box): string {
  return `${DATA}/bbox/${box.join(',')}/360x360.png?collection=${COLLECTION}&item=${encodeURIComponent(item)}&assets=visual&asset_bidx=visual%7C1,2,3&nodata=0`;
}
