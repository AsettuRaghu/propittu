import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AI_READABLE_DOCUMENT_TYPES,
  STORAGE_BUCKETS,
  type DocumentAnalysis,
  type DocumentType,
  type PropertyFact,
} from '@propittu/shared';
import type { AuthContext } from '../auth.js';
import { audit } from '../audit.js';
import { env } from '../env.js';
import { HttpError, invalid, must, notFound } from '../errors.js';
import { logger } from '../logger.js';
import { serviceClient } from '../supabase.js';
import { estimateCostUsd } from './pricing.js';
import { removeProperty } from '../propertyRemoval.js';
import { findSameFile, findSameRegistration, sha256 } from './duplicates.js';
import { provider } from './provider.js';
import { saleDeedTask } from './tasks/saleDeed.js';
import { AiOutputError, AiProviderError, type AiTask } from './types.js';

/**
 * Document readings as background jobs (docs/AI_DOCUMENT_INTELLIGENCE.md §5).
 *
 *   requestAnalysis()  checks, then records a QUEUED job (or returns the
 *                      cached one: one reading per document per task version)
 *   processAnalysis()  claims the job, reads the file, calls the model,
 *                      validates, saves facts, logs cost — never throws
 *
 * The API runs processAnalysis right after answering (waitUntil); a status
 * check re-runs any job that is queued or stuck, so nothing needs a scheduler.
 * Results are written with the server key only after validation.
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

interface AnalysisRow {
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

function server(): SupabaseClient {
  if (!serviceClient)
    throw new HttpError(503, 'AI_UNAVAILABLE', 'Pittu is not available right now.');
  return serviceClient;
}

/** Is AI switched on for this account? (kill switch + pilot list + configuration) */
function aiAvailableFor(accountId: string): boolean {
  if (!env.AI_ENABLED || !serviceClient) return false;
  if (env.AI_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY) return false;
  return env.AI_PILOT_ACCOUNTS.length === 0 || env.AI_PILOT_ACCOUNTS.includes(accountId);
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
  const spend = Number((await serviceClient.rpc('ai_month_spend_usd')).data ?? 0);
  return spend < env.AI_MONTHLY_BUDGET_USD;
}

export function assertAiAvailable(accountId: string): void {
  if (!aiAvailableFor(accountId)) {
    throw new HttpError(503, 'AI_UNAVAILABLE', 'Pittu is not available yet.');
  }
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

async function enforceDailyLimit(db: SupabaseClient, accountId: string): Promise<void> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const res = await db
    .from('document_analyses')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .gte('updated_at', since)
    // (neq alone would drop rows whose error_code is NULL)
    .or('error_code.is.null,error_code.neq.too_large');
  must(res);
  if ((res.count ?? 0) >= env.AI_DAILY_READS_PER_ACCOUNT) {
    throw new HttpError(
      429,
      'AI_LIMIT_REACHED',
      'Pittu has read several documents today. Please try again tomorrow.',
    );
  }
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
export async function processAnalysis(analysisId: string): Promise<void> {
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

  const recordOp = (o: {
    model: string;
    providerName: string;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    outcome: 'ok' | 'invalid_output' | 'provider_error' | 'rejected';
    errorCode?: string;
  }) =>
    db.from('ai_operations').insert({
      account_id: job.account_id,
      analysis_id: job.id,
      task: task.name,
      task_version: task.version,
      provider: o.providerName,
      model: o.model,
      input_tokens: o.inputTokens,
      output_tokens: o.outputTokens,
      cost_usd: estimateCostUsd(o.model, o.inputTokens, o.outputTokens),
      duration_ms: o.durationMs,
      outcome: o.outcome,
      error_code: o.errorCode ?? null,
    });

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

    // Seen this exact file before? Reuse that reading — no AI call, no tokens.
    const hash = sha256(bytes);
    await db.from('property_documents').update({ content_sha256: hash }).eq('id', job.document_id);
    const twin = await findSameFile(db, job.account_id, job.document_id, doc.file_size, hash);
    if (twin && (await reuseReading(db, job, twin, task, finish))) {
      log.info('same deed seen before — reading reused, no AI call');
      return;
    }

    // Hard monthly budget: stop before spending, and tell staff via the log.
    const spend = Number((await db.rpc('ai_month_spend_usd')).data ?? 0);
    if (spend >= env.AI_MONTHLY_BUDGET_USD) {
      await finish({ status: 'failed', error_code: 'unavailable' });
      log.error(
        { spendUsd: spend, budgetUsd: env.AI_MONTHLY_BUDGET_USD },
        'AI monthly budget reached — reading paused',
      );
      return;
    }

    const p = provider(task);
    const answer = await p.run({
      model: task.model,
      system: task.system,
      documents: [{ kind: 'pdf', bytes }],
      text: task.userText,
      schema: task.schema,
      maxOutputTokens: task.maxOutputTokens,
    });
    const base = {
      model: answer.model,
      providerName: p.name,
      inputTokens: answer.inputTokens,
      outputTokens: answer.outputTokens,
      durationMs: answer.durationMs,
    };

    let result: unknown;
    try {
      result = task.parse(answer.json);
    } catch (err) {
      const code = err instanceof AiOutputError ? err.code : 'invalid_output';
      await recordOp({ ...base, outcome: 'invalid_output', errorCode: code });
      await finish({
        status: 'failed',
        error_code: code === 'not_a_sale_deed' ? 'not_a_sale_deed' : 'failed',
        model: answer.model,
      });
      log.warn({ code }, 'AI answer rejected by validation');
      return;
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
    await recordOp({ ...base, outcome: 'ok' });
    const registration = facts.find((f) => f.key === 'registration_number')?.value;
    const duplicateOf = await findSameRegistration(
      db,
      job.account_id,
      job.property_id,
      registration,
    );
    await finish({
      status: 'ready',
      error_code: null,
      model: answer.model,
      result,
      duplicate_of: duplicateOf,
    });
    log.info(
      {
        facts: facts.length,
        inputTokens: answer.inputTokens,
        outputTokens: answer.outputTokens,
        ms: answer.durationMs,
      },
      'document analysis ready',
    );
  } catch (err) {
    const e =
      err instanceof AiProviderError ? err : new AiProviderError('unexpected', true, String(err));
    if (e.usage) {
      await recordOp({
        model: task.model,
        providerName: 'anthropic',
        inputTokens: e.usage.inputTokens,
        outputTokens: e.usage.outputTokens,
        durationMs: e.usage.durationMs,
        outcome: 'provider_error',
        errorCode: e.code,
      });
    }
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
    log.error({ code: e.code, retryable: e.retryable, attempts }, 'document analysis error');
  }
}

/* ------------------------------------------------------------------ */

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
