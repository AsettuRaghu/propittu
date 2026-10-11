import type { MarketComparable, MarketEstimate } from '@propittu/shared';

/**
 * Pittu Value — the market range (application layer). Pittu lists what
 * similar properties sell or are listed for (with pages); these rules decide
 * whether that is enough to show owners a lower and upper value, with no
 * team approval:
 *
 *  - only comparables on pages the search really returned;
 *  - with 3+ prices from the same project, only those count;
 *  - outliers dropped (more than 25% below or 35% above the middle price);
 *  - at least 3 left, of which 2 in the same project, or at least 4 nearby;
 *  - the spread between low and high at most 1.6×;
 *  - the middle price not far below the government rate (that would mean
 *    the comparables are for something else).
 */

const MAX_SPREAD = 1.6;

const urlKey = (u: string) =>
  u
    .trim()
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .toLowerCase();
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
};
/** Rounded to ₹1 lakh (or ₹10,000 below ₹10 lakh) — a range, not a quote. */
const roundValue = (n: number) => {
  const step = n >= 1_000_000 ? 100_000 : 10_000;
  return Math.round(n / step) * step;
};

interface RangeInput {
  comparables: MarketComparable[];
  /** Page URLs the web search returned. */
  sources: string[];
  area_sqft: number | null;
  government_per_sqft: number | null;
}

type RangeResult = Pick<
  MarketEstimate,
  | 'status'
  | 'per_sqft_low'
  | 'per_sqft_high'
  | 'value_low'
  | 'value_high'
  | 'rent_low'
  | 'rent_high'
  | 'confidence'
  | 'comparables'
>;

/**
 * Do these prices agree? Same-project ones alone when there are 3+, outliers
 * dropped, at least 3 left (2 in the project, or 4 nearby), and the spread
 * at most 1.6×. Returns the low and high per sq ft, or the survivors only.
 */
function agree(found: MarketComparable[]) {
  const same = found.filter((c) => c.same_project);
  const pool = same.length >= 3 ? same : found;
  if (pool.length < 3) return { kept: pool, low: null, high: null, sameProject: 0 };
  const mid = median(pool.map((c) => c.per_sqft));
  const kept = pool.filter((c) => c.per_sqft >= mid * 0.75 && c.per_sqft <= mid * 1.35);
  const sameProject = kept.filter((c) => c.same_project).length;
  if (kept.length < 3 || (sameProject < 2 && kept.length < 4))
    return { kept, low: null, high: null, sameProject };
  const rates = kept.map((c) => c.per_sqft);
  const low = kept.length >= 5 ? quantile(rates, 0.2) : Math.min(...rates);
  const high = kept.length >= 5 ? quantile(rates, 0.8) : Math.max(...rates);
  if (high / low > MAX_SPREAD) return { kept, low: null, high: null, sameProject };
  return { kept, low, high, sameProject };
}

/** Monthly rent rounded to ₹500. */
const roundRent = (n: number) => Math.round(n / 500) * 500;

export function marketRange(input: RangeInput): RangeResult {
  const seen = new Set(input.sources.map(urlKey));
  const real = input.comparables.filter((c) => seen.has(urlKey(c.url)));
  const sale = agree(real.filter((c) => c.kind !== 'rent'));
  const rent = agree(real.filter((c) => c.kind === 'rent'));
  const rentOk = rent.low !== null && rent.high !== null && !!input.area_sqft;
  const rents = {
    rent_low: rentOk ? roundRent(rent.low! * input.area_sqft!) : null,
    rent_high: rentOk ? roundRent(rent.high! * input.area_sqft!) : null,
  };
  const comparables = [...sale.kept, ...(rentOk ? rent.kept : [])];
  const saleOk =
    sale.low !== null &&
    sale.high !== null &&
    // Far below the government rate: the comparables are for something else.
    !(input.government_per_sqft && (sale.low + sale.high) / 2 < input.government_per_sqft * 0.8);
  if (!saleOk) {
    return {
      status: rentOk ? 'ready' : 'not_enough',
      per_sqft_low: null,
      per_sqft_high: null,
      value_low: null,
      value_high: null,
      ...rents,
      confidence: null,
      comparables,
    };
  }
  const low = Math.round(sale.low!);
  const high = Math.round(sale.high!);
  return {
    status: 'ready',
    per_sqft_low: low,
    per_sqft_high: high,
    value_low: input.area_sqft ? roundValue(low * input.area_sqft) : null,
    value_high: input.area_sqft ? roundValue(high * input.area_sqft) : null,
    ...rents,
    confidence: sale.sameProject >= 3 && high / low <= 1.35 ? 'high' : 'medium',
    comparables,
  };
}
