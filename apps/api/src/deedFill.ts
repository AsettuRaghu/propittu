import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PREFILL_FIELDS,
  prefillFromFacts,
  type FactValue,
  type PrefillField,
  type Property,
  type ValueSource,
} from '@propittu/shared';

/**
 * The deed is our most reliable source: whatever Pittu read that the
 * property doesn't have yet is simply saved — no "please confirm". Only
 * real differences (the owner typed something else) are left for the
 * owner to decide, under "Differs from your deed". The name is the
 * owner's own and is never filled this way. Filled values are marked as
 * coming from the sale deed.
 */
const FILLABLE = PREFILL_FIELDS.filter((f) => f !== 'name');

const empty = (v: unknown) => v === null || v === undefined || v === '';

/** What the deed would fill into this property's empty fields (nothing when nothing). */
export function deedFill(
  property: Property,
  facts: { key: string; value: FactValue }[],
): Partial<Record<PrefillField, string | number>> {
  if (facts.length === 0) return {};
  const deed = prefillFromFacts(facts);
  const patch: Partial<Record<PrefillField, string | number>> = {};
  for (const field of FILLABLE) {
    const value = deed[field];
    if (empty(value) || !empty(property[field as keyof Property])) continue;
    patch[field] = value as string | number;
  }
  // An area needs its unit.
  if (patch.area_value !== undefined && empty(property.area_unit) && empty(patch.area_unit)) {
    delete patch.area_value;
  }
  return patch;
}

/** Saves the deed's values into the empty fields; returns the updated property, or null. */
export async function fillEmptyFromDeed(
  db: SupabaseClient,
  property: Property,
  facts: { key: string; value: FactValue }[],
  columns: string,
): Promise<Property | null> {
  const patch = deedFill(property, facts);
  if (Object.keys(patch).length === 0) return null;
  const sources: Partial<Record<string, ValueSource>> = { ...(property.field_sources ?? {}) };
  for (const field of Object.keys(patch)) sources[field] = 'sale_deed';
  const { data, error } = await db
    .from('properties')
    .update({ ...patch, field_sources: sources })
    .eq('id', property.id)
    .select(columns)
    .maybeSingle();
  return error || !data ? null : (data as unknown as Property);
}
