import type { DocumentType } from './constants';

/**
 * Document intelligence (AI) — shared shapes. The API decides everything;
 * the app shows status, the facts found and the customer's decisions.
 */

/** Document types Pittu can read (others are stored only). */
export const AI_READABLE_DOCUMENT_TYPES: readonly DocumentType[] = ['sale_deed'];

export const ANALYSIS_STATUSES = ['queued', 'reading', 'ready', 'failed'] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export const FACT_STATUSES = [
  'suggested',
  'confirmed',
  'edited',
  'rejected',
  'superseded',
] as const;
export type FactStatus = (typeof FACT_STATUSES)[number];

export type FactValue = string | number | string[];

export interface PropertyFact {
  id: string;
  key: string;
  value: FactValue;
  pages: number[];
  confidence: 'high' | 'medium' | 'low' | null;
  status: FactStatus;
  final_value: FactValue | null;
}

/** Why a reading did not produce a result (customer-safe codes). */
export const ANALYSIS_ERROR_LABELS: Record<string, string> = {
  not_a_sale_deed: "This doesn't look like a sale deed.",
  too_large: 'This file is too large for Pittu to read yet. Our team will look at it.',
  daily_limit: 'Pittu has read several documents today. Please try again tomorrow.',
  unavailable: 'Pittu is resting right now. Please try again in a little while.',
  failed: "We couldn't read this document. You can enter the details yourself.",
};

export interface DocumentAnalysis {
  id: string;
  document_id: string;
  task: string;
  task_version: string;
  status: AnalysisStatus;
  error_code: string | null;
  created_at: string;
  finished_at: string | null;
  facts: PropertyFact[];
  /** This deed is already with a property in the locker (same file, or same registration). */
  duplicate_of: { id: string; name: string } | null;
}

/* ------------------------------------------------------------------ *
 * From facts to a property (shared so the app pre-fills exactly what
 * the API later compares against — the customer's edits are then known
 * precisely, and kept as the improvement signal).
 * ------------------------------------------------------------------ */

/** Property fields Pittu can pre-fill, and the fact each comes from. */
export const PREFILL_FIELDS = [
  'property_type',
  'name',
  'address_line',
  'city',
  'state',
  'pincode',
  'area_value',
  'area_unit',
  'survey_number',
  'property_number',
  'khata_number',
] as const;
export type PrefillField = (typeof PREFILL_FIELDS)[number];

export type PropertyPrefill = Partial<Record<PrefillField, string | number | null>>;

const PROPERTY_KINDS = [
  'land',
  'apartment',
  'independent_house',
  'commercial',
  'industrial',
  'other',
];
const UNITS = ['sqft', 'sqyd', 'sqm', 'acre', 'guntha', 'cent'];

/** "Plot in Bommasandra" — a recognisable name when the deed has no project or unit. */
function placeName(kind: string | null, place: string | null): string | null {
  if (!place) return null;
  const what: Record<string, string> = {
    land: 'Plot',
    apartment: 'Flat',
    independent_house: 'House',
    commercial: 'Property',
    industrial: 'Property',
  };
  return `${(kind && what[kind]) || 'Property'} in ${place}`;
}

/**
 * The suggested name, most recognisable first:
 *   society / project + site or flat   "Prasanthi Green Park – Site 28"
 *   society / project + place          "Prasanthi Green Park, Bommasandra"
 *   kind + place                       "Plot in Bommasandra"
 *   site or flat alone                 "Site 28"
 */
function propertyName(
  kind: string | null,
  project: string | null,
  unitLabel: string | null,
  place: string | null,
): string | null {
  if (project && unitLabel) return `${project} – ${unitLabel}`;
  if (project) return place && !project.includes(place) ? `${project}, ${place}` : project;
  return placeName(kind, place) ?? unitLabel;
}

/** Builds the pre-filled property from a reading's facts (nothing invented). */
export function prefillFromFacts(facts: Pick<PropertyFact, 'key' | 'value'>[]): PropertyPrefill {
  const f = new Map(facts.map((x) => [x.key, x.value]));
  const s = (k: string): string | null => {
    const v = f.get(k);
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  };
  const kind = s('property_kind');
  const project = s('project_name');
  const unit = s('unit_number');
  const block = s('block_or_tower');
  const isFlat = kind === 'apartment';
  const unitLabel = unit
    ? isFlat
      ? [block, unit].filter(Boolean).join(' · ')
      : `Site ${unit}`
    : null;
  const surveys = f.get('survey_numbers');
  // Layout sites are identified by site number + Khata; the layout's survey
  // numbers stay background facts (owner decision 6 Oct 2026).
  const survey =
    kind === 'land' && !project && Array.isArray(surveys) && surveys[0] ? surveys[0] : null;
  const area = f.get('area_value');

  const address = [
    unit ? (isFlat ? `Flat ${unit}` : `Site No. ${unit}`) : null,
    block,
    s('floor') ? `${s('floor')} floor` : null,
    project,
    s('village') ? `${s('village')} village` : null,
    s('hobli') ? `${s('hobli')} Hobli` : null,
    s('taluk_or_mandal'),
  ]
    .filter(Boolean)
    .join(', ');

  return {
    property_type: kind && PROPERTY_KINDS.includes(kind) ? kind : null,
    name: propertyName(kind, project, unitLabel, s('village') ?? s('taluk_or_mandal') ?? s('city')),
    address_line: address || null,
    city: s('city'),
    state: s('state'),
    pincode: s('pincode'),
    area_value: typeof area === 'number' ? area : null,
    area_unit: s('area_unit') && UNITS.includes(s('area_unit') as string) ? s('area_unit') : null,
    survey_number: survey,
    property_number: unit,
    khata_number: s('khata_number'),
  };
}

