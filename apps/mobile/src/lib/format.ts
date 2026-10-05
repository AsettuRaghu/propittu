import {
  AREA_UNIT_LABELS,
  PROPERTY_TYPE_LABELS,
  type AreaUnit,
  type Property,
  type PropertySummary,
} from '@propittu/shared';

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
export function propertySubtitle(p: Pick<PropertySummary, 'property_type' | 'city'>): string {
  const type = PROPERTY_TYPE_LABELS[p.property_type].split(' / ')[0];
  return p.city ? `${type} • ${p.city}` : (type ?? '');
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
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
