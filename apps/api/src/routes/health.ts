import { Router } from 'express';
import { ok } from '../errors.js';

/**
 * GET /health — liveness only (§30). Used by Render's health check.
 *
 * Deliberately does not call Supabase: a Supabase blip should not make
 * Render restart a perfectly healthy API process.
 */
export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  ok(res, { status: 'ok', time: new Date().toISOString() });
});
