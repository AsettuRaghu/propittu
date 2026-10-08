import type { SupabaseClient } from '@supabase/supabase-js';
import type { FactValue } from '@propittu/shared';
import { must } from '../errors.js';

/**
 * The property's latest sale-deed reading, as the customer kept it: each
 * fact's final value (or what Pittu read), never the ones they rejected.
 */
export async function deedFactValues(
  db: SupabaseClient,
  propertyId: string,
): Promise<{ values: Map<string, FactValue>; documentId: string | null }> {
  const analysis = must<{ id: string; document_id: string } | null>(
    await db
      .from('document_analyses')
      .select('id, document_id')
      .eq('property_id', propertyId)
      .eq('task', 'sale_deed.extract')
      .eq('status', 'ready')
      .order('finished_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (!analysis) return { values: new Map(), documentId: null };
  const rows = must<{ key: string; value: FactValue; final_value: FactValue | null }[]>(
    await db
      .from('property_facts')
      .select('key, value, final_value, status')
      .eq('analysis_id', analysis.id)
      .neq('status', 'rejected'),
  );
  return {
    values: new Map(rows.map((r) => [r.key, r.final_value ?? r.value])),
    documentId: analysis.document_id,
  };
}

export const factList = (v: FactValue | undefined): string[] =>
  Array.isArray(v) ? v.map(String) : typeof v === 'string' && v.trim() ? [v.trim()] : [];
export const factText = (v: FactValue | undefined): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;
export const factNumber = (v: FactValue | undefined): number | null =>
  typeof v === 'number'
    ? v
    : typeof v === 'string' && Number.isFinite(Number(v))
      ? Number(v)
      : null;
