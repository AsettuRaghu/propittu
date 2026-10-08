import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../env.js';
import { logger } from '../../logger.js';
import { monthSpendUsd } from './limits.js';
import { estimateCostUsd } from './pricing.js';
import { provider } from './provider.js';
import { AiOutputError, AiProviderError, type AiTask, type Capability } from './types.js';

/** Who the call is for, so its cost lands on the right line of the log. */
export interface RunContext {
  capability: Capability;
  accountId: string | null;
  analysisId?: string | null;
}

/**
 * The one way any capability calls a model: budget check → provider →
 * validation → cost log (ai_operations, by capability). Returns the task's
 * validated result; throws AiProviderError (code "budget_reached" when the
 * monthly budget is used up) or AiOutputError. Never decides what the result
 * means — that is the application layer's job.
 */
export async function runTask<R>(
  db: SupabaseClient,
  task: AiTask<R>,
  input: { documents: { kind: 'pdf'; bytes: Uint8Array }[]; text?: string },
  ctx: RunContext,
): Promise<{ result: R; model: string }> {
  const spend = await monthSpendUsd(db);
  if (spend >= env.AI_MONTHLY_BUDGET_USD) {
    logger.error(
      { spendUsd: spend, budgetUsd: env.AI_MONTHLY_BUDGET_USD, capability: ctx.capability },
      'AI monthly budget reached — call refused',
    );
    throw new AiProviderError('budget_reached', false, 'The monthly AI budget is used up');
  }

  const log = (o: {
    model: string;
    providerName: string;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    outcome: 'ok' | 'invalid_output' | 'provider_error';
    errorCode?: string;
  }) =>
    db.from('ai_operations').insert({
      capability: ctx.capability,
      account_id: ctx.accountId,
      analysis_id: ctx.analysisId ?? null,
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

  const p = provider(task as AiTask<unknown>);
  let answer;
  try {
    answer = await p.run({
      model: task.model,
      system: task.system,
      documents: input.documents,
      text: input.text ?? task.userText,
      schema: task.schema,
      maxOutputTokens: task.maxOutputTokens,
    });
  } catch (err) {
    const e =
      err instanceof AiProviderError ? err : new AiProviderError('unexpected', true, String(err));
    if (e.usage)
      await log({
        model: task.model,
        providerName: p.name,
        ...e.usage,
        outcome: 'provider_error',
        errorCode: e.code,
      });
    throw e;
  }
  const usage = {
    model: answer.model,
    providerName: p.name,
    inputTokens: answer.inputTokens,
    outputTokens: answer.outputTokens,
    durationMs: answer.durationMs,
  };
  let result: R;
  try {
    result = task.parse(answer.json);
  } catch (err) {
    const code = err instanceof AiOutputError ? err.code : 'invalid_output';
    await log({ ...usage, outcome: 'invalid_output', errorCode: code });
    throw err instanceof AiOutputError ? err : new AiOutputError(code, String(err));
  }
  await log({ ...usage, outcome: 'ok' });
  return { result, model: answer.model };
}
