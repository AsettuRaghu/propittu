import { Router, type RequestHandler } from 'express';
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  reorderSchema,
  staffCan,
  type StaffPermission,
  type StaffServiceCategory,
} from '@propittu/shared';
import { audit } from '../audit.js';
import { auth } from '../auth.js';
import { HttpError, must, notFound, ok } from '../errors.js';

/**
 * Catalogue set-up in the Backoffice portal: service categories, and the
 * order of services, categories and plans. Mounted inside backofficeRouter
 * (active staff only).
 */
export const catalogueRouter = Router();

const can =
  (permission: StaffPermission): RequestHandler =>
  (req, _res, next) => {
    if (staffCan(req.staffRole, permission)) return next();
    throw new HttpError(403, 'FORBIDDEN', 'Your staff role does not allow this action');
  };

async function listCategories(db: ReturnType<typeof auth>['db']): Promise<StaffServiceCategory[]> {
  const [cats, services] = await Promise.all([
    db.from('service_categories').select('code, name, sort_order').order('sort_order'),
    db.from('services').select('category'),
  ]);
  const counts = new Map<string, number>();
  for (const s of must<{ category: string }[]>(services))
    counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
  return must<Omit<StaffServiceCategory, 'service_count'>[]>(cats).map((c) => ({
    ...c,
    service_count: counts.get(c.code) ?? 0,
  }));
}

/** Writes sort_order 10, 20, 30… in the given order. */
async function reorder(
  db: ReturnType<typeof auth>['db'],
  table: 'services' | 'plans' | 'service_categories',
  key: 'id' | 'code',
  ids: string[],
) {
  const results = await Promise.all(
    ids.map((id, i) =>
      db
        .from(table)
        .update({ sort_order: (i + 1) * 10 })
        .eq(key, id),
    ),
  );
  for (const r of results) must(r);
}

/* GET /backoffice/service-categories */
catalogueRouter.get('/service-categories', async (req, res) => {
  ok(res, await listCategories(auth(req).db));
});

/* POST /backoffice/service-categories {code, name} — added at the end */
catalogueRouter.post('/service-categories', can('services.manage'), async (req, res) => {
  const ctx = auth(req);
  const input = categoryCreateSchema.parse(req.body);
  const last = await listCategories(ctx.db);
  const { error } = await ctx.db.from('service_categories').insert({
    ...input,
    sort_order: (last.at(-1)?.sort_order ?? 0) + 10,
  });
  if (error?.code === '23505')
    throw new HttpError(409, 'CONFLICT', 'A category with this code exists');
  must({ error, data: null });
  await audit(
    ctx,
    'staff.service_category.created',
    { type: 'service_category', id: input.code },
    input,
    'staff',
  );
  ok(res, await listCategories(ctx.db), 201);
});

/* PATCH /backoffice/service-categories/:code {name} */
catalogueRouter.patch('/service-categories/:code', can('services.manage'), async (req, res) => {
  const ctx = auth(req);
  const { name } = categoryUpdateSchema.parse(req.body);
  const row = must<{ code: string } | null>(
    await ctx.db
      .from('service_categories')
      .update({ name })
      .eq('code', req.params.code)
      .select('code')
      .maybeSingle(),
  );
  if (!row) throw notFound('Category');
  ok(res, await listCategories(ctx.db));
});

/* DELETE /backoffice/service-categories/:code — only when no service uses it */
catalogueRouter.delete('/service-categories/:code', can('services.manage'), async (req, res) => {
  const ctx = auth(req);
  const { error } = await ctx.db.from('service_categories').delete().eq('code', req.params.code);
  if (error?.code === '23503')
    throw new HttpError(409, 'CONFLICT', 'Move its services to another category first');
  must({ error, data: null });
  ok(res, await listCategories(ctx.db));
});

/* POST /backoffice/service-categories/order {ids: codes} */
catalogueRouter.post('/service-categories/order', can('services.manage'), async (req, res) => {
  const { db } = auth(req);
  await reorder(db, 'service_categories', 'code', reorderSchema.parse(req.body).ids);
  ok(res, await listCategories(db));
});

/* POST /backoffice/services/order {ids} */
catalogueRouter.post('/services/order', can('services.manage'), async (req, res) => {
  await reorder(auth(req).db, 'services', 'id', reorderSchema.parse(req.body).ids);
  res.status(204).end();
});

/* POST /backoffice/plans/order {ids} */
catalogueRouter.post('/plans/order', can('plans.manage'), async (req, res) => {
  await reorder(auth(req).db, 'plans', 'id', reorderSchema.parse(req.body).ids);
  res.status(204).end();
});
