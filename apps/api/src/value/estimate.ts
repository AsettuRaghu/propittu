import type { SupabaseClient } from '@supabase/supabase-js';
import type { AreaBasis, MarketComparable, MarketEstimate } from '@propittu/shared';
import { auditPittu } from '../audit.js';
import { logger } from '../logger.js';
import { aiAvailableFor, server } from '../pittu/core/limits.js';
import { runTask } from '../pittu/core/run.js';
import { marketTask } from '../pittu/value/tasks/market.js';
import { deedFactValues, factNumber, factText } from '../deeds/facts.js';
import { projectOf } from '../legal/projectDisputes.js';
import { must } from '../errors.js';
import { marketRange } from './range.js';
import { propertyValue } from './value.js';

/** Pittu Value — working out the market range in the background (rules: ./range.ts). */

const REFRESH_DAYS = 90;

const KIND_WORDS: Record<string, string> = {
  apartment: 'apartment / flat',
  land: 'residential plot / site',
  independent_house: 'independent house',
  commercial: 'commercial property',
  industrial: 'industrial property',
  other: 'property',
};

/** Works out (or refreshes) the property's market range. Never throws. */
export async function estimateMarket(propertyId: string): Promise<void> {
  const db = server();
  try {
    const p = must<{
      account_id: string;
      property_type: string;
      city: string | null;
      state: string | null;
      pincode: string | null;
      address_line: string | null;
    } | null>(
      await db
        .from('properties')
        .select('account_id, property_type, city, state, pincode, address_line')
        .eq('id', propertyId)
        .maybeSingle(),
    );
    if (!p || !aiAvailableFor(p.account_id)) return;
    const [value, { values }] = await Promise.all([
      propertyValue(db, propertyId),
      deedFactValues(db, propertyId),
    ]);
    const text = (k: string) => factText(values.get(k));
    const where = [
      text('project_name'),
      text('village'),
      p.address_line,
      p.city ?? text('city'),
      p.state,
      p.pincode,
    ]
      .filter(Boolean)
      .join(', ');
    if (!where) return;
    await db.from('value_estimates').upsert({
      property_id: propertyId,
      account_id: p.account_id,
      status: 'working',
    });
    const brief = [
      `Property: ${KIND_WORDS[p.property_type] ?? 'property'}`,
      `Where: ${where}`,
      text('developer') ? `Developer: ${text('developer')}` : null,
      value.area_sqft ? `Area: about ${Math.round(value.area_sqft)} sq ft` : null,
      text('floor') ? `Floor: ${text('floor')}` : null,
      p.property_type === 'land'
        ? 'Find what similar plots sell or are listed for now.'
        : 'Find what similar homes sell or are listed for now, and what they rent for.',
    ]
      .filter(Boolean)
      .join('\n');
    const { result, model, sources } = await runTask(
      db,
      marketTask,
      { documents: [], text: brief },
      { capability: 'value', accountId: p.account_id },
    );
    // Keep every price found, so the range can be worked out again for free.
    await db.from('value_estimates').upsert({
      property_id: propertyId,
      account_id: p.account_id,
      status: 'working',
      raw_comparables: result.comparables,
      sources,
      note: result.note,
      task_version: marketTask.version,
      model,
    });
    await rerange(propertyId);
  } catch (err) {
    logger.warn({ err, propertyId }, 'Market estimate failed');
    await db
      .from('value_estimates')
      .update({ status: 'failed' })
      .eq('property_id', propertyId)
      .then(
        () => undefined,
        () => undefined,
      );
  }
}

/** A sale an owner told us about, as one more price (it has no web page). */
function knownToComparable(k: {
  id: string;
  price_inr: number;
  area_sqft: number;
  area_basis: AreaBasis;
  sold_on: string;
}): MarketComparable {
  return {
    url: `owner-sale:${k.id}`,
    title: `${k.area_sqft.toLocaleString('en-IN')} sq ft sold for ₹${(k.price_inr / 1e7).toFixed(2)} Cr — told by an owner`,
    kind: 'sale',
    same_project: true,
    per_sqft: Math.round(k.price_inr / k.area_sqft),
    date: k.sold_on.slice(0, 7),
    area_basis: k.area_basis,
    area_sqft: k.area_sqft,
    from_owner: true,
  };
}

