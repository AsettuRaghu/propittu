import type { SupabaseClient } from '@supabase/supabase-js';
import type { FactValue, PittuContext, PittuStory, TitleEvent } from '@propittu/shared';
import { must } from '../errors.js';
import { factList, factNumber, factText } from './facts.js';

/**
 * What the property's sale deed says, for Pittu's questions (context) and
 * for telling it back to the owner (story): the facts as the customer kept
 * them, plus the deed's own account of earlier owners (sale-deed-v3+).
 */
export async function deedStory(
  db: SupabaseClient,
  propertyId: string,
): Promise<{ deed: PittuContext['deed']; story: PittuStory | null }> {
  const analysis = must<{ id: string; result: { title_history?: TitleEvent[] } | null } | null>(
    await db
      .from('document_analyses')
      .select('id, result')
      .eq('property_id', propertyId)
      .eq('task', 'sale_deed.extract')
      .eq('status', 'ready')
      .order('finished_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (!analysis) return { deed: undefined, story: null };
  const rows = must<{ key: string; value: FactValue; final_value: FactValue | null }[]>(
    await db
      .from('property_facts')
      .select('key, value, final_value')
      .eq('analysis_id', analysis.id)
      .neq('status', 'rejected'),
  );
  const v = new Map(rows.map((r) => [r.key, r.final_value ?? r.value]));
  const text = (k: string) => factText(v.get(k));
  const history = Array.isArray(analysis.result?.title_history)
    ? analysis.result.title_history
    : [];
  return {
    deed: {
      unit_number: text('unit_number'),
      project_name: text('project_name'),
      developer: text('developer'),
      sellers: factList(v.get('sellers')),
      city: text('city'),
      district: text('district'),
      taluk: text('taluk_or_mandal'),
      ptin: text('ptin'),
    },
    story: {
      project_name: text('project_name'),
      developer: text('developer'),
      floor: text('floor'),
      block_or_tower: text('block_or_tower'),
      village: text('village'),
      city: text('city'),
      survey_numbers: factList(v.get('survey_numbers')),
      khata_number: text('khata_number'),
      sellers: factList(v.get('sellers')),
      bought_on: text('registration_date') ?? text('execution_date'),
      price_inr: factNumber(v.get('sale_consideration_inr')),
      history,
    },
  };
}
