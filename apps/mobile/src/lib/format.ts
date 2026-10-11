import { AREA_UNIT_LABELS, type AreaUnit, type Property } from '@propittu/shared';

const numberFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

/** 2400 sqft → "2,400 sq.ft" (Indian digit grouping: 1,00,000). */
export function formatArea(value: number | null, unit: AreaUnit | null): string | null {
  if (value === null) return null;
  return `${numberFormat.format(value)}${unit ? ` ${AREA_UNIT_LABELS[unit]}` : ''}`;
}

/** "Hyderabad, Telangana" — whichever parts exist. */
export function formatLocation(p: Pick<Property, 'city' | 'state'>): string | null {
  const parts = [p.city, p.state].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

/** Home card subtitle per §15: "Land • Hyderabad". */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** "7 Oct, 10:30 am" — a day and time, for messages and requests. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time}`;
}

export function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "₹42,00,000" (Indian grouping, whole rupees). */
export const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** "₹1.24 crore", "₹42 lakh" — for one-line summaries. */
export function rupeesShort(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2).replace(/\.?0+$/, '')} crore`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1).replace(/\.0$/, '')} lakh`;
  return rupees(n);
}

/** "2.7 Cr", "270 lakh", "₹2,70,00,000" → 27000000; anything else → null. */
export function parseRupees(text: string): number | null {
  const t = text.toLowerCase().replace(/[₹,\s]/g, '');
  const m = t.match(/^(\d+(?:\.\d+)?)(cr|crore|crores|l|lakh|lakhs|lac|k)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2] ?? '';
  const mult = unit.startsWith('c') ? 1e7 : unit.startsWith('l') ? 1e5 : unit === 'k' ? 1e3 : 1;
  const v = Math.round(n * mult);
  return v > 0 ? v : null;
}
