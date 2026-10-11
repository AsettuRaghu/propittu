import type { SupabaseClient } from '@supabase/supabase-js';
import { auditPittu } from '../audit.js';
import { logger } from '../logger.js';
import { notify } from '../notify.js';
import { clearScene, indices } from './pc.js';
import { changeBetween, square, type Indices } from './rules.js';

/**
 * Plot satellite watch (optional module, app_modules.satellite_watch). For
 * plots with a confirmed pin: every month, the newest clear picture is
 * compared with the last one; a real change tells the owner. The first run
 * also looks a year back, so there's something to compare with at once.
 */

const MONTH = 30 * 86_400_000;

export async function moduleOn(db: SupabaseClient, key: string): Promise<boolean> {
  const { data } = await db.from('app_modules').select('enabled').eq('key', key).maybeSingle();
  return !!data?.enabled;
}

/** Plots this module watches: land with a pin the owner confirmed. */
const watchable = (p: {
  property_type: string;
  latitude: number | null;
  location_source: string | null;
}) => p.property_type === 'land' && p.latitude !== null && p.location_source === 'user';

async function record(
  db: SupabaseClient,
  p: { id: string; account_id: string; latitude: number; longitude: number },
  scene: { id: string; datetime: string },
  previous: Indices | null,
) {
  const now = await indices(scene.id, p.latitude, p.longitude);
  const change = changeBetween(previous, now);
  await db.from('satellite_observations').upsert(
    {
      property_id: p.id,
      account_id: p.account_id,
      item_id: scene.id,
      captured_at: scene.datetime,
      ...now,
      change,
      bbox: square(p.latitude, p.longitude, 300),
    },
    { onConflict: 'property_id,item_id' },
  );
  return { change, now };
}

/** Looks at one plot now. Returns what it found; never throws. */
export async function observeProperty(db: SupabaseClient, propertyId: string): Promise<string> {
  try {
    const { data: p } = await db
      .from('properties')
      .select('id, account_id, property_type, latitude, longitude, location_source')
      .eq('id', propertyId)
      .maybeSingle();
    if (!p || !watchable(p) || p.longitude === null) return 'not_watchable';
    const pin = { ...p, latitude: p.latitude as number, longitude: p.longitude as number };
    const { data: seen } = await db
      .from('satellite_observations')
      .select('item_id, captured_at, ndvi_site, ndvi_area, ndbi_site, ndbi_area')
      .eq('property_id', p.id)
      .order('captured_at', { ascending: false });
    const done = new Set((seen ?? []).map((s) => s.item_id as string));
    const now = new Date();
    let previous: Indices | null = (seen?.[0] as Indices | undefined) ?? null;
    if (!previous) {
      // First look: a clear picture from about a year ago, as the baseline.
      const yearAgo = new Date(now.getTime() - 365 * 86_400_000);
      const base = await clearScene(
        pin.latitude,
        pin.longitude,
        new Date(yearAgo.getTime() - 60 * 86_400_000),
        new Date(yearAgo.getTime() + 60 * 86_400_000),
      );
      if (base) {
        previous = (await record(db, pin, base, null)).now;
        done.add(base.id);
      }
    }
    const latest = await clearScene(
      pin.latitude,
      pin.longitude,
      // The newest clear one in 9 months (monsoon months are often all cloud).
      new Date(now.getTime() - 9 * MONTH),
      now,
      done,
    );
    if (!latest) return 'no_clear_picture';
    const { change } = await record(db, pin, latest, previous);
    if (change !== 'none' && change !== 'baseline') {
      notify({ type: 'satellite.change', propertyId: p.id, change });
      await auditPittu(
        db,
        p.account_id as string,
        'satellite.change_seen',
        {
          type: 'property',
          id: p.id as string,
        },
        { change, captured_at: latest.datetime },
      );
    }
    return change;
  } catch (err) {
    logger.warn({ err: String(err), propertyId }, 'satellite watch failed');
    return 'failed';
  }
}

/** The daily run: plots not looked at for a month, a few at a time (only when switched on). */
export async function runSatellite(db: SupabaseClient, max = 6): Promise<{ looked: number }> {
  const started = Date.now();
  if (!(await moduleOn(db, 'satellite_watch'))) return { looked: 0 };
  const { data: plots } = await db
    .from('properties')
    .select('id, property_type, latitude, location_source')
    .eq('property_type', 'land')
    .eq('location_source', 'user')
    .eq('is_draft', false)
    .not('latitude', 'is', null)
    .limit(500);
  const { data: recent } = await db
    .from('satellite_observations')
    .select('property_id, created_at')
    .gte('created_at', new Date(Date.now() - MONTH).toISOString());
  const fresh = new Set((recent ?? []).map((r) => r.property_id as string));
  let looked = 0;
  for (const p of (plots ?? []).filter((x) => !fresh.has(x.id as string)).slice(0, max)) {
    // Stay well inside the function's time limit; the rest wait for tomorrow.
    if (Date.now() - started > 50_000) break;
    await observeProperty(db, p.id as string);
    looked++;
  }
  logger.info({ looked }, 'satellite: run finished');
  return { looked };
}
