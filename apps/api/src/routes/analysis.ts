import { waitUntil } from '@vercel/functions';
import { Router } from 'express';
import { auth } from '../auth.js';
import { notFound, ok, uuidParam } from '../errors.js';
import { assertAiAvailable, loadAnalysis, needsRun, requestAnalysis } from '../pittu/index.js';
import { readDocument } from '../deeds/reading.js';

/**
 * Pittu document reading (AI). Off unless AI_ENABLED and the account is in
 * the pilot (503 AI_UNAVAILABLE otherwise).
 *
 *   POST /documents/:id/analysis   start (or return the cached) reading → 202
 *   GET  /documents/:id/analysis   status, and the facts once ready
 *
 * The reading runs after the response (waitUntil). A GET restarts a job that
 * is queued or stuck, so the app's own status checks keep things moving.
 */
export const analysisRouter = Router();

const kick = (id: string) => waitUntil(readDocument(id));

analysisRouter.post('/documents/:id/analysis', async (req, res) => {
  const ctx = auth(req);
  const row = await requestAnalysis(ctx, uuidParam(req.params.id, 'Document'));
  if (needsRun(row)) kick(row.id);
  const analysis = await loadAnalysis(ctx.db, ctx.accountId, row.document_id);
  if (!analysis) throw notFound('Analysis');
  const done = analysis.row.status === 'ready' || analysis.row.status === 'failed';
  ok(res, analysis.data, done ? 200 : 202);
});

analysisRouter.get('/documents/:id/analysis', async (req, res) => {
  const ctx = auth(req);
  assertAiAvailable(ctx.accountId);
  const analysis = await loadAnalysis(ctx.db, ctx.accountId, uuidParam(req.params.id, 'Document'));
  if (!analysis) throw notFound('Analysis');
  if (needsRun(analysis.row)) kick(analysis.row.id);
  ok(res, analysis.data);
});
