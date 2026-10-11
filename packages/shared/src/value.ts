import { z } from 'zod';

/**
 * Pittu Value — government values (docs/PITTU.md). Rates come from official
 * documents (read by Pittu, reviewed by the team) or are added by hand. A
 * property's government value = its area × the matching published rate. It
 * is the GOVERNMENT value (guidance / market value), never the market price.
 */

export const VALUE_KINDS = [
  'site',
  'apartment',
  'house',
  'commercial',
  'agricultural',
  'other',
] as const;
export type ValueKind = (typeof VALUE_KINDS)[number];
export const VALUE_KIND_LABELS: Record<ValueKind, string> = {
  site: 'Residential site / plot',
  apartment: 'Apartment',
  house: 'House',
  commercial: 'Commercial',
  agricultural: 'Agricultural land',
  other: 'Other',
};

export const RATE_UNITS = ['sqft', 'sqm', 'sqyd', 'acre', 'guntha', 'cent'] as const;
export type RateUnit = (typeof RATE_UNITS)[number];
export const RATE_UNIT_LABELS: Record<RateUnit, string> = {
  sqft: 'per sq ft',
  sqm: 'per sq m',
  sqyd: 'per sq yd',
  acre: 'per acre',
  guntha: 'per guntha',
  cent: 'per cent',
};

/** Square feet in one unit (property areas and rates are compared in sq ft). */
export const SQFT_PER_UNIT: Record<RateUnit, number> = {
  sqft: 1,
  sqm: 10.7639,
  sqyd: 9,
  acre: 43_560,
  guntha: 1_089,
  cent: 435.6,
};

export interface RateSource {
  id: string;
  state: string;
  district: string;
  office: string | null;
  title: string;
  effective_from: string | null;
  upload_status: 'pending' | 'ready';
  read_status: 'none' | 'reading' | 'read' | 'failed';
  read_error: string | null;
  rows_found: number | null;
  drafts: number;
  published: number;
  created_at: string;
}

export interface ValueRate {
  id: string;
  source_id: string | null;
  state: string;
  district: string;
  office: string | null;
  locality: string;
  pincodes: string[];
  survey_numbers: string[];
  kind: ValueKind;
  rate_inr: number;
  unit: RateUnit;
  effective_from: string | null;
  status: 'draft' | 'published';
  page: number | null;
  notes: string | null;
}

/** GET /properties/:id/value (and the staff view). */
export interface PropertyValue {
  /** What the owner paid, from the property details or the sale deed. */
  paid_inr: number | null;
  purchase_date: string | null;
  area_sqft: number | null;
  paid_per_sqft: number | null;
  /** The matching government rate, when one is found. */
  rate: {
    id: string;
    locality: string;
    kind: ValueKind;
    rate_inr: number;
    unit: RateUnit;
    per_sqft: number;
    effective_from: string | null;
    office: string | null;
    matched_on: 'survey_number' | 'locality' | 'pincode';
  } | null;
  /** area × rate (rounded), when both are known. */
  government_value_inr: number | null;
  /** Why something is missing, in plain words. */
  missing: string[];
  /** What similar properties sell for nearby (GET /properties/:id/value only). */
  estimate?: MarketEstimate | null;
}

/** One price Pittu found on the web, with its page. */
export interface MarketComparable {
  url: string;
  title: string;
  kind: 'listing' | 'sale' | 'project_price' | 'rent';
  same_project: boolean;
  /** Rupees per sq ft (for a rent: rupees per sq ft per month). */
  per_sqft: number;
  /** YYYY-MM or YYYY-MM-DD. */
  date: string | null;
  /** What the quoted area measures (prices per sq ft differ a lot between them). */
  area_basis?: AreaBasis | null;
  /** Size of the home quoted, in sq ft on that basis. */
  area_sqft?: number | null;
  /** A sale an owner in the project told us about (no page; counts as real). */
  from_owner?: boolean;
}

export type AreaBasis = 'super_built_up' | 'built_up' | 'carpet' | 'plot';
export const AREA_BASIS_LABELS: Record<AreaBasis, string> = {
  super_built_up: 'Super built-up',
  built_up: 'Built-up',
  carpet: 'Carpet',
  plot: 'Plot / site',
};

