import type { PropertyCompletion } from './completion';

/**
 * Property health — one number for "how well looked-after is this
 * property?", built only from what we already know. Every point missing
 * names the action that earns it, so the score always leads somewhere
 * useful (and often to one of our services). Shared, so the API (which
 * computes it), the app (which shows it) and reminders always agree.
 */

export type HealthKey = 'profile' | 'location' | 'documents' | 'tax' | 'visit' | 'deed';

export interface HealthItem {
  key: HealthKey;
  label: string;
  /** Points earned out of `of`. */
  points: number;
  of: number;
  done: boolean;
}

export interface PropertyHealth {
  /** 0–100 */
  score: number;
  items: HealthItem[];
}

export interface HealthInput {
  completion: PropertyCompletion;
  /** The pin is confirmed by the owner and agrees with the PIN code and the deed. */
  locationGood: boolean;
  documentTypes: readonly string[];
  /** Pittu's answers with when they were given. */
  answers: Partial<Record<string, { answer: string; at: string }>>;
  /** Last completed site visit by our team, if any. */
  lastVisitAt: string | null;
  /** The deed has been read, and nothing saved differs from it. */
  deed: 'matches' | 'differs' | 'unread' | 'none';
  now?: Date;
}

/** 1 April of the current Indian financial year. */
export function financialYearStart(now = new Date()): Date {
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(Date.UTC(y, 3, 1));
}

/** "2026–27" */
export function financialYearLabel(now = new Date()): string {
  const y = financialYearStart(now).getUTCFullYear();
  return `${y}–${String(y + 1).slice(2)}`;
}

const YEAR_MS = 365 * 24 * 3600_000;

/** Paid this financial year? (an answer from before 1 April is last year's) */
export function taxPaidThisYear(input: Pick<HealthInput, 'answers' | 'now'>): boolean {
  const a = input.answers.tax_paid;
  return !!a && a.answer === 'paid' && Date.parse(a.at) >= financialYearStart(input.now).getTime();
}

/** Seen in the last year — by our team, or the owner says so / lives there. */
export function seenRecently(input: Pick<HealthInput, 'answers' | 'lastVisitAt' | 'now'>): boolean {
  const now = (input.now ?? new Date()).getTime();
  if (input.lastVisitAt && now - Date.parse(input.lastVisitAt) < YEAR_MS) return true;
  if (input.answers.occupancy?.answer === 'self') return true;
  const said = input.answers.last_visit;
  return !!said && said.answer === 'recent' && now - Date.parse(said.at) < YEAR_MS;
}

export function propertyHealth(input: HealthInput): PropertyHealth {
  const docs = input.documentTypes;
  const docPoints = (docs.includes('sale_deed') ? 10 : 0) + (docs.includes('property_tax') ? 5 : 0);
  const items: HealthItem[] = [
    {
      key: 'profile',
      label: 'Details complete',
      of: 30,
      points: Math.round((input.completion.percent / 100) * 30),
      done: input.completion.percent >= 100,
    },
    {
      key: 'location',
      label: 'Exact location confirmed',
      of: 15,
      points: input.locationGood ? 15 : 0,
      done: input.locationGood,
    },
    {
      key: 'documents',
      label: 'Sale deed and tax receipt in the locker',
      of: 15,
      points: docPoints,
      done: docPoints === 15,
    },
    {
      key: 'tax',
      label: `Property tax paid for ${financialYearLabel(input.now)}`,
      of: 15,
      points: taxPaidThisYear(input) ? 15 : 0,
      done: taxPaidThisYear(input),
    },
    {
      key: 'visit',
      label: 'Seen in person this year',
      of: 15,
      points: seenRecently(input) ? 15 : 0,
      done: seenRecently(input),
    },
    {
      key: 'deed',
      label: 'Matches its sale deed',
      of: 10,
      points: input.deed === 'matches' ? 10 : 0,
      done: input.deed === 'matches',
    },
  ];
  return { score: items.reduce((n, i) => n + i.points, 0), items };
}
