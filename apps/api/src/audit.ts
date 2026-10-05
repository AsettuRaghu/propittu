import type { AuthContext } from './auth.js';
import { logger } from './logger.js';

/**
 * Records an important business event (M11). Append-only; customers
 * cannot read the log, staff can.
 *
 * Never throws: an audit failure is logged but must not fail the
 * customer's action.
 */
export async function audit(
  ctx: Pick<AuthContext, 'db' | 'accountId' | 'userId'>,
  action: string,
  entity?: { type: string; id: string },
  data: Record<string, unknown> = {},
  actorType: 'user' | 'staff' = 'user',
): Promise<void> {
  const { error } = await ctx.db.from('audit_events').insert({
    account_id: ctx.accountId,
    actor_user_id: ctx.userId,
    actor_type: actorType,
    action,
    entity_type: entity?.type ?? null,
    entity_id: entity?.id ?? null,
    data,
  });
  if (error) logger.warn({ err: error, action }, 'audit event not recorded');
}
