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
  | 'confidence'
  | 'comparables'
>;

export function marketRange(input: RangeInput): RangeResult {
  const seen = new Set(input.sources.map(urlKey));
  const real = input.comparables.filter((c) => seen.has(urlKey(c.url)));
  const none: RangeResult = {
    status: 'not_enough',
    per_sqft_low: null,
    per_sqft_high: null,
    value_low: null,
    value_high: null,
    confidence: null,
    comparables: real,
  };
  if (real.length < 3) return none;
  // Enough prices from the same project → only those (the closest match).
  const pool =
    real.filter((c) => c.same_project).length >= 3 ? real.filter((c) => c.same_project) : real;
  const mid = median(pool.map((c) => c.per_sqft));
  const kept = pool.filter((c) => c.per_sqft >= mid * 0.75 && c.per_sqft <= mid * 1.35);
  const sameProject = kept.filter((c) => c.same_project).length;
  if (kept.length < 3 || (sameProject < 2 && kept.length < 4))
    return { ...none, comparables: kept };

  const rates = kept.map((c) => c.per_sqft);
  const low = Math.round(kept.length >= 5 ? quantile(rates, 0.2) : Math.min(...rates));
  const high = Math.round(kept.length >= 5 ? quantile(rates, 0.8) : Math.max(...rates));
  if (high / low > MAX_SPREAD) return { ...none, comparables: kept };
  if (input.government_per_sqft && median(rates) < input.government_per_sqft * 0.8) {
    return { ...none, comparables: kept };
  }
  return {
    status: 'ready',
    per_sqft_low: low,
    per_sqft_high: high,
    value_low: input.area_sqft ? roundValue(low * input.area_sqft) : null,
    value_high: input.area_sqft ? roundValue(high * input.area_sqft) : null,
    confidence: sameProject >= 3 && high / low <= 1.35 ? 'high' : 'medium',
    comparables: kept,
  };
}
