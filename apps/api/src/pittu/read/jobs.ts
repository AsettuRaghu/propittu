import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AI_READABLE_DOCUMENT_TYPES,
  STORAGE_BUCKETS,
  type DocumentAnalysis,
  type DocumentType,
  type PropertyFact,
} from '@propittu/shared';
import { createHash } from 'node:crypto';
import type { AuthContext } from '../../auth.js';
import { audit } from '../../audit.js';
import { invalid, must, notFound } from '../../errors.js';
import { logger } from '../../logger.js';
import { serviceClient } from '../../supabase.js';
import {
  aiAvailableFor,
  assertAiAvailable,
  budgetLeft,
  enforceDailyLimit,
  server,
} from '../core/limits.js';
import { runTask } from '../core/run.js';
import { AiOutputError, AiProviderError, type AiTask, type ExtractedFact } from '../core/types.js';
import { saleDeedTask } from './tasks/saleDeed.js';

/**
 * Pittu Read — document readings as background jobs
 * (docs/PITTU.md, docs/AI_DOCUMENT_INTELLIGENCE.md §5).
 *
 *   requestAnalysis()  checks, then records a QUEUED job (or returns the
 *                      cached one: one reading per document per task version)
 *   processAnalysis()  claims the job, reads the file, calls the model,
 *                      validates, saves facts, logs cost — never throws
 *
 * The API runs processAnalysis right after answering (waitUntil); a status
 * check re-runs any job that is queued or stuck, so nothing needs a scheduler.
 * Results are written with the server key only after validation. What a
 * reading MEANS for the business (a deed already in the locker, a draft to
 * clear) is decided by the application layer through ReadHooks.
 */

const TASKS: Partial<Record<DocumentType, AiTask<unknown>>> = {
  sale_deed: saleDeedTask as AiTask<unknown>,
};

/** Bigger PDFs need page rendering first (planned); until then they go to staff. */
const MAX_DIRECT_PDF_BYTES = 24 * 1024 * 1024;
const MAX_ATTEMPTS = 3;
const STUCK_AFTER_MS = 3 * 60_000;
/** Codes the customer can retry; the rest are final for this document. */
const RETRYABLE_FAILURES = new Set(['failed', 'unavailable']);

/** Fingerprint of a file (the "never read twice" cache). */
export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/**
 * The application layer's say in a reading. Pittu Read reads and returns
 * facts; these hooks decide what that means.
 */
export interface ReadHooks {
  /**
   * Before any AI call: may an earlier reading of the same file be reused?
   * Return true when the hook has finished the job itself (no AI call).
   */
  reuse?(
    db: SupabaseClient,
    job: AnalysisRow,
    file: { hash: string; size: number },
    task: AiTask<unknown>,
    finish: (fields: Record<string, unknown>) => PromiseLike<unknown>,
  ): Promise<boolean>;
  /** After a reading is saved: extra fields for the job (e.g. duplicate_of). */
  afterRead?(
    db: SupabaseClient,
    job: AnalysisRow,
    facts: ExtractedFact[],
  ): Promise<Record<string, unknown>>;
}

export interface AnalysisRow {
  id: string;
  account_id: string;
  property_id: string;
  document_id: string;
  task: string;
  task_version: string;
  status: DocumentAnalysis['status'];
  attempts: number;
  error_code: string | null;
  started_at: string | null;
  created_at: string;
  finished_at: string | null;
  updated_at: string;
  duplicate_of: string | null;
}
const ANALYSIS_COLUMNS =
  'id, account_id, property_id, document_id, task, task_version, status, attempts, error_code, ' +
  'started_at, created_at, finished_at, updated_at, duplicate_of';

interface DocRow {
  id: string;
  account_id: string;
  property_id: string;
  document_type: DocumentType;
  storage_path: string;
  mime_type: string;
  file_size: number;
  upload_status: 'pending' | 'ready';
}

/**
 * Can this account start a reading right now? Switched on, in the pilot,
 * daily readings left and the monthly budget not used up. Used by GET /me so
 * the app offers the Sale Deed path only when it will actually work.
 */
export async function canStartReading(accountId: string): Promise<boolean> {
  if (!aiAvailableFor(accountId) || !serviceClient) return false;
  try {
    await enforceDailyLimit(serviceClient, accountId);
  } catch {
    return false;
  }
  return budgetLeft(serviceClient);
}

/* ------------------------------------------------------------------ */

