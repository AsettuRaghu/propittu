import { z } from 'zod';

/**
 * Pittu Legal — the EC check (docs/PITTU.md). Pittu Read lists what the EC
 * says; these rules (in the API's application layer) compare it with the
 * sale deed and produce findings; staff review them before the customer sees
 * anything. Findings report what the records show — never "safe".
 */

export const LEGAL_LEVELS = ['green', 'amber', 'red'] as const;
export type LegalLevel = (typeof LEGAL_LEVELS)[number];
export const LEGAL_LEVEL_LABELS: Record<LegalLevel, string> = {
  green: 'Looks right',
  amber: 'Worth a look',
  red: 'Needs attention',
};

export const LEGAL_FINDING_CODES = [
  'ec_period_short',
  'ec_period_unknown',
  'property_mismatch',
  'purchase_found',
  'purchase_missing',
  'purchase_outside_period',
  'nil_but_purchase_expected',
  'seller_matches_chain',
  'seller_not_previous_buyer',
  'chain_break',
  'later_sale',
  'later_transfer',
  'later_mortgage_open',
  'own_mortgage_open',
  'mortgage_open_before_purchase',
  'court_order',
  'low_confidence_entries',
  'clear_after_purchase',
] as const;
export type LegalFindingCode = (typeof LEGAL_FINDING_CODES)[number];

export interface LegalFinding {
  code: LegalFindingCode;
  level: LegalLevel;
  /** One line for the customer report. */
  title: string;
  /** Plain explanation and what to do. */
  detail: string;
  /** The EC entries this is about (by document number and date), for staff to check. */
  evidence: { document_number: string | null; registration_date: string | null; pages: number[] }[];
  /** Staff review. */
  review: 'open' | 'confirmed' | 'dismissed';
  staff_note: string | null;
}

export const LEGAL_CHECK_STATUSES = ['in_review', 'ready', 'shared'] as const;
export type LegalCheckStatus = (typeof LEGAL_CHECK_STATUSES)[number];
export const LEGAL_CHECK_STATUS_LABELS: Record<LegalCheckStatus, string> = {
  in_review: 'In review',
  ready: 'Ready to share',
  shared: 'Shared with the customer',
};

/** A legal check of one property (GET /backoffice/legal-checks/:id). */
export interface LegalCheck {
  id: string;
  account_id: string;
  property_id: string;
  property_name: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  status: LegalCheckStatus;
  /** Worst level among findings that weren't dismissed. */
  overall: LegalLevel | null;
  rules_version: string;
  ec_document_id: string;
  deed_document_id: string | null;
  /** What the EC covers, for the report. */
  ec_office: string | null;
  ec_period_from: string | null;
  ec_period_to: string | null;
  findings: LegalFinding[];
  summary: string | null;
  created_at: string;
  updated_at: string;
  shared_at: string | null;
}

/** Worst level among findings still standing. */
export function overallLevel(
  findings: Pick<LegalFinding, 'level' | 'review'>[],
): LegalLevel | null {
  const live = findings.filter((f) => f.review !== 'dismissed');
  if (!live.length) return null;
  if (live.some((f) => f.level === 'red')) return 'red';
  if (live.some((f) => f.level === 'amber')) return 'amber';
  return 'green';
}

