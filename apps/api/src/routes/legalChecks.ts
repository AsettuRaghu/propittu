import { Router } from 'express';
import { auth } from '../auth.js';
import { ok, uuidParam } from '../errors.js';
import { listChecks } from '../legal/checks.js';

/**
 * GET /properties/:id/legal-checks — the customer's shared Pittu Legal
 * checks for a property (row-level security shows only shared ones).
 */
export const legalChecksCustomerRouter = Router();

legalChecksCustomerRouter.get('/properties/:id/legal-checks', async (req, res) => {
  const { db } = auth(req);
  ok(res, await listChecks(db, { propertyId: uuidParam(req.params.id, 'Property') }));
});