export async function requestAnalysis(ctx: AuthContext, documentId: string): Promise<AnalysisRow> {
  assertAiAvailable(ctx.accountId);

  // Ownership through the customer's own client (RLS), never the server key.
  const doc = must<DocRow | null>(
    await ctx.db
      .from('property_documents')
      .select(
        'id, account_id, property_id, document_type, storage_path, mime_type, file_size, upload_status',
      )
      .eq('id', documentId)
      .eq('account_id', ctx.accountId)
      .maybeSingle(),
  );
  if (!doc) throw notFound('Document');
  if (doc.upload_status !== 'ready') throw invalid('The upload has not finished yet');
  const task = TASKS[doc.document_type];
  if (!task || !AI_READABLE_DOCUMENT_TYPES.includes(doc.document_type)) {
    throw invalid('Pittu can only read sale deeds for now');
  }
  if (doc.mime_type !== 'application/pdf') throw invalid('Pittu reads PDF documents');

  const db = server();
  const existing = must<AnalysisRow | null>(
    await db
      .from('document_analyses')
      .select(ANALYSIS_COLUMNS)
      .eq('document_id', doc.id)
      .eq('task', task.name)
      .eq('task_version', task.version)
      .maybeSingle(),
  );
  if (existing) {
    // Cache: never read the same document twice with the same task version.
    if (existing.status !== 'failed' || !RETRYABLE_FAILURES.has(existing.error_code ?? ''))
      return existing;
    await enforceDailyLimit(db, ctx.accountId);
    return must<AnalysisRow>(
      await db
        .from('document_analyses')
        .update({
          status: 'queued',
          attempts: 0,
          error_code: null,
          finished_at: null,
          started_at: null,
        })
        .eq('id', existing.id)
        .select(ANALYSIS_COLUMNS)
        .single(),
    );
  }

  await enforceDailyLimit(db, ctx.accountId);
  const tooLarge = doc.file_size > MAX_DIRECT_PDF_BYTES;
  const row = must<AnalysisRow>(
    await db
      .from('document_analyses')
      .insert({
        account_id: ctx.accountId,
        property_id: doc.property_id,
        document_id: doc.id,
        task: task.name,
        task_version: task.version,
        status: tooLarge ? 'failed' : 'queued',
        error_code: tooLarge ? 'too_large' : null,
        finished_at: tooLarge ? new Date().toISOString() : null,
        requested_by: ctx.userId,
      })
      .select(ANALYSIS_COLUMNS)
      .single(),
  );
  await audit(
    ctx,
    'document.analysis_requested',
    { type: 'document', id: doc.id },
    {
      task: task.name,
      task_version: task.version,
      status: row.status,
    },
  );
  return row;
}

/** Can staff start this failed reading again? (others are final for the document) */
export const isRetryableFailure = (errorCode: string | null) =>
  RETRYABLE_FAILURES.has(errorCode ?? '');

/**
 * Staff "Read again" on a failed reading (Backoffice → Pittu). Same rules
 * as the customer's retry except the daily limit; the monthly budget is
 * still checked when the job runs. Returns false if it cannot be retried.
 */
export async function requeueFailedAnalysis(analysisId: string): Promise<boolean> {
  const db = server();
  const row = must<Pick<AnalysisRow, 'id' | 'account_id' | 'status' | 'error_code'> | null>(
    await db
      .from('document_analyses')
      .select('id, account_id, status, error_code')
      .eq('id', analysisId)
      .maybeSingle(),
  );
  if (!row) throw notFound('Reading');
  if (row.status !== 'failed' || !isRetryableFailure(row.error_code)) return false;
  assertAiAvailable(row.account_id);
  must(
    await db
      .from('document_analyses')
      .update({
        status: 'queued',
        attempts: 0,
        error_code: null,
        finished_at: null,
        started_at: null,
      })
      .eq('id', row.id)
      .eq('status', 'failed'),
  );
  return true;
}

/** True when the job should be (re)started by whoever is looking at it. */
export function needsRun(row: Pick<AnalysisRow, 'status' | 'started_at' | 'attempts'>): boolean {
  if (row.attempts >= MAX_ATTEMPTS) return false;
  if (row.status === 'queued') return true;
  return (
    row.status === 'reading' &&
    !!row.started_at &&
    Date.now() - Date.parse(row.started_at) > STUCK_AFTER_MS
  );
}

/* ------------------------------------------------------------------ */