export const legalCheckCreateSchema = z.object({ ec_document_id: z.guid() });
export const legalFindingReviewSchema = z.object({
  index: z.number().int().min(0).max(200),
  review: z.enum(['open', 'confirmed', 'dismissed']),
  staff_note: z.string().trim().max(1000).nullable().optional(),
});
export const legalCheckUpdateSchema = z
  .object({
    status: z.enum(LEGAL_CHECK_STATUSES),
    summary: z.string().trim().max(3000).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

/* ------------------------------------------------------------------ *
 * Court cases and disputes about the project or the land (Pittu searches
 * the web; the team reviews anything found before the owner sees it).
 * ------------------------------------------------------------------ */

export interface DisputeItem {
  url: string;
  title: string;
  source_kind: 'court' | 'news' | 'rera' | 'government' | 'other';
  about: 'this_project' | 'this_land' | 'developer_elsewhere' | 'area_general';
  status: 'pending' | 'decided' | 'unknown';
  date: string | null;
  /** Plain words, organisations only (no individual names). */
  summary: string;
  /** Staff: keep it for the owner, or dismiss it (not about this property). */
  review: 'open' | 'kept' | 'dismissed';
}

export const DISPUTE_STATUSES = ['working', 'in_review', 'shared', 'clear', 'failed'] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

/** GET /properties/:id/disputes (items only once the team has shared them). */
export interface PropertyDisputes {
  status: DisputeStatus;
  items: DisputeItem[];
  /** The team's note to the owner. */
  note: string | null;
  checked_at: string | null;
  /** Disputes our team confirmed for the whole project (every owner there sees them). */
  project?: ProjectDispute[];
  /** What this owner told us they heard, and our reply. */
  reports?: DisputeReport[];
}

/* ---- Owners hear first: reports, and alerts for a whole project ---- */

export const DISPUTE_REPORT_SOURCES = ['builder', 'call', 'notice', 'neighbours', 'other'] as const;
export type DisputeReportSource = (typeof DISPUTE_REPORT_SOURCES)[number];
export const DISPUTE_REPORT_SOURCE_LABELS: Record<DisputeReportSource, string> = {
  builder: 'The builder told us',
  call: 'I got a call',
  notice: 'A notice or letter',
  neighbours: 'Other owners / the association',
  other: 'Somewhere else',
};

export const disputeReportSchema = z.object({
  source: z.enum(DISPUTE_REPORT_SOURCES),
  details: z
    .string()
    .trim()
    .min(5, 'Tell us a little about what you heard')
    .max(2000, 'Please keep it under 2,000 characters'),
});
export type DisputeReportInput = z.infer<typeof disputeReportSchema>;

export interface DisputeReport {
  id: string;
  property_id: string;
  source: DisputeReportSource;
  details: string;
  status: 'open' | 'looking' | 'confirmed' | 'not_found';
  staff_note: string | null;
  project_dispute_id: string | null;
  created_at: string;
}

export interface ProjectDispute {
  id: string;
  project_name: string;
  district: string | null;
  summary: string;
  what_it_means: string | null;
  what_to_do: string | null;
  source_url: string | null;
  status: 'active' | 'resolved';
  created_at: string;
  updated_at: string;
}

export const projectDisputeSchema = z.object({
  project_name: z.string().trim().min(2).max(200),
  district: z.string().trim().max(120).nullable().optional(),
  summary: z.string().trim().min(5).max(1000),
  what_it_means: z.string().trim().max(2000).nullable().optional(),
  what_to_do: z.string().trim().max(2000).nullable().optional(),
  source_url: z.url().nullable().optional(),
  report_id: z.guid().nullable().optional(),
});

/** "NCC Urban Mayfair – Phase 2" → "nccurbanmayfair" (phase / block words dropped). */
export function projectKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(phase|block|tower|wing|stage)\s*[\w-]*/g, ' ')
    .replace(/\b(the|apartments?|residency|enclave|layout)\b/g, ' ')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 120);
}

/** GET /backoffice/dispute-reports */
export interface DisputeReportRow extends DisputeReport {
  account_id: string;
  property_name: string;
  project_name: string | null;
}

/** GET /backoffice/project-disputes */
export interface ProjectDisputeRow extends ProjectDispute {
  /** Propittu properties whose deed names this project. */
  properties: number;
}

/** GET /backoffice/disputes — properties where Pittu found something. */
export interface DisputeReview extends PropertyDisputes {
  property_id: string;
  property_name: string;
  account_id: string;
  pittu_note: string | null;
}

/** GET /properties/:id/project — the property's project on Propittu (anonymous totals only). */
export interface ProjectPage {
  project_name: string;
  /** Propittu owners whose deeds name this project (including this one). */
  owners: number;
  /** Disputes our team confirmed for the project. */
  alerts: ProjectDispute[];
  /** Sales owners shared for the project — no names, no flat numbers. */
  sales: { area_sqft: number; area_basis: string; sold_on: string; price_inr: number }[];
}
