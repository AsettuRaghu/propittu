import { Router } from 'express';
import { careScheduleSchema, type CareSchedule } from '@propittu/shared';
import { z } from 'zod';
import { audit } from '../audit.js';
import { auth } from '../auth.js';
import { HttpError, fromDbError, must, notFound, ok, uuidParam } from '../errors.js';
import { assertOwnsProperty } from '../ownership.js';

/**
 * Care schedule: services that repeat for a property (run daily by
 * src/care.ts).
 *
 *   GET    /properties/:id/care-schedules
 *   POST   /properties/:id/care-schedules   {service_id, every_months, next_on}
 *   PATCH  /care-schedules/:id              {active?, every_months?, next_on?}
 *   DELETE /care-schedules/:id
 */
export const careRouter = Router();

const COLUMNS =
  'id, service_id, every_months, next_on, active, last_request_id, service:services(name)';
type Row = Omit<CareSchedule, 'service_name'> & { service: { name: string } | null };
const toSchedule = ({ service, ...r }: Row): CareSchedule => ({
  ...r,
  service_name: service?.name ?? 'Service',
});

careRouter.get('/properties/:id/care-schedules', async (req, res) => {
  const { db, accountId } = auth(req);
  const id = uuidParam(req.params.id, 'Property');
  await assertOwnsProperty(db, accountId, id);
  const rows = must<Row[]>(
    await db.from('care_schedules').select(COLUMNS).eq('property_id', id).order('next_on'),
  );
  ok(res, rows.map(toSchedule));
});

careRouter.post('/properties/:id/care-schedules', async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Property');
  await assertOwnsProperty(ctx.db, ctx.accountId, id);
  const input = careScheduleSchema.parse(req.body);
  if (input.next_on < new Date().toISOString().slice(0, 10))
    throw new HttpError(400, 'VALIDATION_FAILED', 'Choose today or a later date');
  const { data, error } = await ctx.db
    .from('care_schedules')
    .insert({ account_id: ctx.accountId, property_id: id, created_by: ctx.userId, ...input })
    .select(COLUMNS)
    .single();
  if (error) {
    if (error.code === '23505')
      throw new HttpError(409, 'CONFLICT', 'This service is already on the schedule');
    throw fromDbError(error);
  }
  await audit(
    ctx,
    'care.scheduled',
    { type: 'property', id },
    { every_months: input.every_months },
  );
  ok(res, toSchedule(data as unknown as Row), 201);
});

careRouter.patch('/care-schedules/:id', async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Schedule');
  const input = careScheduleSchema
    .pick({ every_months: true, next_on: true })
    .partial()
    .extend({ active: z.boolean().optional() })
    .parse(req.body);
  const row = must<Row | null>(
    await ctx.db
      .from('care_schedules')
      .update(input)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .select(COLUMNS)
      .maybeSingle(),
  );
  if (!row) throw notFound('Schedule');
  ok(res, toSchedule(row));
});

careRouter.delete('/care-schedules/:id', async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Schedule');
  must(await ctx.db.from('care_schedules').delete().eq('id', id).eq('account_id', ctx.accountId));
  await audit(ctx, 'care.unscheduled', { type: 'care_schedule', id });
  ok(res, { id });
});
