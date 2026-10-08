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
