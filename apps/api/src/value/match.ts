import {
  SQFT_PER_UNIT,
  type PropertyValue,
  type RateUnit,
  type ValueKind,
  type ValueRate,
} from '@propittu/shared';

/**
 * Pittu Value — matching a property to a government rate, and the arithmetic
 * (application layer, no AI, no database). The best rate is the one for the
 * same state and district and the same kind of property that matches on
 * survey number (in the same village), else on locality name, else on PIN.
 */

export interface ValueInput {
  property_type: string;
  state: string | null;
  district: string | null;
  pincode: string | null;
  /** Village from the deed, the PIN's place and localities, the city. */
  localities: string[];
  survey_numbers: string[];
  area_value: number | null;
  area_unit: string | null;
  paid_inr: number | null;
  purchase_date: string | null;
}

const clean = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/bengaluru/g, 'bangalore')
    .replace(/\b(urban|rural|district|dist|taluk|hobli|village|mandal)\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function sameArea(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const x = clean(a);
  const y = clean(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
}

const wordIn = (hay: string, needle: string) =>
  needle.length >= 4 &&
  new RegExp(`(^| )${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(hay);

const normSurvey = (s: string) => s.toLowerCase().replace(/[^a-z0-9/]/g, '');

/** The kind of government rate that applies to this kind of property. */
export function kindFor(propertyType: string, areaUnit: string | null): ValueKind {
  if (propertyType === 'apartment') return 'apartment';
  if (propertyType === 'independent_house') return 'house';
  if (propertyType === 'commercial' || propertyType === 'industrial') return 'commercial';
  if (propertyType === 'land')
    return areaUnit === 'acre' || areaUnit === 'guntha' ? 'agricultural' : 'site';
  return 'other';
}

export function matchRate(
  p: ValueInput,
  rates: ValueRate[],
): { rate: ValueRate; on: 'survey_number' | 'locality' | 'pincode' } | null {
  const kind = kindFor(p.property_type, p.area_unit);
  const places = p.localities.map(clean).filter((x) => x.length >= 4);
  const surveys = p.survey_numbers.map(normSurvey).filter(Boolean);
  let best: {
    rate: ValueRate;
    on: 'survey_number' | 'locality' | 'pincode';
    score: number;
  } | null = null;
  for (const r of rates) {
    if (r.status !== 'published' || r.kind !== kind) continue;
    if (p.state && !sameArea(r.state, p.state)) continue;
    if (p.district && !sameArea(r.district, p.district)) continue;
    const loc = clean(r.locality);
    const localityHit = places.some((x) => loc === x || wordIn(loc, x) || wordIn(x, loc));
    const surveyHit =
      localityHit &&
      r.survey_numbers.length > 0 &&
      r.survey_numbers.some((s) => {
        const n = normSurvey(s);
        return surveys.some((x) => x === n || x.startsWith(`${n}/`) || n.startsWith(`${x}/`));
      });
    const pinHit = !!p.pincode && r.pincodes.includes(p.pincode);
    const on = surveyHit
      ? 'survey_number'
      : localityHit && r.survey_numbers.length === 0
        ? 'locality'
        : pinHit
          ? 'pincode'
          : null;
    if (!on) continue;
    const score = on === 'survey_number' ? 3 : on === 'locality' ? 2 : 1;
    const newer = !best || (r.effective_from ?? '') > (best.rate.effective_from ?? '');
    if (!best || score > best.score || (score === best.score && newer))
      best = { rate: r, on, score };
  }
  return best ? { rate: best.rate, on: best.on } : null;
}

const toSqft = (value: number | null, unit: string | null) =>
  value && unit && unit in SQFT_PER_UNIT ? value * SQFT_PER_UNIT[unit as RateUnit] : null;

export function computeValue(p: ValueInput, rates: ValueRate[]): PropertyValue {
  const missing: string[] = [];
  const area = toSqft(p.area_value, p.area_unit);
  if (!area)
    missing.push(
      p.area_value
        ? 'The area unit is not one we can convert yet.'
        : 'The property area is not known.',
    );
  if (!p.paid_inr) missing.push('The price paid is not known.');
  const m = matchRate(p, rates);
  if (!m) missing.push('No government rate is set up for this area and kind of property yet.');
  const perSqft = m ? m.rate.rate_inr / SQFT_PER_UNIT[m.rate.unit] : null;
  return {
    paid_inr: p.paid_inr,
    purchase_date: p.purchase_date,
    area_sqft: area ? Math.round(area) : null,
    paid_per_sqft: area && p.paid_inr ? Math.round(p.paid_inr / area) : null,
    rate:
      m && perSqft
        ? {
            id: m.rate.id,
            locality: m.rate.locality,
            kind: m.rate.kind,
            rate_inr: m.rate.rate_inr,
            unit: m.rate.unit,
            per_sqft: Math.round(perSqft * 100) / 100,
            effective_from: m.rate.effective_from,
            office: m.rate.office,
            matched_on: m.on,
          }
        : null,
    // Rounded to the nearest ₹1,000: it's an official rate × an area, not a precise figure.
    government_value_inr: area && perSqft ? Math.round((area * perSqft) / 1000) * 1000 : null,
    missing,
  };
}
