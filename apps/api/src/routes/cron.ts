import { waitUntil } from '@vercel/functions';
import { Router } from 'express';
import { env } from '../env.js';
import { HttpError, ok, unauthenticated } from '../errors.js';
import { authServerClient, serviceClient } from '../supabase.js';
import { runCareSchedules } from '../care.js';
import { cleanAbandonedUploads } from '../cleanup.js';
import { runWatch } from '../watch/watch.js';
import { runSatellite } from '../satellite/watch.js';

/**
 * GET /cron/keepalive — called once a day by Vercel Cron (also runs the
 * clean-up of abandoned uploads).
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

  // Also: remove uploads that were started but never finished (older than a day).
  // And the care schedule: book what's due within a week (or remind the owner).
  if (serviceClient) {
    const db = serviceClient;
    waitUntil(
      cleanAbandonedUploads(db)
        .then(() => runCareSchedules(db))
        .then(() => undefined),
    );
  }
  ok(res, { status: 'ok', database_time: data as string });
});

/**
 * GET /cron/watch — Pittu Watch, once a day (Vercel Cron, 01:30 UTC = 7 am
 * IST): collect new headlines for places due and have Pittu read them. Runs
 * after answering; bounded to a few places per run.
 */
cronRouter.get('/cron/watch', (req, res) => {
  if (env.CRON_SECRET && req.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
    throw unauthenticated('Not allowed');
  }
  if (serviceClient) {
    const db = serviceClient;
    // News first, then the satellite watch (only when the module is switched on).
    waitUntil(
      runWatch(db)
        .then(() => runSatellite(db))
        .then(() => undefined),
    );
  }
  ok(res, { started: !!serviceClient });
});
