import { Router } from 'express';
import {
  URGENT_KIND_LABELS,
  URGENT_SERVICE,
  helplinesFor,
  urgentSchema,
  type LocalHelp,
} from '@propittu/shared';
import { audit } from '../audit.js';
import { auth } from '../auth.js';
import { HttpError, must, ok, uuidParam } from '../errors.js';
import { localPlaces } from '../local.js';
import { assertOwnsProperty } from '../ownership.js';
import { loadRequest } from './services.js';
import { serviceClient } from '../supabase.js';

/**
 * "Something's wrong at my property."
 *
 *   POST /properties/:id/urgent       {kind, details} — an urgent visit or security
 *                                      check, marked urgent for the team
 *   GET  /properties/:id/local-help   helplines, and nearby police / fire /
 *                                      hospital / local body / Sub-Registrar
 */
export const urgentRouter = Router();

urgentRouter.post('/properties/:id/urgent', async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Property');
  await assertOwnsProperty(ctx.db, ctx.accountId, id);
  const { kind, details } = urgentSchema.parse(req.body);
  const { data: service } = await ctx.db
    .from('services')
    .select('id')
    .eq('code', URGENT_SERVICE[kind])
    .eq('is_active', true)
    .maybeSingle();
  if (!service)
    throw new HttpError(409, 'CONFLICT', 'We can’t send anyone right now — please call us.');
  const requestId = must<string>(
    await ctx.db.rpc('create_service_request', {
      p_property: id,
      p_service: service.id,
      p_description: `URGENT — ${URGENT_KIND_LABELS[kind]}${details ? `: ${details}` : ''}`,
      p_preferred_date: new Date().toISOString().slice(0, 10),
      p_preferred_slot: null,
    }),
  );
  // Marked with the server key (owners can't set it on other requests).
  if (serviceClient)
    await serviceClient.from('service_requests').update({ urgent: true }).eq('id', requestId);
  await audit(ctx, 'service_request.urgent', { type: 'service_request', id: requestId }, { kind });
  ok(res, await loadRequest(ctx.db, ctx.accountId, requestId), 201);
});

urgentRouter.get('/properties/:id/local-help', async (req, res) => {
  const { db, accountId } = auth(req);
  const id = uuidParam(req.params.id, 'Property');
  await assertOwnsProperty(db, accountId, id);
  const { data: p } = await db
    .from('properties')
    .select('id, account_id, state, city, latitude, longitude')
    .eq('id', id)
    .maybeSingle();
  const places =
    p?.latitude != null && p.longitude != null && serviceClient
      ? await localPlaces(serviceClient, {
          id,
          account_id: p.account_id as string,
          latitude: p.latitude as number,
          longitude: p.longitude as number,
        })
      : [];
  const data: LocalHelp = {
    helplines: helplinesFor(
      (p?.state as string | null) ?? null,
      (p?.city as string | null) ?? null,
    ),
    places,
  };
  ok(res, data);
});
