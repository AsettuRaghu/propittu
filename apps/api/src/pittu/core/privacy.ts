/**
 * Second line of defence for personal identifiers. The task instructions
 * already tell the model never to output these; anything that still looks
 * like one is removed before it is saved or logged.
 */

const PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
const AADHAAR = /\b\d{4}\s?\d{4}\s?\d{4}\b/g;
const PHONE = /(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\d)/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;

export interface ScrubReport {
  removed: number;
}

function scrubString(s: string, report: ScrubReport): string {
  const out = s
    .replace(PAN, '[removed]')
    .replace(AADHAAR, '[removed]')
    .replace(PHONE, '[removed]')
    .replace(EMAIL, '[removed]');
  if (out !== s) report.removed += 1;
  return out;
}

/** Returns a deep copy with identifiers replaced by "[removed]". */
export function scrub<T>(value: T, report: ScrubReport = { removed: 0 }): T {
  if (typeof value === 'string') return scrubString(value, report) as T;
  if (Array.isArray(value)) return value.map((v) => scrub(v, report)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, scrub(v, report)]),
    ) as T;
  }
  return value;
}
