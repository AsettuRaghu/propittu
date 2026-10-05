import { Router } from 'express';
import type { Me } from '@propittu/shared';
import { auth } from '../auth.js';
import { must, ok } from '../errors.js';

/** GET /me — Profile screen (§25). */
export const meRouter = Router();

interface ProfileRow {
  id: string;
  full_name: string | null;
  created_at: string;
}

meRouter.get('/me', async (req, res) => {
  const { db, userId, phone } = auth(req);

  const [profile, properties, requests] = await Promise.all([
    db.from('profiles').select('id, full_name, created_at').eq('id', userId).maybeSingle(),
    db.from('properties').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    db.from('service_requests').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);

  const row = must<ProfileRow | null>(profile);
  must(properties);
  must(requests);

  const data: Me = {
    id: userId,
    // The verified token is authoritative for the phone number, not the profile row.
    phone: phone ?? '',
    full_name: row?.full_name ?? null,
    created_at: row?.created_at ?? new Date().toISOString(),
    property_count: properties.count ?? 0,
    service_request_count: requests.count ?? 0,
  };

  ok(res, data);
});
