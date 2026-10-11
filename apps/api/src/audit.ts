import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthContext } from './auth.js';
import { logger } from './logger.js';

/**
 * Records an important business event (M11) in audit_events, and prints
 * the same event in the API log with the request id (x-request-id), so a
 * database entry and its log line can always be matched. Append-only;
 * customers cannot read the log, staff can. Row-level changes are
 * recorded separately by database triggers ("db.<table>.<op>").
 *
 * Never throws: an audit failure is logged but must not fail the
 * customer's action.
 */
export async function audit(
  ctx: Pick<AuthContext, 'db' | 'accountId' | 'userId'> & { requestId?: string },
  action: string,
  entity?: { type: string; id: string },
  data: Record<string, unknown> = {},
  actorType: 'user' | 'staff' = 'user',
  targetAccountId?: string,
): Promise<void> {
  const accountId = targetAccountId ?? ctx.accountId;
  logger.info(
    {
      audit: { action, actor: actorType, userId: ctx.userId, accountId, entity },
      reqId: ctx.requestId,
    },
    `audit ${action}`,
  );
  const { error } = await ctx.db.from('audit_events').insert({
    account_id: accountId,
    actor_user_id: ctx.userId,
    actor_type: actorType,
    action,
    entity_type: entity?.type ?? null,
    entity_id: entity?.id ?? null,
    data,
  });
  if (error) logger.warn({ err: error, action }, 'audit event not recorded');
}

/**
 * Something Pittu did by itself (no person asked): marked tax paid from a
 * receipt, answered a question from a document, filled a record number,
 * started an EC check, priced a property… Recorded as actor "system" with
 * the server key, so the owner's and the team's history shows it.
 */
export async function auditPittu(
  db: SupabaseClient,
  accountId: string,
  action: string,
  entity: { type: string; id: string },
  data: Record<string, unknown> = {},
): Promise<void> {
  logger.info({ audit: { action, actor: 'system', accountId, entity } }, `audit ${action}`);
  const { error } = await db.from('audit_events').insert({
    account_id: accountId,
    actor_user_id: null,
    actor_type: 'system',
    action,
    entity_type: entity.type,
    entity_id: entity.id,
    data: { by: 'pittu', ...data },
  });
  if (error) logger.warn({ err: error, action }, 'audit event not recorded');
}
