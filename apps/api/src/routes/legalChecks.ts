import { waitUntil } from '@vercel/functions';
import { Router } from 'express';
import { auth } from '../auth.js';
import { ok, uuidParam } from '../errors.js';
import { listChecks } from '../legal/checks.js';
import { checkDisputes, ownerDisputes } from '../legal/disputes.js';
import { assertOwnsProperty } from '../ownership.js';
import { aiAvailableFor } from '../pittu/core/limits.js';

/**
 * GET /properties/:id/legal-checks — the customer's shared Pittu Legal
 * checks for a property (row-level security shows only shared ones).
 */
export const legalChecksCustomerRouter = Router();

legalChecksCustomerRouter.get('/properties/:id/legal-checks', async (req, res) => {
  const { db } = auth(req);
  ok(res, await listChecks(db, { propertyId: uuidParam(req.params.id, 'Property') }));
});

/**
 * GET /properties/:id/disputes — court cases and disputes Pittu checked for
 * this property's project and land. Items only once our team has reviewed
 * and shared them; while it's being reviewed the owner sees just that. A
 * check starts by itself when none has run (or it's 90 days old).
 */
legalChecksCustomerRouter.get('/properties/:id/disputes', async (req, res) => {
  const { db, accountId } = auth(req);
  const id = uuidParam(req.params.id, 'Property');
  await assertOwnsProperty(db, accountId, id);
  const { disputes, due } = await ownerDisputes(id);
  if (due && aiAvailableFor(accountId)) {
    waitUntil(checkDisputes(id));
    ok(res, { status: 'working', items: [], note: null, checked_at: disputes?.checked_at ?? null });
    return;
  }
  ok(res, disputes);
});
