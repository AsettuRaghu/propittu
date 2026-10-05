import { Router } from 'express';
import { ok } from '../errors.js';

/**
 * GET /health — liveness only (§30).
 *
 * Deliberately does not call Supabase, so it answers "is the API up?"
 * independently of the database. /cron/keepalive is the one that
 * touches the database.
 */
export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  ok(res, { status: 'ok', time: new Date().toISOString() });
});
