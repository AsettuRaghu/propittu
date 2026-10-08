import type { SupabaseClient } from '@supabase/supabase-js';
import { processAnalysis, type AnalysisRow, type ReadHooks } from '../pittu/index.js';
import type { AiTask } from '../pittu/core/types.js';
import { removeProperty } from '../propertyRemoval.js';
import { findSameFile, findSameRegistration } from './duplicates.js';

/**
 * Document readings — the application layer's side of Pittu Read. Pittu
 * reads and returns facts; here we decide what a SALE DEED reading means for
 * the locker (other documents, e.g. an EC, have no such rules here):
 *
 *   reuse      the same file is already in the account → copy that reading
 *              (no AI cost) and say which property it belongs to
 *   afterRead  the same registration number is already confirmed for another
 *              property → mark the reading as a duplicate of it
 */
const SALE_DEED = 'sale_deed.extract';
const deedHooks: ReadHooks = {
  async reuse(db, job, file, task, finish) {
    if (task.name !== SALE_DEED) return false;
    const twin = await findSameFile(db, job.account_id, job.document_id, file.size, file.hash);
    return twin ? reuseReading(db, job, twin, task, finish) : false;
  },
  async afterRead(db, job, facts) {
    if (job.task !== SALE_DEED) return {};
    const registration = facts.find((f) => f.key === 'registration_number')?.value;
    return {
      duplicate_of: await findSameRegistration(db, job.account_id, job.property_id, registration),
    };
  },
};

/** Run a queued reading (safe to call more than once); sale-deed rules apply to deeds only. */
export const readDocument = (analysisId: string) => processAnalysis(analysisId, deedHooks);

/**
 * The same file was read before (or belongs to a property already in the
 * locker): copy that reading instead of paying for a new one, and say whose
 * it is. An older unfinished attempt with the same deed is cleared away.
 */
async function reuseReading(
  db: SupabaseClient,
  job: AnalysisRow,
  twin: { id: string; property_id: string },
  task: AiTask<unknown>,
  finish: (fields: Record<string, unknown>) => PromiseLike<unknown>,
): Promise<boolean> {
  const { data: owner } = await db
    .from('properties')
    .select('id, is_draft')
    .eq('id', twin.property_id)
    .maybeSingle();
  if (!owner || owner.id === job.property_id) return false;
  const duplicateOf = owner.is_draft ? null : (owner.id as string);
  const { data: prior } = await db
    .from('document_analyses')
    .select('id, result, model')
    .eq('document_id', twin.id)
    .eq('task', task.name)
    .eq('task_version', task.version)
    .eq('status', 'ready')
    .maybeSingle();

  if (prior) {
    const { data: facts } = await db
      .from('property_facts')
      .select('key, value, pages, confidence')
      .eq('analysis_id', prior.id);
    await db.from('property_facts').delete().eq('analysis_id', job.id);
    if (facts?.length) {
      await db.from('property_facts').insert(
        facts.map((f) => ({
          ...f,
          account_id: job.account_id,
          property_id: job.property_id,
          analysis_id: job.id,
          document_id: job.document_id,
        })),
      );
    }
    await finish({
      status: 'ready',
      error_code: null,
      result: prior.result,
      model: prior.model,
      duplicate_of: duplicateOf,
    });
  } else if (duplicateOf) {
    // Already in the locker but never read: nothing to copy, nothing to spend.
    await finish({ status: 'ready', error_code: null, duplicate_of: duplicateOf });
  } else {
    return false;
  }
  if (owner.is_draft) await removeProperty(db, job.account_id, owner.id as string);
  return true;
}
