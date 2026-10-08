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
