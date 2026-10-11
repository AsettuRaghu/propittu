import type { DisputeItem, PropertyDisputes } from '@propittu/shared';
import { auditPittu } from '../audit.js';
import { deedFactValues, factList, factText } from '../deeds/facts.js';
import { must } from '../errors.js';
import { spellings } from '../watch/rss.js';
import { logger } from '../logger.js';
import { aiAvailableFor, server } from '../pittu/core/limits.js';
import { runTask } from '../pittu/core/run.js';
import { disputesTask } from '../pittu/legal/tasks/disputes.js';
import { relevantDisputes } from './disputeRules.js';

/**
 * Pittu Legal — court cases and disputes (application layer). Pittu
 * searches; these rules decide:
 *
 *  - only items on pages the search really returned;
 *  - about THIS project or THIS land → the team reviews before the owner
 *    sees anything (a wrong "there's a case on your land" does real harm);
 *  - nothing about this project or land → 'clear', told to the owner at
 *    once ("nothing found online, as of today");
 *  - re-checked every 90 days.
 */

const REFRESH_DAYS = 90;
/** Runs (or re-runs) the disputes search for a property. Never throws. */
export async function checkDisputes(propertyId: string): Promise<void> {
  const db = server();
  try {
    const p = must<{
      account_id: string;
      city: string | null;
      state: string | null;
      survey_number: string | null;
    } | null>(
      await db
        .from('properties')
        .select('account_id, city, state, survey_number')
        .eq('id', propertyId)
        .maybeSingle(),
    );
    if (!p || !aiAvailableFor(p.account_id)) return;
    const { values } = await deedFactValues(db, propertyId);
    const text = (k: string) => factText(values.get(k));
    const project = text('project_name');
    const developer = text('developer');
    const village = text('village');
    // Old survey numbers the deed mentions in its history ("Sy.No.83 (Old Sy.No.41)").
    const { data: deedRead } = await db
      .from('document_analyses')
      .select('result')
      .eq('property_id', propertyId)
      .eq('task', 'sale_deed.extract')
      .eq('status', 'ready')
      .order('finished_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const history = JSON.stringify(
      (deedRead?.result as { title_history?: unknown } | null)?.title_history ?? [],
    );
    const old = [...history.matchAll(/old\s*sy\.?\s*no\.?\s*([0-9][0-9/A-Za-z-]*)/gi)].map(
      (m) => `${m[1]} (old)`,
    );
    const surveys = [
      ...new Set([...factList(values.get('survey_numbers')), p.survey_number, ...old]),
    ]
      .filter(Boolean)
      .join(', ');
    // Nothing to search by: no project, no survey number in a village.
    if (!project && !(surveys && village)) return;
    await db.from('property_disputes').upsert({
      property_id: propertyId,
      account_id: p.account_id,
      status: 'working',
    });
    const brief = [
      project ? `Project: ${project}` : null,
      developer ? `Developer: ${developer}` : null,
      surveys && village
        ? `Land: survey number ${surveys}, ${spellings(village).join(' / ')}`
        : null,
      `Place: ${[text('taluk_or_mandal'), text('district'), p.city, p.state].filter(Boolean).join(', ')}`,
      'Find court cases, ownership claims, RERA complaints or government action about this project or this land.',
    ]
      .filter(Boolean)
      .join('\n');
    const { result, sources } = await runTask(
      db,
      disputesTask,
      { documents: [], text: brief },
      { capability: 'legal', accountId: p.account_id },
    );
    const found = relevantDisputes(result.items, sources);
    const status = found.length ? 'in_review' : 'clear';
    await db.from('property_disputes').upsert({
      property_id: propertyId,
      account_id: p.account_id,
      status,
      items: found,
      pittu_note: result.note,
      staff_note: null,
      task_version: disputesTask.version,
      checked_at: new Date().toISOString(),
      reviewed_at: null,
      reviewed_by: null,
    });
    await auditPittu(
      db,
      p.account_id,
      'legal.disputes_checked',
      {
        type: 'property',
        id: propertyId,
      },
      { status, found: found.length },
    );
  } catch (err) {
    logger.warn({ err: String(err), propertyId }, 'disputes check failed');
    await db
      .from('property_disputes')
      .update({ status: 'failed' })
      .eq('property_id', propertyId)
      .then(
        () => undefined,
        () => undefined,
      );
  }
}

/**
 * What the owner may see, and whether a (re)check is due. Read with the
 * server key: while the team reviews, the owner learns only that it's being
 * checked — never the items.
 */
export async function ownerDisputes(
  propertyId: string,
): Promise<{ disputes: PropertyDisputes | null; due: boolean }> {
  const db = server();
  const row = must<{
    status: PropertyDisputes['status'];
    items: DisputeItem[];
    staff_note: string | null;
    checked_at: string | null;
    updated_at: string;
  } | null>(
    await db
      .from('property_disputes')
      .select('status, items, staff_note, checked_at, updated_at')
      .eq('property_id', propertyId)
      .maybeSingle(),
  );
  const age = row ? Date.now() - new Date(row.checked_at ?? row.updated_at).getTime() : Infinity;
  const due =
    !row ||
    (row.status === 'working'
      ? Date.now() - new Date(row.updated_at).getTime() > 10 * 60_000
      : row.status === 'failed'
        ? age > 6 * 3_600_000
        : (row.status === 'clear' || row.status === 'shared') && age > REFRESH_DAYS * 86_400_000);
  if (!row) return { disputes: null, due };
  return {
    disputes: {
      status: row.status,
      items: row.status === 'shared' ? row.items.filter((i) => i.review === 'kept') : [],
      note: row.status === 'shared' ? row.staff_note : null,
      checked_at: row.checked_at,
    },
    due,
  };
}
