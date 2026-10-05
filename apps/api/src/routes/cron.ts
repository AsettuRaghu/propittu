import { Router } from 'express';
import { env } from '../env.js';
import { HttpError, ok, unauthenticated } from '../errors.js';
import { authServerClient } from '../supabase.js';

/**
 * GET /cron/keepalive — called once a day by Vercel Cron.
 *
 * Supabase's free plan pauses a project after ~7 days without activity;
 * this makes one trivial database call so that never happens. When
 * CRON_SECRET is set, Vercel sends it as a Bearer token and anyone else
 * is refused (harmless either way: it only reads the database clock).
 */
export const cronRouter = Router();

cronRouter.get('/cron/keepalive', async (req, res) => {
  if (env.CRON_SECRET && req.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
    throw unauthenticated('Not allowed');
  }

  const { data, error } = await authServerClient.rpc('keepalive');
  if (error) {
    throw new HttpError(503, 'INTERNAL', 'Database unreachable', undefined, { cause: error });
  }

  ok(res, { status: 'ok', database_time: data as string });
});
