import { waitUntil } from '@vercel/functions';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { SatelliteObservation, SatelliteView } from '@propittu/shared';
import { audit } from '../audit.js';
import { auth } from '../auth.js';
import { HttpError, must, ok, uuidParam } from '../errors.js';
import { assertOwnsProperty } from '../ownership.js';
import { pictureUrl } from '../satellite/pc.js';
import { moduleOn, observeProperty } from '../satellite/watch.js';
import { serviceClient } from '../supabase.js';

/**
 * Plot satellite watch (optional module). Owners: GET /properties/:id/satellite.
 * Team: GET /backoffice/modules, PATCH /backoffice/modules/:key {enabled}
 * (super admin), POST /backoffice/properties/:id/satellite (look now).
 */
export const satelliteRouter = Router();
export const modulesRouter = Router();

const MONTH = 30 * 86_400_000;

satelliteRouter.get('/properties/:id/satellite', async (req, res) => {
  const { db, accountId } = auth(req);
  const id = uuidParam(req.params.id, 'Property');
  await assertOwnsProperty(db, accountId, id);
  const server = serviceClient;
  const { data: p } = await db
    .from('properties')
    .select('property_type, latitude, location_source')
    .eq('id', id)
    .maybeSingle();
  const available =
    !!server &&
    (await moduleOn(server, 'satellite_watch')) &&
    p?.property_type === 'land' &&
    p.latitude !== null &&
    p.location_source === 'user';
  const rows = must<
    {
      id: string;
      item_id: string;
      captured_at: string;
      change: SatelliteObservation['change'];
      bbox: number[];
      created_at: string;
    }[]
  >(
    await db
      .from('satellite_observations')
      .select('id, item_id, captured_at, change, bbox, created_at')
      .eq('property_id', id)
      .order('captured_at', { ascending: false })
      .limit(8),
  );
  // Nothing looked at this month: look now, in the background.
  if (available && server && !rows.some((r) => Date.now() - Date.parse(r.created_at) < MONTH)) {
    waitUntil(observeProperty(server, id).then(() => undefined));
  }
  const data: SatelliteView = {
    available,
    observations: rows.map((r) => ({
      id: r.id,
      captured_at: r.captured_at,
      change: r.change,
      picture_url: pictureUrl(r.item_id, r.bbox as [number, number, number, number]),
    })),
  };
  ok(res, data);
});

const superAdmin: RequestHandler = (req, _res, next) => {
  if (req.staffRole === 'super_admin') return next();
  throw new HttpError(403, 'FORBIDDEN', 'Only a super admin can switch modules on or off');
};

modulesRouter.get('/modules', async (req, res) => {
  ok(
    res,
    must<{ key: string; enabled: boolean; updated_at: string }[]>(
      await auth(req).db.from('app_modules').select('key, enabled, updated_at').order('key'),
    ),
  );
});

modulesRouter.patch('/modules/:key', superAdmin, async (req, res) => {
  const ctx = auth(req);
  const key = z
    .string()
    .regex(/^[a-z_]{3,40}$/)
    .parse(req.params.key);
  const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
  must(
    await ctx.db
      .from('app_modules')
      .update({ enabled, updated_by: ctx.userId, updated_at: new Date().toISOString() })
      .eq('key', key),
  );
  await audit(
    ctx,
    'module.switched',
    { type: 'module', id: ctx.userId },
    { key, enabled },
    'staff',
  );
  ok(res, { key, enabled });
});

modulesRouter.post('/properties/:id/satellite', async (req, res) => {
  const id = uuidParam(req.params.id, 'Property');
  if (!serviceClient) throw new HttpError(503, 'INTERNAL', 'Not available right now');
  ok(res, { result: await observeProperty(serviceClient, id) });
});
