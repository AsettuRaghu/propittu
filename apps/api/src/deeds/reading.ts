import type { SupabaseClient } from '@supabase/supabase-js';
import type { DocumentReading } from '@propittu/shared';
import { actOnReading } from '../documents/pittu.js';
import { auditPittu } from '../audit.js';
import { createEcCheck } from '../legal/checks.js';
import { logger } from '../logger.js';
import {
  processAnalysis,
  queueAutoReading,
  type AnalysisRow,
  type ReadHooks,
} from '../pittu/index.js';
import type { AiTask } from '../pittu/core/types.js';
import { removeProperty } from '../propertyRemoval.js';
import { findSameFile, findSameRegistration } from './duplicates.js';

/**
 * Document readings — the application layer's side of Pittu Read. Pittu
 * reads and returns facts; here we decide what a SALE DEED reading means for
 * the locker, and what a short document's reading means (documents/pittu.ts):
 *
 *   reuse      the same file is already in the account → copy that reading
 *              (no AI cost) and say which property it belongs to
 *   afterRead  the same registration number is already confirmed for another
 *              property → mark the reading as a duplicate of it
 */
const SALE_DEED = 'sale_deed.extract';
const DOCUMENT_READ = 'document.read';
const EC_READ = 'encumbrance.extract';
const deedHooks: ReadHooks = {
  async reuse(db, job, file, task, finish) {
    const twin = await findSameFile(db, job.account_id, job.document_id, file.size, file.hash);
    if (!twin) return false;
    if (task.name === SALE_DEED) return reuseReading(db, job, twin, task, finish);
    // Any other document uploaded twice: copy the reading, no new AI cost.
    const { data: prior } = await db
      .from('document_analyses')
      .select('result, model')
      .eq('document_id', twin.id)
      .eq('task', task.name)
      .eq('task_version', task.version)
      .eq('status', 'ready')
      .maybeSingle();
    if (!prior) return false;
    await finish({ status: 'ready', error_code: null, model: prior.model, result: prior.result });
    await afterOther(db, job, prior.result);
    return true;
  },
  async afterReady(db, job, result) {
    if (job.task !== SALE_DEED) await afterOther(db, job, result);
  },
  async afterRead(db, job, facts) {
    if (job.task !== SALE_DEED) return {};
    if (job.task !== SALE_DEED) return {};
    const registration = facts.find((f) => f.key === 'registration_number')?.value;
    return {
      duplicate_of: await findSameRegistration(db, job.account_id, job.property_id, registration),
    };
  },
};

/**
 * What a reading of another document leads to: a short document → acted on
 * (tax paid, Khata answered…); an EC → the EC check, for the team to review.
 */
async function afterOther(db: SupabaseClient, job: AnalysisRow, result: unknown): Promise<void> {
  if (job.task === DOCUMENT_READ) return actOnReading(db, job, result as DocumentReading);
  if (job.task === EC_READ) {
    const { data: existing } = await db
      .from('legal_checks')
      .select('id')
      .eq('ec_document_id', job.document_id)
      .limit(1);
    if (existing?.length) return;
    try {
      const id = await createEcCheck(db, job.property_id, job.document_id, null);
      await auditPittu(
        db,
        job.account_id,
        'legal.check_started',
        { type: 'legal_check', id },
        {
          document_id: job.document_id,
        },
      );
    } catch (err) {
      logger.warn({ err: String(err), documentId: job.document_id }, 'automatic EC check failed');
    }
  }
}

/** Run a queued reading (safe to call more than once); sale-deed rules apply to deeds only. */
export const readDocument = (analysisId: string) => processAnalysis(analysisId, deedHooks);

/** Pittu reads a just-uploaded Khata, tax receipt, land record… by itself (never throws). */
export async function autoReadDocument(documentId: string): Promise<void> {
  const id = await queueAutoReading(documentId).catch(() => null);
  if (id) await readDocument(id);
}

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
