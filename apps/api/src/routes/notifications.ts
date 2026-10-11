import { Router } from 'express';
import { z } from 'zod';
import type { AppNotification, NotificationInbox } from '@propittu/shared';
import { auth } from '../auth.js';
import { must, ok } from '../errors.js';

/**
 * The owner's notifications (see notify.ts): the inbox behind the bell on
 * Home, and the phones push notifications go to.
 *
 *   GET    /notifications             newest 50, and how many are unread
 *   POST   /notifications/read        {ids?} — none given: all read
 *   POST   /me/push-token             {token, platform} — this phone
 *   DELETE /me/push-token             {token} — signing out on this phone
 */
export const notificationsRouter = Router();

notificationsRouter.get('/notifications', async (req, res) => {
  const { db, accountId } = auth(req);
  const [items, unread] = await Promise.all([
    db
      .from('notifications')
      .select('id, kind, title, body, url, created_at, read_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(50),
    db
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .is('read_at', null),
  ]);
  const data: NotificationInbox = {
    items: must<AppNotification[]>(items),
    unread: unread.count ?? 0,
  };
  ok(res, data);
});

notificationsRouter.post('/notifications/read', async (req, res) => {
  const { db, accountId } = auth(req);
  const { ids } = z.object({ ids: z.array(z.guid()).max(200).optional() }).parse(req.body ?? {});
  let q = db
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .is('read_at', null);
  if (ids?.length) q = q.in('id', ids);
  must(await q);
  ok(res, { ok: true });
});

const tokenSchema = z.object({
  token: z.string().trim().min(10).max(300),
  platform: z.enum(['ios', 'android', 'web']).optional(),
});

notificationsRouter.post('/me/push-token', async (req, res) => {
  const { db, accountId, userId } = auth(req);
  const { token, platform } = tokenSchema.parse(req.body);
  must(
    await db.from('push_tokens').upsert(
      {
        token,
        platform: platform ?? null,
        user_id: userId,
        account_id: accountId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' },
    ),
  );
  ok(res, { ok: true });
});

notificationsRouter.delete('/me/push-token', async (req, res) => {
  const { db } = auth(req);
  const { token } = tokenSchema.pick({ token: true }).parse(req.body);
  must(await db.from('push_tokens').delete().eq('token', token));
  ok(res, { ok: true });
});
