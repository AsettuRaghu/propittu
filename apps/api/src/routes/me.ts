import { Router } from 'express';
import {
  deleteAccountSchema,
  updateProfileSchema,
  type AccountStatus,
  type Me,
  type StaffRole,
} from '@propittu/shared';
import { auth } from '../auth.js';
import { audit } from '../audit.js';
import { HttpError, must, ok } from '../errors.js';
import { logger } from '../logger.js';
import { serviceClient } from '../supabase.js';
import { canStartReading } from '../ai/jobs.js';
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
    db
      .from('properties')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('is_draft', false),
    db
      .from('service_requests')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId),
    loadPlanState(db, accountId),
  ]);
  const documentReading = await canStartReading(accountId);

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
    features: { document_reading: documentReading },
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

/*
 * POST /me/delete {confirm: "DELETE"} — deletes the account (App Store /
 * Play Store requirement; DPDP right to erasure).
 *
 *   1. delete_my_account() runs AS THE CUSTOMER: removes personal data,
 *      closes the account, returns the stored files.
 *   2. the files are removed from storage;
 *   3. the login itself is deleted (profile and membership go with it).
 * Payment records and the audit trail are kept, unlinked from the person.
 */
meRouter.post('/me/delete', async (req, res) => {
  const ctx = auth(req);
  deleteAccountSchema.parse(req.body);
  if (!serviceClient) {
    throw new HttpError(
      503,
      'INTERNAL',
      'Account deletion is not available right now. Please write to us and we will do it for you.',
    );
  }

  await audit(ctx, 'account.deletion_requested', { type: 'account', id: ctx.accountId });
  const files = must<{ bucket: string; path: string }[]>(await ctx.db.rpc('delete_my_account'));

  const byBucket = new Map<string, string[]>();
  for (const f of files) byBucket.set(f.bucket, [...(byBucket.get(f.bucket) ?? []), f.path]);
  let filesLeft = 0;
  for (const [bucket, paths] of byBucket) {
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const { error } = await serviceClient.storage.from(bucket).remove(chunk);
      if (error) {
        filesLeft += chunk.length;
        logger.error(
          { err: error, bucket, count: chunk.length, accountId: ctx.accountId },
          'account deletion: files not removed',
        );
      }
    }
  }

  const { error } = await serviceClient.auth.admin.deleteUser(ctx.userId);
  if (error) {
    logger.error({ err: error, accountId: ctx.accountId }, 'account deletion: login not deleted');
    throw new HttpError(
      500,
      'INTERNAL',
      'Your data was removed but we could not finish. Please write to us.',
    );
  }
  logger.info(
    {
      audit: { action: 'account.deleted', accountId: ctx.accountId },
      files: files.length,
      filesLeft,
      reqId: ctx.requestId,
    },
    'audit account.deleted',
  );
  res.status(204).end();
});