/** Runs one job end to end. Safe to call concurrently: only one caller claims it. */
export async function processAnalysis(analysisId: string, hooks: ReadHooks = {}): Promise<void> {
  const db = serviceClient;
  if (!db) return;
  const stuckBefore = new Date(Date.now() - STUCK_AFTER_MS).toISOString();

  // Claim atomically (queued, or a reading that got stuck).
  const { data: claimed, error: claimError } = await db
    .from('document_analyses')
    .update({ status: 'reading', started_at: new Date().toISOString() })
    .eq('id', analysisId)
    .lt('attempts', MAX_ATTEMPTS)
    .or(`status.eq.queued,and(status.eq.reading,started_at.lt.${stuckBefore})`)
    .select(ANALYSIS_COLUMNS)
    .maybeSingle();
  if (claimError || !claimed) return;
  const job = claimed as unknown as AnalysisRow;
  await db
    .from('document_analyses')
    .update({ attempts: job.attempts + 1 })
    .eq('id', job.id);

  const task = Object.values(TASKS).find(
    (t) => t?.name === job.task && t.version === job.task_version,
  );
  const log = logger.child({ analysisId: job.id, task: job.task, taskVersion: job.task_version });
  const finish = (fields: Record<string, unknown>) =>
    db
      .from('document_analyses')
      .update({ ...fields, finished_at: new Date().toISOString() })
      .eq('id', job.id);

  if (!task) {
    await finish({ status: 'failed', error_code: 'unknown_task' });
    log.error('analysis for an unknown task version');
    return;
  }

  try {
    const { data: doc } = await db
      .from('property_documents')
      .select('storage_path, document_type, file_size')
      .eq('id', job.document_id)
      .maybeSingle();
    if (!doc) {
      await finish({ status: 'failed', error_code: 'document_missing' });
      return;
    }
    const { data: file, error: dlError } = await db.storage
      .from(STORAGE_BUCKETS.documents)
      .download(doc.storage_path);
    if (dlError || !file)
      throw new AiProviderError('download_failed', true, 'Could not fetch the document');
    const bytes = new Uint8Array(await file.arrayBuffer());

    // Fingerprint once; the application may reuse an earlier reading of the same file.
    const hash = sha256(bytes);
    await db.from('property_documents').update({ content_sha256: hash }).eq('id', job.document_id);
    if (hooks.reuse && (await hooks.reuse(db, job, { hash, size: doc.file_size }, task, finish))) {
      log.info('same file seen before — reading reused, no AI call');
      return;
    }

    let result: unknown;
    let model: string;
    try {
      ({ result, model } = await runTask(
        db,
        task,
        { documents: [{ kind: 'pdf', bytes }] },
        {
          capability: 'read',
          accountId: job.account_id,
          analysisId: job.id,
        },
      ));
    } catch (err) {
      if (err instanceof AiOutputError) {
        await finish({
          status: 'failed',
          error_code: err.code === 'not_a_sale_deed' ? 'not_a_sale_deed' : 'failed',
        });
        log.warn({ code: err.code }, 'AI answer rejected by validation');
        return;
      }
      if (err instanceof AiProviderError && err.code === 'budget_reached') {
        await finish({ status: 'failed', error_code: 'unavailable' });
        return;
      }
      throw err;
    }

    const facts = task.facts(result);
    await db.from('property_facts').delete().eq('analysis_id', job.id);
    if (facts.length) {
      const { error } = await db.from('property_facts').insert(
        facts.map((f) => ({
          account_id: job.account_id,
          property_id: job.property_id,
          analysis_id: job.id,
          document_id: job.document_id,
          key: f.key,
          value: f.value,
          pages: f.pages,
          confidence: f.confidence,
        })),
      );
      if (error) throw new AiProviderError('save_failed', true, error.message);
    }
    const extra = hooks.afterRead ? await hooks.afterRead(db, job, facts) : {};
    await finish({ status: 'ready', error_code: null, model, result, ...extra });
    log.info({ facts: facts.length }, 'document reading ready');
  } catch (err) {
    const e =
      err instanceof AiProviderError ? err : new AiProviderError('unexpected', true, String(err));
    const attempts = job.attempts + 1;
    const giveUp = !e.retryable || attempts >= MAX_ATTEMPTS;
    await db
      .from('document_analyses')
      .update(
        giveUp
          ? { status: 'failed', error_code: 'failed', finished_at: new Date().toISOString() }
          : { status: 'queued', error_code: null },
      )
      .eq('id', job.id);
    log.error({ code: e.code, retryable: e.retryable, attempts }, 'document reading error');
  }
}

/** What the customer sees (through their own client: RLS applies). */
export async function loadAnalysis(
  db: SupabaseClient,
  accountId: string,
  documentId: string,
): Promise<{ data: DocumentAnalysis; row: AnalysisRow } | null> {
  const rows = must<AnalysisRow[]>(
    await db
      .from('document_analyses')
      .select(ANALYSIS_COLUMNS)
      .eq('document_id', documentId)
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(1),
  );
  const row = rows[0];
  if (!row) return null;
  const duplicate = row.duplicate_of
    ? must<{ id: string; name: string } | null>(
        await db
          .from('properties')
          .select('id, name')
          .eq('id', row.duplicate_of)
          .eq('is_draft', false)
          .maybeSingle(),
      )
    : null;
  const facts =
    row.status === 'ready'
      ? must<PropertyFact[]>(
          await db
            .from('property_facts')
            .select('id, key, value, pages, confidence, status, final_value')
            .eq('analysis_id', row.id)
            .order('key'),
        )
      : [];
  return {
    row,
    data: {
      id: row.id,
      document_id: row.document_id,
      task: row.task,
      task_version: row.task_version,
      status: row.status,
      error_code: row.error_code,
      created_at: row.created_at,
      finished_at: row.finished_at,
      facts,
      duplicate_of: duplicate,
    },
  };
}
