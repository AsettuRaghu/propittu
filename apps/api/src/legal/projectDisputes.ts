import type { SupabaseClient } from '@supabase/supabase-js';
import { projectKey, type ProjectDispute } from '@propittu/shared';
import { deedFactValues, factText } from '../deeds/facts.js';
import { must } from '../errors.js';

/**
 * Disputes for a whole project (application layer). The team confirms one
 * once (often after an owner reported it); every Propittu property whose
 * sale deed names that project — in the same district, when one is given —
 * then shows it. Read with the server key: owners see only their project's.
 */

const PROJECT_COLUMNS =
  'id, project_name, district, summary, what_it_means, what_to_do, source_url, status, created_at, updated_at';

const sameDistrict = (a: string | null, b: string | null) =>
  !a ||
  !b ||
  a
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .includes(
      b
        .toLowerCase()
        .replace(/[^a-z]/g, '')
        .slice(0, 6),
    );

/** The property's project (from its deed), if it names one. */
export async function projectOf(
  db: SupabaseClient,
  propertyId: string,
): Promise<{ key: string; name: string; district: string | null } | null> {
  const { values } = await deedFactValues(db, propertyId);
  const name = factText(values.get('project_name'));
  if (!name) return null;
  const key = projectKey(name);
  return key.length >= 3 ? { key, name, district: factText(values.get('district')) } : null;
}

/** Active disputes the team confirmed for this property's project. */
export async function projectAlerts(
  db: SupabaseClient,
  propertyId: string,
): Promise<ProjectDispute[]> {
  const project = await projectOf(db, propertyId);
  if (!project) return [];
  const rows = must<ProjectDispute[]>(
    await db
      .from('project_disputes')
      .select(PROJECT_COLUMNS)
      .eq('project_key', project.key)
      .order('created_at', { ascending: false }),
  );
  return rows.filter((r) => sameDistrict(r.district, project.district));
}

/** How many Propittu properties' deeds name each project key (for the portal). */
export async function propertiesByProject(db: SupabaseClient): Promise<Map<string, number>> {
  const facts = must<{ property_id: string; value: unknown; final_value: unknown }[]>(
    await db
      .from('property_facts')
      .select('property_id, value, final_value')
      .eq('key', 'project_name')
      .neq('status', 'rejected')
      .limit(20_000),
  );
  const seen = new Map<string, Set<string>>();
  for (const f of facts) {
    const name = (f.final_value ?? f.value) as unknown;
    if (typeof name !== 'string') continue;
    const k = projectKey(name);
    if (!seen.has(k)) seen.set(k, new Set());
    seen.get(k)!.add(f.property_id);
  }
  return new Map([...seen].map(([k, ids]) => [k, ids.size]));
}

/** Every Propittu property (and its account) whose deed names this project. */
export async function propertiesInProject(
  db: SupabaseClient,
  key: string,
): Promise<{ property_id: string; account_id: string }[]> {
  const facts = must<
    { property_id: string; account_id: string; value: unknown; final_value: unknown }[]
  >(
    await db
      .from('property_facts')
      .select('property_id, account_id, value, final_value')
      .eq('key', 'project_name')
      .neq('status', 'rejected')
      .limit(20_000),
  );
  const out = new Map<string, string>();
  for (const f of facts) {
    const name = (f.final_value ?? f.value) as unknown;
    if (typeof name === 'string' && projectKey(name) === key) out.set(f.property_id, f.account_id);
  }
  return [...out].map(([property_id, account_id]) => ({ property_id, account_id }));
}

export { PROJECT_COLUMNS };