/**
 * Works out the range from what's stored — the prices Pittu found (no new
 * search) and sales owners in the project told us about — and saves it.
 * Run after a search, and whenever an owner adds a sale. Never throws.
 */
export async function rerange(propertyId: string): Promise<void> {
  const db = server();
  try {
    const [{ data: p }, { data: row }, value, { values }, project] = await Promise.all([
      db.from('properties').select('account_id, property_type').eq('id', propertyId).maybeSingle(),
      db
        .from('value_estimates')
        .select('raw_comparables, sources')
        .eq('property_id', propertyId)
        .maybeSingle(),
      propertyValue(db, propertyId),
      deedFactValues(db, propertyId),
      projectOf(db, propertyId),
    ]);
    if (!p) return;
    const mine = db
      .from('known_sales')
      .select('id, price_inr, area_sqft, area_basis, sold_on')
      .eq('property_id', propertyId);
    const shared = project
      ? db
          .from('known_sales')
          .select('id, price_inr, area_sqft, area_basis, sold_on')
          .eq('project_key', project.key)
          .eq('share_in_project', true)
          .neq('property_id', propertyId)
      : null;
    const [a, b] = await Promise.all([mine, shared ?? Promise.resolve({ data: [] })]);
    const known = [...(a.data ?? []), ...(b.data ?? [])].map((k) =>
      knownToComparable(k as Parameters<typeof knownToComparable>[0]),
    );
    const sba = factNumber(values.get('super_built_up_sqft'));
    const carpet = factNumber(values.get('carpet_sqft'));
    const range = marketRange({
      comparables: (row?.raw_comparables as MarketComparable[]) ?? [],
      sources: (row?.sources as string[]) ?? [],
      known,
      flat: p.property_type === 'apartment',
      carpet_ratio: sba && carpet ? sba / carpet : null,
      area_sqft: value.area_sqft,
      government_per_sqft: value.rate?.per_sqft ?? null,
    });
    await db.from('value_estimates').upsert({
      property_id: propertyId,
      account_id: p.account_id as string,
      ...range,
    });
    await auditPittu(
      db,
      p.account_id as string,
      'value.estimated',
      { type: 'property', id: propertyId },
      {
        status: range.status,
        value_low: range.value_low,
        value_high: range.value_high,
        rent_low: range.rent_low,
        rent_high: range.rent_high,
        prices_used: range.comparables.length,
        owner_sales: known.length,
      },
    );
  } catch (err) {
    logger.warn({ err: String(err), propertyId }, 'working out the market range failed');
  }
}

/** The current estimate, and whether it's due a (re)run. */
export async function currentEstimate(
  db: SupabaseClient,
  propertyId: string,
): Promise<{ estimate: MarketEstimate | null; due: boolean }> {
  const row = must<(MarketEstimate & { updated_at: string; task_version: string | null }) | null>(
    await db
      .from('value_estimates')
      .select(
        'status, per_sqft_low, per_sqft_high, value_low, value_high, rent_low, rent_high, confidence, comparables, note, updated_at, task_version',
      )
      .eq('property_id', propertyId)
      .maybeSingle(),
  );
  const age = row ? Date.now() - new Date(row.updated_at).getTime() : Infinity;
  const due =
    !row ||
    // Pittu learned something new (e.g. rents): check again once.
    (row.status !== 'working' && row.task_version !== marketTask.version) ||
    (row.status === 'working' ? age > 10 * 60_000 : age > REFRESH_DAYS * 86_400_000) ||
    (row.status === 'failed' && age > 6 * 3_600_000);
  return { estimate: row, due };
}
