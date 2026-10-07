import { Router } from 'express';
import { z } from 'zod';
import {
  isValidAnswer,
  reviewReasons,
  type PittuAnswers,
  type PittuContext,
  type PittuState,
  type ReviewFact,
  type ReviewReason,
} from '@propittu/shared';
import { auth, type AuthContext } from '../auth.js';
import { audit } from '../audit.js';
import { invalid, must, notFound, ok, uuidParam } from '../errors.js';
import { logger } from '../logger.js';
import { serviceClient } from '../supabase.js';

/**
 * Pittu guided setup (docs/PITTU_PROPERTY_SETUP.md). The questions, their
 * wording and the care plan are shared rules (packages/shared/src/pittu.ts);
 * this router supplies the context and stores validated answers.
 *
 *   GET /properties/:id/pittu                      context + answers so far
 *   PUT /properties/:id/pittu/answers/:questionId  {answer}
 */
export const pittuRouter = Router();

async function loadState(ctx: AuthContext, propertyId: string): Promise<PittuState> {
  const property = must<{
    id: string;
    state: string | null;
    property_type: string;
    khata_number: string | null;
  } | null>(
    await ctx.db
      .from('properties')
      .select('id, state, property_type, khata_number')
      .eq('id', propertyId)
      .eq('account_id', ctx.accountId)
      .maybeSingle(),
  );
  if (!property) throw notFound('Property');

  const [docs, profile, answers, buyers] = await Promise.all([
    ctx.db
      .from('property_documents')
      .select('document_type')
      .eq('property_id', propertyId)
      .eq('account_id', ctx.accountId)
      .eq('upload_status', 'ready'),
    ctx.db.from('profiles').select('full_name').eq('id', ctx.userId).maybeSingle(),
    ctx.db
      .from('property_answers')
      .select('question_id, answer')
      .eq('property_id', propertyId)
      .eq('account_id', ctx.accountId),
    // Buyers from the sale deed reading (the customer's correction wins).
    ctx.db
      .from('property_facts')
      .select('value, final_value, status')
      .eq('property_id', propertyId)
      .eq('account_id', ctx.accountId)
      .eq('key', 'buyers')
      .neq('status', 'rejected')
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  const fact = must<{ value: unknown; final_value: unknown }[]>(buyers)[0];
  const list = (fact?.final_value ?? fact?.value) as unknown;
  const context: PittuContext = {
    state: property.state,
    property_type: property.property_type,
    buyers: Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [],
    account_name: must<{ full_name: string | null } | null>(profile)?.full_name ?? null,
    khata_number: property.khata_number,
    documents: [...new Set(must<{ document_type: string }[]>(docs).map((d) => d.document_type))],
  };
  const saved: PittuAnswers = Object.fromEntries(
    must<{ question_id: string; answer: string }[]>(answers).map((a) => [a.question_id, a.answer]),
  );
  return { context, answers: saved };
}

pittuRouter.get('/properties/:id/pittu', async (req, res) => {
  const ctx = auth(req);
  ok(res, await loadState(ctx, uuidParam(req.params.id, 'Property')));
});

const answerSchema = z.object({ answer: z.string().regex(/^[a-z][a-z_]{0,40}$/) });

pittuRouter.put('/properties/:id/pittu/answers/:questionId', async (req, res) => {
  const ctx = auth(req);
  const propertyId = uuidParam(req.params.id, 'Property');
  const questionId = String(req.params.questionId);
  const { answer } = answerSchema.parse(req.body);
  const state = await loadState(ctx, propertyId);
  if (!isValidAnswer(state.context, state.answers, questionId, answer)) {
    throw invalid('That answer does not fit this question');
  }
  must(
    await ctx.db.from('property_answers').upsert(
      {
        property_id: propertyId,
        account_id: ctx.accountId,
        question_id: questionId,
        answer,
        answered_by: ctx.userId,
        answered_at: new Date().toISOString(),
      },
      { onConflict: 'property_id,question_id' },
    ),
  );
  await audit(
    ctx,
    'property.pittu_answered',
    { type: 'property', id: propertyId },
    { question: questionId },
  );
  const next: PittuState = { ...state, answers: { ...state.answers, [questionId]: answer } };
  await refreshReview(ctx, propertyId, next);
  ok(res, next);
});

/**
 * Keeps the property's row on the staff Review list current (reasons are
 * shared rules: reviewReasons). Written with the server key — customers
 * cannot see or change it. A reviewed property reopens only for a NEW
 * reason. Never fails the customer's request.
 */
export async function refreshReview(
  ctx: AuthContext,
  propertyId: string,
  state?: PittuState,
): Promise<void> {
  const db = serviceClient;
  if (!db) return;
  try {
    const s = state ?? (await loadState(ctx, propertyId));
    const facts = must<ReviewFact[]>(
      await ctx.db
        .from('property_facts')
        .select('key, status, confidence')
        .eq('property_id', propertyId)
        .eq('account_id', ctx.accountId)
        .neq('status', 'superseded'),
    );
    const reasons = reviewReasons(s.context, s.answers, facts);
    const existing = must<{ reasons: ReviewReason[]; status: 'open' | 'done' } | null>(
      await db
        .from('property_reviews')
        .select('reasons, status')
        .eq('property_id', propertyId)
        .maybeSingle(),
    );
    const same = (a: string[], b: string[]) =>
      a.length === b.length && a.every((r) => b.includes(r));

    if (!existing) {
      if (reasons.length > 0) {
        must(
          await db
            .from('property_reviews')
            .insert({ property_id: propertyId, account_id: ctx.accountId, reasons }),
        );
      }
    } else if (existing.status === 'open') {
      if (reasons.length === 0) {
        must(await db.from('property_reviews').delete().eq('property_id', propertyId));
      } else if (!same(reasons, existing.reasons)) {
        must(await db.from('property_reviews').update({ reasons }).eq('property_id', propertyId));
      }
    } else if (reasons.some((r) => !existing.reasons.includes(r))) {
      must(
        await db
          .from('property_reviews')
          .update({ reasons, status: 'open' })
          .eq('property_id', propertyId),
      );
    }
  } catch (err) {
    logger.warn({ err, propertyId }, 'Pittu review refresh failed');
  }
}