/** A sale an owner knows of in their project (POST /properties/:id/known-sales). */
export const knownSaleSchema = z.object({
  price_inr: z.number().int().min(100_000).max(10_000_000_000),
  area_sqft: z.number().int().min(100).max(100_000),
  area_basis: z.enum(['super_built_up', 'built_up', 'carpet', 'plot']),
  sold_on: z.iso.date(),
  note: z.string().trim().max(300).nullable().optional(),
  share_in_project: z.boolean().default(true),
});
export type KnownSaleInput = z.infer<typeof knownSaleSchema>;

export interface KnownSale extends KnownSaleInput {
  id: string;
  created_at: string;
}

/**
 * Pittu's market range: shown to the owner only when `status` is 'ready'
 * (enough real comparables that agree); otherwise only the government value.
 */
export interface MarketEstimate {
  status: 'working' | 'ready' | 'not_enough' | 'failed';
  per_sqft_low: number | null;
  per_sqft_high: number | null;
  value_low: number | null;
  value_high: number | null;
  /** Monthly rent similar homes ask for (flats and houses), when enough rents agree. */
  rent_low: number | null;
  rent_high: number | null;
  confidence: 'high' | 'medium' | null;
  comparables: MarketComparable[];
  note: string | null;
  updated_at: string;
}

const place = z.string().trim().min(1).max(120);
export const valueSourceCreateSchema = z.object({
  state: place,
  district: place,
  office: z.string().trim().max(120).nullable().optional(),
  title: z.string().trim().min(1).max(200),
  effective_from: z.iso.date().nullable().optional(),
  file_size: z
    .number()
    .int()
    .positive()
    .max(50 * 1024 * 1024, 'Files must be under 50 MB'),
});

export const valueRateSchema = z.object({
  state: place,
  district: place,
  office: z.string().trim().max(120).nullable().optional(),
  locality: z.string().trim().min(1).max(200),
  pincodes: z
    .array(z.string().regex(/^[1-9][0-9]{5}$/))
    .max(50)
    .default([]),
  survey_numbers: z.array(z.string().trim().min(1).max(40)).max(200).default([]),
  kind: z.enum(VALUE_KINDS),
  rate_inr: z.number().positive().max(10_000_000_000),
  unit: z.enum(RATE_UNITS),
  effective_from: z.iso.date().nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export const valueRateUpdateSchema = valueRateSchema.partial();

/** GET /backoffice/value/properties — every property and its government value. */
export interface PropertyValueRow extends PropertyValue {
  property_id: string;
  property_name: string;
  account_id: string;
  city: string | null;
  pincode: string | null;
}

/**
 * How much the property has gained since it was bought: the middle of the
 * market range against the price paid per sq ft, and per year when it's
 * been more than a year. Null when either side is missing.
 */
export function appreciation(
  v: Pick<PropertyValue, 'paid_per_sqft' | 'purchase_date' | 'estimate'>,
  now = new Date(),
): { percent: number; per_year: number | null; since_year: number | null } | null {
  const e = v.estimate;
  if (!e || e.status !== 'ready' || !e.per_sqft_low || !e.per_sqft_high || !v.paid_per_sqft)
    return null;
  const mid = (e.per_sqft_low + e.per_sqft_high) / 2;
  const ratio = mid / v.paid_per_sqft;
  const since = v.purchase_date ? Date.parse(v.purchase_date) : NaN;
  const years = Number.isFinite(since) ? (now.getTime() - since) / (365.25 * 86_400_000) : null;
  return {
    percent: Math.round((ratio - 1) * 100),
    per_year: years && years >= 1 ? +((ratio ** (1 / years) - 1) * 100).toFixed(1) : null,
    since_year: Number.isFinite(since) ? new Date(since).getUTCFullYear() : null,
  };
}

/* ---- Plot satellite watch (optional module) ---- */

export type SatelliteChange = 'none' | 'baseline' | 'site_cleared' | 'site_built' | 'area_built';

export const SATELLITE_CHANGE_LABELS: Record<SatelliteChange, string> = {
  none: 'No clear change',
  baseline: 'First picture',
  site_cleared: 'The plot looks cleared — greenery gone',
  site_built: 'Something may be built on the plot',
  area_built: 'New building close to the plot',
};

export interface SatelliteObservation {
  id: string;
  captured_at: string;
  change: SatelliteChange;
  /** True-colour picture of about 600 m around the plot. */
  picture_url: string;
}

/** GET /properties/:id/satellite */
export interface SatelliteView {
  /** The module is switched on, and this property can be watched (a plot with a confirmed pin). */
  available: boolean;
  observations: SatelliteObservation[];
}
