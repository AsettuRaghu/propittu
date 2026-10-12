import { Router } from 'express';
import { z } from 'zod';
import {
  isValidAnswer,
  financialYearStart,
  reviewReasons,
  saleReadiness,
  successionPlan,
  type PittuAnswers,
  type PittuContext,
  type PittuState,
  type ReviewFact,
  type ReviewReason,
} from '@propittu/shared';
import { auth, type AuthContext } from '../auth.js';
import { audit } from '../audit.js';
import { deedStory } from '../deeds/story.js';
import { projectAlerts } from '../legal/projectDisputes.js';
import { propertyValue } from '../value/value.js';
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

  const [docs, profile, answers, buyers, told] = await Promise.all([
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
    deedStory(ctx.db, propertyId),
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
    deed: told.deed,
  };
  const saved: PittuAnswers = Object.fromEntries(
    must<{ question_id: string; answer: string }[]>(answers).map((a) => [a.question_id, a.answer]),
  );
  return { context, answers: saved, story: told.story };
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
    const computed = reviewReasons(s.context, s.answers, facts);
    const existing = must<{ reasons: ReviewReason[]; status: 'open' | 'done' } | null>(
      await db
        .from('property_reviews')
        .select('reasons, status')
        .eq('property_id', propertyId)
        .maybeSingle(),
    );
    // Set after Pittu reads a document (src/documents/pittu.ts), not by these rules: kept.
    const reasons: ReviewReason[] = existing?.reasons.includes('document_differs')
      ? [...computed, 'document_differs']
      : computed;
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

/**
 * GET /properties/:id/succession — "Ready for your family": what heirs
 * would need for this property and what's in place (shared rules:
 * successionPlan). People and nominees are counted with the server key.
 */
pittuRouter.get('/properties/:id/succession', async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Property');
  const state = await loadState(ctx, id);
  const db = serviceClient;
  const [members, nominees, prop] = await Promise.all([
    db
      ? db
          .from('account_members')
          .select('user_id', { count: 'exact', head: true })
          .eq('account_id', ctx.accountId)
          .eq('role', 'member')
      : Promise.resolve({ count: 0 }),
    db
      ? db
          .from('account_nominees')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', ctx.accountId)
      : Promise.resolve({ count: 0 }),
    ctx.db.from('properties').select('loan_on_property').eq('id', id).maybeSingle(),
  ]);
  ok(
    res,
    successionPlan({
      ctx: state.context,
      family_members: members.count ?? 0,
      nominees: nominees.count ?? 0,
      loan_on_property: (prop.data?.loan_on_property as boolean | null) ?? null,
    }),
  );
});

/**
 * GET /properties/:id/sale-ready — what a buyer's lawyer and bank will ask
 * for, and what's missing (shared rules: saleReadiness).
 */
pittuRouter.get('/properties/:id/sale-ready', async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Property');
  const state = await loadState(ctx, id);
  const db = serviceClient;
  const [ec, tax, prop, review, alerts, value] = await Promise.all([
    ctx.db
      .from('document_analyses')
      .select('result')
      .eq('property_id', id)
      .eq('task', 'encumbrance.extract')
      .eq('status', 'ready')
      .order('finished_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    ctx.db
      .from('property_answers')
      .select('answer, answered_at')
      .eq('property_id', id)
      .eq('question_id', 'tax_paid')
      .maybeSingle(),
    ctx.db.from('properties').select('loan_on_property').eq('id', id).maybeSingle(),
    db
      ? db.from('property_reviews').select('reasons, status').eq('property_id', id).maybeSingle()
      : Promise.resolve({ data: null }),
    db ? projectAlerts(db, id).catch(() => []) : Promise.resolve([]),
    db ? propertyValue(db, id).catch(() => null) : Promise.resolve(null),
  ]);
  const r = ec.data?.result as { period_from?: string | null; period_to?: string | null } | null;
  const years =
    r?.period_from && r.period_to
      ? Math.round((Date.parse(r.period_to) - Date.parse(r.period_from)) / (365.25 * 86_400_000))
      : null;
  const t = tax.data as { answer: string; answered_at: string } | null;
  const reviewRow = review.data as { reasons: string[]; status: string } | null;
  ok(
    res,
    saleReadiness({
      ctx: state.context,
      answers: state.answers,
      ec_years: years,
      project_dispute: alerts.some((a) => a.status === 'active'),
      names_differ:
        !!reviewRow?.reasons.includes('document_differs') && reviewRow.status === 'open',
      loan_on_property: (prop.data?.loan_on_property as boolean | null) ?? null,
      tax_paid_this_year:
        t?.answer === 'paid' && Date.parse(t.answered_at) >= financialYearStart().getTime(),
      government_value_inr: value?.government_value_inr ?? null,
    }),
  );
});
