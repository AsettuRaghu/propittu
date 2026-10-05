import { Router } from 'express';
import { z } from 'zod';
import {
  createServiceRequestSchema,
  uuidSchema,
  type Service,
  type ServiceRequest,
} from '@propittu/shared';
import { auth } from '../auth.js';
import { audit } from '../audit.js';
import { invalid, must, notFound, ok, uuidParam } from '../errors.js';
import { assertOwnsProperty } from '../ownership.js';

/**
 * Service catalogue and service requests (§8.4, §22–§24).
 *
 * Requests are submit-and-track only: fulfilment is out of scope for V1,
 * and status is changed by operators directly in the database (§24).
 */
export const servicesRouter = Router();

const SERVICE_COLUMNS = 'id, code, name, category, description, sort_order';

const REQUEST_COLUMNS =
  'id, reference, status, description, created_at, updated_at, ' +
  'service:services(id, code, name, category), ' +
  'property:properties(id, name, city)';

/* GET /services */
servicesRouter.get('/services', async (req, res) => {
  const { db } = auth(req);
  const rows = must<Service[]>(
    await db
      .from('services')
      .select(SERVICE_COLUMNS)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
  );
  ok(res, rows);
});

/* GET /service-requests[?property_id=] — newest first */
const listQuerySchema = z.object({ property_id: uuidSchema.optional() });

servicesRouter.get('/service-requests', async (req, res) => {
  const { db, accountId } = auth(req);
  const { property_id } = listQuerySchema.parse(req.query);

  let query = db
    .from('service_requests')
    .select(REQUEST_COLUMNS)
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });
  if (property_id) query = query.eq('property_id', property_id);

  ok(res, must<ServiceRequest[]>(await query));
});

/* GET /service-requests/:id */
servicesRouter.get('/service-requests/:id', async (req, res) => {
  const { db, accountId } = auth(req);
  const id = uuidParam(req.params.id, 'Service request');

  const row = must<ServiceRequest | null>(
    await db
      .from('service_requests')
      .select(REQUEST_COLUMNS)
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle(),
  );
  if (!row) throw notFound('Service request');

  ok(res, row);
});

/* POST /service-requests */
servicesRouter.post('/service-requests', async (req, res) => {
  const { db, userId, accountId } = auth(req);
  const input = createServiceRequestSchema.parse(req.body);

  await assertOwnsProperty(db, accountId, input.property_id);

  const service = must<{ id: string } | null>(
    await db
      .from('services')
      .select('id')
      .eq('id', input.service_id)
      .eq('is_active', true)
      .maybeSingle(),
  );
  if (!service) throw invalid('Choose a service', { service_id: 'Choose a service' });

  // user_id comes from the verified token; status is left to its default.
  const row = must<ServiceRequest>(
    await db
      .from('service_requests')
      .insert({
        account_id: accountId,
        user_id: userId,
        property_id: input.property_id,
        service_id: input.service_id,
        description: input.description,
      })
      .select(REQUEST_COLUMNS)
      .single(),
  );

  await audit(
    auth(req),
    'service_request.created',
    { type: 'service_request', id: row.id },
    { reference: row.reference },
  );
  ok(res, row, 201);
});