/**
 * Did the reading give us anything worth pre-filling? A file with none of
 * these isn't much of a deed (Pittu "came up empty").
 */
export function hasUsefulPrefill(p: PropertyPrefill): boolean {
  return [
    p.property_type,
    p.name,
    p.address_line,
    p.city,
    p.area_value,
    p.survey_number,
    p.property_number,
    p.khata_number,
  ].some((v) => v !== null && v !== undefined && v !== '');
}

/** Which facts feed which field (for highlighting uncertain values). */
export const PREFILL_SOURCES: Record<PrefillField, string[]> = {
  property_type: ['property_kind'],
  name: ['project_name', 'unit_number', 'block_or_tower'],
  address_line: ['unit_number', 'project_name', 'village', 'hobli', 'taluk_or_mandal'],
  city: ['city', 'district'],
  state: ['state'],
  pincode: ['pincode'],
  area_value: ['area_value'],
  area_unit: ['area_unit'],
  survey_number: ['survey_numbers'],
  property_number: ['unit_number'],
  khata_number: ['khata_number'],
};

/** Readable labels for the details Pittu shows besides the form. */
export const FACT_LABELS: Record<string, string> = {
  buyers: 'Buyer(s)',
  sellers: 'Seller(s)',
  registration_number: 'Registration no.',
  registration_date: 'Registered on',
  execution_date: 'Signed on',
  sub_registrar_office: 'Sub-Registrar',
  sale_consideration_inr: 'Sale price',
  village: 'Village',
  hobli: 'Hobli',
  taluk_or_mandal: 'Taluk / Mandal',
  district: 'District',
  project_name: 'Layout / project',
  developer: 'Developer',
  survey_numbers: 'Survey no(s).',
  land_khata_number: 'Land Khata',
  undivided_share: 'Undivided share',
  super_built_up_sqft: 'Super built-up (sq ft)',
  carpet_sqft: 'Carpet area (sq ft)',
  boundary_north: 'North',
  boundary_south: 'South',
  boundary_east: 'East',
  boundary_west: 'West',
};

/** Same value? (case, spaces and punctuation don't count as an edit) */
export function sameFactValue(a: unknown, b: unknown): boolean {
  const n = (v: unknown) =>
    v === null || v === undefined
      ? ''
      : String(v)
          .toLowerCase()
          .replace(/[^a-z0-9.]/g, '');
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  return n(a) === n(b);
}

/** An unfinished deed set-up (GET /properties/drafts). */
export interface DraftProperty {
  id: string;
  created_at: string;
  /** The uploaded sale deed, if the upload finished. */
  document_id: string | null;
  /** Where Pittu's reading of it stands (null: not started). */
  status: AnalysisStatus | null;
  /** The name Pittu suggests from the deed ("Plot in Bommasandra"), once read. */
  name: string | null;
  /** The property in the locker this deed already belongs to, if any. */
  duplicate_of: { id: string; name: string } | null;
}

/* ------------------------------------------------------------------ *
 * Backoffice → Pittu: usage, cost, failures and the Review list
 * ------------------------------------------------------------------ */

/** Staff wording for every failure code (the customer sees ANALYSIS_ERROR_LABELS). */
export const STAFF_ANALYSIS_ERROR_LABELS: Record<string, string> = {
  not_a_sale_deed: 'Not a sale deed',
  too_large: 'File too large (over 24 MB)',
  daily_limit: 'Daily limit reached',
  unavailable: 'Paused (budget or switched off)',
  failed: 'Reading failed',
  document_missing: 'File missing from storage',
  unknown_task: 'Unknown task version',
};

export interface AiFailure {
  analysis_id: string;
  account_id: string;
  customer_phone: string | null;
  property_id: string;
  property_name: string;
  is_draft: boolean;
  error_code: string | null;
  attempts: number;
  updated_at: string;
  /** Staff may start this reading again (it may cost money). */
  can_retry: boolean;
}

export interface AiAccountSpend {
  account_id: string;
  customer_phone: string | null;
  customer_name: string | null;
  calls: number;
  cost_usd: number;
}

/** GET /backoffice/ai/summary — this calendar month (UTC, same as the budget). */
export interface AiSummary {
  enabled: boolean;
  pilot_accounts: number;
  month_start: string;
  budget_usd: number;
  spend_usd: number;
  today_spend_usd: number;
  calls: { ok: number; failed: number };
  avg_cost_usd: number | null;
  avg_seconds: number | null;
  input_tokens: number;
  output_tokens: number;
  /** What customers did with the values Pittu read (the accuracy signal). */
  facts: { confirmed: number; edited: number; rejected: number };
  review_open: number;
  by_account: AiAccountSpend[];
  failures: AiFailure[];
}
