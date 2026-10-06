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
}
