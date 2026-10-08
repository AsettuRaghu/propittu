import type { SupabaseClient } from '@supabase/supabase-js';
import type { PropertyValue, ValueRate } from '@propittu/shared';
import { deedFactValues, factList, factNumber, factText } from '../deeds/facts.js';
import { must, notFound } from '../errors.js';
import { computeValue, type ValueInput } from './match.js';

export const RATE_COLUMNS =
  'id, source_id, state, district, office, locality, pincodes, survey_numbers, kind, rate_inr, unit, effective_from, status, page, notes';

/** What Pittu Value needs about a property: its details, the deed's, and its PIN's place. */
export async function valueInput(db: SupabaseClient, propertyId: string): Promise<ValueInput> {
  const p = must<{
    property_type: string;
    state: string | null;
    city: string | null;
    pincode: string | null;
    area_value: number | null;
    area_unit: string | null;
    purchase_price_inr: number | null;
    purchase_date: string | null;
  } | null>(
    await db
      .from('properties')
      .select(
        'property_type, state, city, pincode, area_value, area_unit, purchase_price_inr, purchase_date',
      )
      .eq('id', propertyId)
      .maybeSingle(),
  );
  if (!p) throw notFound('Property');
  const [{ values }, pin] = await Promise.all([
    deedFactValues(db, propertyId),
    p.pincode
      ? db
          .from('pincodes')
          .select('place, district, state, localities')
          .eq('pincode', p.pincode)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const dir = (pin.data ?? null) as {
    place: string;
    district: string;
    state: string;
    localities: string[];
  } | null;
  return {
    property_type: p.property_type,
    state: dir?.state ?? p.state,
    district: dir?.district ?? factText(values.get('district')),
    pincode: p.pincode,
    localities: [
      factText(values.get('village')),
      dir?.place ?? null,
      ...(dir?.localities ?? []),
      p.city,
    ].filter((x): x is string => !!x),
    survey_numbers: factList(values.get('survey_numbers')),
    area_value: p.area_value ?? factNumber(values.get('area_value')),
    area_unit: p.area_unit ?? factText(values.get('area_unit')),
    paid_inr: p.purchase_price_inr ?? factNumber(values.get('sale_consideration_inr')),
    purchase_date: p.purchase_date ?? factText(values.get('registration_date')),
  };
}

/**
 * The property's government value, worked out from its area and the matching
 * published rate. `db` must be able to read rates (staff, or the server key
 * after the caller checked ownership).
 */
export async function propertyValue(
  db: SupabaseClient,
  propertyId: string,
): Promise<PropertyValue> {
  const input = await valueInput(db, propertyId);
  if (!input.state) return computeValue(input, []);
  const rates = must<ValueRate[]>(
    await db
      .from('value_rates')
      .select(RATE_COLUMNS)
      .eq('status', 'published')
      .ilike('state', input.state)
      .limit(5000),
  );
  return computeValue(
    input,
    rates.map((r) => ({ ...r, rate_inr: Number(r.rate_inr) })),
  );
}

/** Every published rate (for valuing many properties at once). */
export async function publishedRates(db: SupabaseClient): Promise<ValueRate[]> {
  return must<ValueRate[]>(
    await db.from('value_rates').select(RATE_COLUMNS).eq('status', 'published').limit(20_000),
  ).map((r) => ({ ...r, rate_inr: Number(r.rate_inr) }));
}
