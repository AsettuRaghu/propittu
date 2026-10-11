import { Router } from 'express';
import { z } from 'zod';
import { askSchema, type AskMessage } from '@propittu/shared';
import { accountFile, catalogue, propertyFile } from '../ask/context.js';
import { auth } from '../auth.js';
import { HttpError, must, ok } from '../errors.js';
import { assertOwnsProperty } from '../ownership.js';
import { aiAvailableFor, server } from '../pittu/core/limits.js';
import { runTask } from '../pittu/core/run.js';
import { askTask } from '../pittu/ask/tasks/answer.js';

/**
 * Ask Pittu — questions about the owner's property, answered from their own
 * property file (src/ask/context.ts); a handover to our team when Pittu
 * can't answer. The thread is kept per property (or "all my properties").
 *
 *   GET  /ask?property_id=   the conversation so far
 *   POST /ask                {property_id?, question} → Pittu's answer
 */
export const askRouter = Router();

const DAILY_QUESTIONS = 40;
const COLUMNS = 'id, role, text, meta, created_at';

askRouter.get('/ask', async (req, res) => {
  const { db, accountId } = auth(req);
  const { property_id } = z.object({ property_id: z.guid().optional() }).parse(req.query);
  let q = db
    .from('ask_messages')
    .select(COLUMNS)
    .eq('account_id', accountId)
    .order('created_at', { ascending: true })
    .limit(100);
  q = property_id ? q.eq('property_id', property_id) : q.is('property_id', null);
  ok(res, must<AskMessage[]>(await q));
});

askRouter.post('/ask', async (req, res) => {
  const ctx = auth(req);
  const { property_id, question } = askSchema.parse(req.body);
  if (property_id) await assertOwnsProperty(ctx.db, ctx.accountId, property_id);
  if (!aiAvailableFor(ctx.accountId)) {
    throw new HttpError(503, 'AI_UNAVAILABLE', 'Pittu isn’t available for your account yet.');
  }
  const db = server();
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await db
    .from('ask_messages')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', ctx.accountId)
    .eq('role', 'owner')
    .gte('created_at', since);
  if ((count ?? 0) >= DAILY_QUESTIONS) {
    throw new HttpError(
      429,
      'LIMIT_REACHED',
      'That’s a lot of questions today — Pittu will be back tomorrow. Our team can help in the meantime.',
    );
  }

  let thread = db
    .from('ask_messages')
    .select('role, text')
    .eq('account_id', ctx.accountId)
    .order('created_at', { ascending: false })
    .limit(8);
  thread = property_id ? thread.eq('property_id', property_id) : thread.is('property_id', null);
  const [file, services, earlier] = await Promise.all([
    property_id ? propertyFile(ctx.db, db, property_id) : accountFile(ctx.db, ctx.accountId),
    catalogue(db),
    thread,
  ]);
  const history = ((earlier.data ?? []) as { role: string; text: string }[])
    .reverse()
    .map((m) => `${m.role === 'owner' ? 'OWNER' : 'PITTU'}: ${m.text}`)
    .join('\n');
  const text = [
    `TODAY: ${new Date().toISOString().slice(0, 10)}`,
    file,
    services,
    history ? `CONVERSATION SO FAR:\n${history}` : null,
    `OWNER ASKS: ${question}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const mine = must<AskMessage>(
    await db
      .from('ask_messages')
      .insert({
        account_id: ctx.accountId,
        property_id: property_id ?? null,
        role: 'owner',
        text: question,
        created_by: ctx.userId,
      })
      .select(COLUMNS)
      .single(),
  );
  const { result } = await runTask(
    db,
    askTask,
    { documents: [], text },
    { capability: 'ask', accountId: ctx.accountId },
  );
  const answer = must<AskMessage>(
    await db
      .from('ask_messages')
      .insert({
        account_id: ctx.accountId,
        property_id: property_id ?? null,
        role: 'pittu',
        text: result.answer,
        meta: {
          sources: result.sources,
          service_code: result.service_code,
          needs_team: result.needs_team,
          follow_ups: result.follow_ups,
        },
      })
      .select(COLUMNS)
      .single(),
  );
  ok(res, { question: mine, answer });
});
