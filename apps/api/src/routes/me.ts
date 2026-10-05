import { Router } from 'express';
import type { AccountStatus, Me, StaffRole } from '@propittu/shared';
import { auth } from '../auth.js';
import { must, ok } from '../errors.js';

/** GET /me — Profile screen (§25) plus Account (M1) and staff status (M9). */
export const meRouter = Router();

interface ProfileRow {
  id: string;
  full_name: string | null;
  created_at: string;
}

meRouter.get('/me', async (req, res) => {
  const { db, userId, phone, accountId, accountRole } = auth(req);

  const [profile, account, staff, properties, requests] = await Promise.all([
    db.from('profiles').select('id, full_name, created_at').eq('id', userId).maybeSingle(),
    db.from('accounts').select('id, status').eq('id', accountId).single(),
    db.from('staff_members').select('role, is_active').eq('user_id', userId).maybeSingle(),
    db.from('properties').select('id', { count: 'exact', head: true }).eq('account_id', accountId),
    db
      .from('service_requests')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId),
  ]);

  const row = must<ProfileRow | null>(profile);
  const acc = must<{ id: string; status: AccountStatus }>(account);
  const staffRow = must<{ role: StaffRole; is_active: boolean } | null>(staff);
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
    account: { id: acc.id, status: acc.status, role: accountRole },
    staff_role: staffRow?.is_active ? staffRow.role : null,
  };

  ok(res, data);
});
