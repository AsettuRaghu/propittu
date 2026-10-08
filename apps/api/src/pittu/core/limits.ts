import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../env.js';
import { HttpError, must } from '../../errors.js';
import { serviceClient } from '../../supabase.js';

/**
 * When Pittu may spend money: the kill switch, the pilot list, the provider
 * key, a daily cap per account and the hard monthly budget. Shared by every
 * capability so the budget is one budget.
 */

export function server(): SupabaseClient {
  if (!serviceClient)
    throw new HttpError(503, 'AI_UNAVAILABLE', 'Pittu is not available right now.');
  return serviceClient;
}

/** Is Pittu switched on for this account? (kill switch + pilot list + configuration) */
export function aiAvailableFor(accountId: string): boolean {
  if (!env.AI_ENABLED || !serviceClient) return false;
  if (env.AI_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY) return false;
  return env.AI_PILOT_ACCOUNTS.length === 0 || env.AI_PILOT_ACCOUNTS.includes(accountId);
}

export function assertAiAvailable(accountId: string): void {
  if (!aiAvailableFor(accountId)) {
    throw new HttpError(503, 'AI_UNAVAILABLE', 'Pittu is not available yet.');
  }
}

/** This calendar month's AI spend (UTC) across every capability. */
export async function monthSpendUsd(db: SupabaseClient): Promise<number> {
  return Number((await db.rpc('ai_month_spend_usd')).data ?? 0);
}

export async function budgetLeft(db: SupabaseClient): Promise<boolean> {
  return (await monthSpendUsd(db)) < env.AI_MONTHLY_BUDGET_USD;
}

/** Document readings per account per day (failed "too large" ones don't count). */
export async function enforceDailyLimit(db: SupabaseClient, accountId: string): Promise<void> {
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
