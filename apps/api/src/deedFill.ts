import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PREFILL_FIELDS,
  PREFILL_SOURCES,
  prefillFromFacts,
  sameFactValue,
  type FactValue,
  type PrefillField,
  type Property,
  type ValueSource,
} from '@propittu/shared';

/**
 * The deed is our most reliable source. When a reading is ready, Pittu
 * applies it once (see properties.deed_synced_analysis):
 *   - empty fields take the deed's value;
 *   - differences Pittu read with HIGH confidence take the deed's value too;
 *   - doubtful differences are left for the owner ("Differs from your deed").
 * The name is the owner's own and is never changed. Values applied are
 * marked as coming from the sale deed.
 */
const FILLABLE = PREFILL_FIELDS.filter((f) => f !== 'name');

const empty = (v: unknown) => v === null || v === undefined || v === '';

type Fact = { key: string; value: FactValue; confidence?: string | null };

/** Read with high confidence: every fact behind the field that the deed has. */
function sure(field: PrefillField, facts: Fact[]): boolean {
  const behind = facts.filter((f) => PREFILL_SOURCES[field].includes(f.key));
  return behind.length > 0 && behind.every((f) => f.confidence === 'high');
}

/** What the deed would fill into this property's empty fields (nothing when nothing). */
export function deedFill(
  property: Property,
  facts: Fact[],
): Partial<Record<PrefillField, string | number>> {
  if (facts.length === 0) return {};
  const deed = prefillFromFacts(facts);
  const patch: Partial<Record<PrefillField, string | number>> = {};
  for (const field of FILLABLE) {
    const value = deed[field];
    const mine = property[field as keyof Property];
    if (empty(value)) continue;
    if (empty(mine) || (!sameFactValue(value, mine) && sure(field, facts))) {
      patch[field] = value as string | number;
    }
  }
  // An area needs its unit.
  if (patch.area_value !== undefined && empty(property.area_unit) && empty(patch.area_unit)) {
    delete patch.area_value;
  }
  return patch;
}

/**
 * Applies a reading once: saves what deedFill decides and records the
 * reading as applied. Returns the updated row (with `columns`), or null
 * when it was already applied.
 */
export async function syncFromDeed(
  db: SupabaseClient,
  property: Property,
  facts: Fact[],
  analysisId: string,
  columns: string,
): Promise<Property | null> {
  const patch = deedFill(property, facts);
  const sources: Partial<Record<string, ValueSource>> = { ...(property.field_sources ?? {}) };
  for (const field of Object.keys(patch)) sources[field] = 'sale_deed';
  const { data, error } = await db
    .from('properties')
    .update({ ...patch, field_sources: sources, deed_synced_analysis: analysisId })
    .eq('id', property.id)
    .select(columns)
    .maybeSingle();
  return error || !data ? null : (data as unknown as Property);
}
