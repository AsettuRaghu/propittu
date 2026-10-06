import { Router } from 'express';
import { updateProfileSchema, type AccountStatus, type Me, type StaffRole } from '@propittu/shared';
import { auth } from '../auth.js';
import { audit } from '../audit.js';
import { must, ok } from '../errors.js';
import { loadPlanState, planSummary } from '../plan.js';

/** GET /me — Profile screen (§25) plus Account (M1) and staff status (M9). */
export const meRouter = Router();

interface ProfileRow {
  id: string;
  full_name: string | null;
  created_at: string;
}

meRouter.get('/me', async (req, res) => {
  const { db, userId, phone, accountId, accountRole } = auth(req);

  const [profile, account, staff, properties, requests, plan] = await Promise.all([
    db.from('profiles').select('id, full_name, created_at').eq('id', userId).maybeSingle(),
    db.from('accounts').select('id, status').eq('id', accountId).single(),
    db.from('staff_members').select('role, is_active').eq('user_id', userId).maybeSingle(),
    db.from('properties').select('id', { count: 'exact', head: true }).eq('account_id', accountId),
    db
      .from('service_requests')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId),
    loadPlanState(db, accountId),
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
    plan: planSummary(plan),
  };

  ok(res, data);
});

/* PATCH /me {full_name} — the profile name (mobile number is the login, not editable). */
meRouter.patch('/me', async (req, res) => {
  const ctx = auth(req);
  const { full_name } = updateProfileSchema.parse(req.body);
  must(await ctx.db.from('profiles').update({ full_name }).eq('id', ctx.userId));
  await audit(ctx, 'profile.updated', { type: 'profile', id: ctx.userId });
  ok(res, { full_name });
});
