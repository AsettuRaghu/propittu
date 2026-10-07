import { logger } from './logger.js';

/**
 * Places and PIN codes, from OpenStreetMap's Nominatim (free; data © OpenStreetMap
 * contributors, ODbL). Used to keep a property's map pin and its PIN code
 * telling the same story, and to place a new property near its deed's
 * village. Nominatim's policy: an identifying User-Agent, at most one request
 * a second, results cached — all done here. A slow or failed lookup never
 * blocks the customer: callers treat `null` as "can't tell".
 */

const BASE = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'Propittu/1.0 (propittu.com; contact@propittu.com)';
const TIMEOUT_MS = 5000;
const CACHE_MS = 7 * 24 * 3600_000;
const cache = new Map<string, { at: number; value: unknown }>();
let queue: Promise<unknown> = Promise.resolve();

interface Hit {
  lat: string;
  lon: string;
  name?: string;
  display_name?: string;
  boundingbox?: [string, string, string, string];
  address?: Record<string, string>;
}

/** One request at a time, a little over a second apart (per server instance). */
async function nominatim<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const url = `${BASE}${path}?${new URLSearchParams({ format: 'jsonv2', ...params })}`;
  const cached = cache.get(url);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value as T;
  const run = queue.then(async () => {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const value = (await res.json()) as T;
      cache.set(url, { at: Date.now(), value });
      return value;
    } catch (err) {
      logger.warn({ err: String(err), path }, 'place lookup failed');
      return null;
    } finally {
      await new Promise((r) => setTimeout(r, 1100));
    }
  });
  queue = run.catch(() => undefined);
  return run;
}

export interface Place {
  latitude: number;
  longitude: number;
  /** "Yelahanka, Bengaluru Urban" — short and recognisable. */
  label: string;
  pincode: string | null;
  city: string | null;
  state: string | null;
  /** South, north, west, east. */
  box: [number, number, number, number] | null;
}

function toPlace(h: Hit): Place {
  const a = h.address ?? {};
  // The matched place's own name, unless it is just the PIN code itself.
  const own = h.name && !/^\d+$/.test(h.name) ? h.name : null;
  const local = own ?? a.suburb ?? a.village ?? a.town ?? a.city_district ?? a.neighbourhood;
  const city = a.city ?? a.town ?? a.state_district ?? a.county ?? null;
  const label =
    [local, city].filter((x, i, all) => x && all.indexOf(x) === i).join(', ') ||
    (h.display_name ?? '').split(',').slice(0, 2).join(',').trim();
  const b = h.boundingbox?.map(Number);
  return {
    latitude: Number(h.lat),
    longitude: Number(h.lon),
    label,
    pincode: /^\d{6}$/.test(a.postcode ?? '') ? a.postcode! : null,
    city,
    state: a.state ?? null,
    box: b && b.length === 4 ? [b[0]!, b[1]!, b[2]!, b[3]!] : null,
  };
}

/** Where a PIN code is (its area's centre and outline). */
export async function pincodeArea(pincode: string): Promise<Place | null> {
  if (!/^\d{6}$/.test(pincode)) return null;
  const hits = await nominatim<Hit[]>('/search', {
    postalcode: pincode,
    countrycodes: 'in',
    addressdetails: '1',
    limit: '1',
  });
  const hit = hits?.[0];
  return hit ? { ...toPlace(hit), pincode } : null;
}

/** What is at a point: locality, PIN code, city, state. */
export async function placeAt(latitude: number, longitude: number): Promise<Place | null> {
  const hit = await nominatim<Hit & { error?: string }>('/reverse', {
    lat: latitude.toFixed(5),
    lon: longitude.toFixed(5),
    zoom: '14',
    addressdetails: '1',
  });
  return hit && !hit.error ? toPlace(hit) : null;
}

/** The best match for a list of place names, most specific first ("Bommasandra, Anekal, …"). */
export async function findPlace(parts: (string | null | undefined)[]): Promise<Place | null> {
  const names = parts.filter((p): p is string => !!p?.trim());
  // Drop the most specific name until something matches (villages are often missing).
  for (let i = 0; i < Math.min(names.length, 3); i++) {
    const q = names.slice(i).join(', ');
    if (!q) break;
    const hits = await nominatim<Hit[]>('/search', {
      q,
      countrycodes: 'in',
      addressdetails: '1',
      limit: '1',
    });
    if (hits === null) return null;
    if (hits[0]) return toPlace(hits[0]);
  }
  return null;
}

/** Straight-line distance in km. */
export function distanceKm(a: [number, number], b: [number, number]): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** PIN areas are irregular; allow this much beyond the area's outline. */
const MARGIN_KM = 8;

export interface PinCheck {
  /** Where the pin is, in words, and its PIN code. */
  pin: Place | null;
  /** Where the property's PIN code is. */
  area: Place;
  distance_km: number;
}

/**
 * Do the pin and the PIN code agree? Returns the mismatch (with both places
 * in words), or null when they agree — or when we can't tell.
 */
export async function pinMismatch(
  latitude: number,
  longitude: number,
  pincode: string | null,
): Promise<PinCheck | null> {
  if (!pincode) return null;
  const area = await pincodeArea(pincode);
  if (!area) return null;
  if (area.box) {
    const [s, n, w, e] = area.box;
    const m = MARGIN_KM / 111;
    if (latitude >= s - m && latitude <= n + m && longitude >= w - m && longitude <= e + m) {
      return null;
    }
  }
  const km = distanceKm([latitude, longitude], [area.latitude, area.longitude]);
  if (km <= 15) return null;
  const pin = await placeAt(latitude, longitude);
  // The pin's own PIN code matching settles it.
  if (pin?.pincode === pincode) return null;
  return { pin, area, distance_km: Math.round(km) };
}

/** "Manikonda, Ranga Reddy (500089)" */
export const describe = (p: Place | null) =>
  p ? `${p.label}${p.pincode ? ` (${p.pincode})` : ''}` : 'somewhere else';
