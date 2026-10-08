import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import {
  serviceCoverageSchema,
  staffCan,
  uuidSchema,
  zoneCreateSchema,
  zoneRulesSchema,
  zoneUpdateSchema,
  type CoverageSummaryRow,
  type CoverageZone,
  type PincodePage,
  type PincodeRow,
  type ReachDemand,
  type ServiceCoverage,
} from '@propittu/shared';
import { audit } from '../audit.js';
import { auth } from '../auth.js';
import { HttpError, invalid, must, notFound, ok, uuidParam } from '../errors.js';

/**
 * Coverage by PIN code in the Backoffice portal: the PIN directory, zones
 * (named groups of PINs) and where each service is offered. Mounted inside
 * backofficeRouter (active staff only). The checks themselves are in SQL
 * (service_covers, property_reach); every change is audited by triggers.
 */
export const coverageRouter = Router();
type Db = ReturnType<typeof auth>['db'];

const canManage: RequestHandler = (req, _res, next) => {
  if (staffCan(req.staffRole, 'services.manage')) return next();
  throw new HttpError(403, 'FORBIDDEN', 'Your staff role does not allow this action');
};

/* GET /backoffice/pincodes?q=&state=&district=&zone=&covered=&limit=&offset= */
const searchSchema = z.object({
  q: z.string().trim().max(60).optional(),
  state: z.string().trim().max(60).optional(),
  district: z.string().trim().max(60).optional(),
  zone: uuidSchema.optional(),
  covered: z.enum(['yes', 'no']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
coverageRouter.get('/pincodes', async (req, res) => {
  const { db } = auth(req);
  const f = searchSchema.parse(req.query);
  const rows = must<(PincodeRow & { total: number })[]>(
    await db.rpc('staff_pincode_search', {
      p_q: f.q || null,
      p_state: f.state || null,
      p_district: f.district || null,
      p_zone: f.zone ?? null,
      p_covered: f.covered ? f.covered === 'yes' : null,
      p_limit: f.limit,
      p_offset: f.offset,
    }),
  );
  const page: PincodePage = {
    rows: rows.map(({ total: _t, ...r }) => r),
    total: Number(rows[0]?.total ?? 0),
  };
  ok(res, page);
});

/* GET /backoffice/coverage/summary — per state and district */
coverageRouter.get('/coverage/summary', async (req, res) => {
  ok(res, must<CoverageSummaryRow[]>(await auth(req).db.rpc('staff_coverage_summary')));
});

/* GET /backoffice/coverage/demand — properties outside every live zone */
coverageRouter.get('/coverage/demand', async (req, res) => {
  ok(res, must<ReachDemand[]>(await auth(req).db.rpc('reach_demand')));
});

/* ---- Zones ---- */

async function listZones(db: Db): Promise<CoverageZone[]> {
  const [zones, rules, pins, props, uses, services] = await Promise.all([
    db.from('coverage_zones').select('id, name, is_active').order('name'),
    db.from('coverage_zone_rules').select('id, zone_id, kind, value').order('created_at'),
    db.rpc('zone_pins'),
    db
      .from('properties')
      .select('pincode')
      .eq('is_draft', false)
      .not('pincode', 'is', null)
      .limit(50_000),
    db.from('service_coverage').select('service_id, value').eq('kind', 'zone'),
    db.from('services').select('id, name'),
  ]);
  const perPin = new Map<string, number>();
  for (const p of must<{ pincode: string }[]>(props))
    perPin.set(p.pincode, (perPin.get(p.pincode) ?? 0) + 1);
  const zonePins = new Map<string, string[]>();
  for (const z of must<{ zone_id: string; pincode: string }[]>(pins))
    zonePins.set(z.zone_id, [...(zonePins.get(z.zone_id) ?? []), z.pincode]);
  const names = new Map(must<{ id: string; name: string }[]>(services).map((s) => [s.id, s.name]));
  const ruleRows = must<(CoverageZone['rules'][number] & { zone_id: string })[]>(rules);
  const useRows = must<{ service_id: string; value: string }[]>(uses);
  return must<Pick<CoverageZone, 'id' | 'name' | 'is_active'>[]>(zones).map((z) => {
    const list = zonePins.get(z.id) ?? [];
    return {
      ...z,
      rules: ruleRows.filter((r) => r.zone_id === z.id).map(({ zone_id: _z, ...r }) => r),
      pin_count: list.length,
      properties: list.reduce((n, pin) => n + (perPin.get(pin) ?? 0), 0),
      services: useRows
        .filter((u) => u.value === z.id)
        .map((u) => ({ id: u.service_id, name: names.get(u.service_id) ?? 'Service' })),
    };
  });
}

/* GET /backoffice/zones */
coverageRouter.get('/zones', async (req, res) => {
  ok(res, await listZones(auth(req).db));
});

/* POST /backoffice/zones {name} */
coverageRouter.post('/zones', canManage, async (req, res) => {
  const ctx = auth(req);
  const { name } = zoneCreateSchema.parse(req.body);
  const { data, error } = await ctx.db
    .from('coverage_zones')
    .insert({ name })
    .select('id')
    .single();
  if (error?.code === '23505') throw new HttpError(409, 'CONFLICT', 'A zone with this name exists');
  const row = must<{ id: string }>({ data, error });
  await audit(ctx, 'staff.zone.created', { type: 'coverage_zone', id: row.id }, { name }, 'staff');
  ok(res, { id: row.id, zones: await listZones(ctx.db) }, 201);
});

/* PATCH /backoffice/zones/:id {name?, is_active?} */
coverageRouter.patch('/zones/:id', canManage, async (req, res) => {
  const { db } = auth(req);
  const id = uuidParam(req.params.id, 'Zone');
  const input = zoneUpdateSchema.parse(req.body);
  const row = must<{ id: string } | null>(
    await db.from('coverage_zones').update(input).eq('id', id).select('id').maybeSingle(),
  );
  if (!row) throw notFound('Zone');
  ok(res, await listZones(db));
});

/* DELETE /backoffice/zones/:id — only when no service uses it */
coverageRouter.delete('/zones/:id', canManage, async (req, res) => {
  const { db } = auth(req);
  const id = uuidParam(req.params.id, 'Zone');
  const used = must<{ id: string }[]>(
    await db.from('service_coverage').select('id').eq('kind', 'zone').eq('value', id).limit(1),
  );
  if (used.length) throw new HttpError(409, 'CONFLICT', 'Remove this zone from its services first');
  must(await db.from('coverage_zones').delete().eq('id', id));
  ok(res, await listZones(db));
});

/* POST /backoffice/zones/:id/rules {kind, values} */
coverageRouter.post('/zones/:id/rules', canManage, async (req, res) => {
  const { db } = auth(req);
  const id = uuidParam(req.params.id, 'Zone');
  const { kind, values } = zoneRulesSchema.parse(req.body);
  const rows = [...new Set(values)].map((value) => ({ zone_id: id, kind, value }));
  must(
    await db
      .from('coverage_zone_rules')
      .upsert(rows, { onConflict: 'zone_id,kind,value', ignoreDuplicates: true }),
  );
  ok(res, await listZones(db));
});

/* DELETE /backoffice/zones/:id/rules/:ruleId */
coverageRouter.delete('/zones/:id/rules/:ruleId', canManage, async (req, res) => {
  const { db } = auth(req);
  must(
    await db
      .from('coverage_zone_rules')
      .delete()
      .eq('zone_id', uuidParam(req.params.id, 'Zone'))
      .eq('id', uuidParam(req.params.ruleId, 'Rule')),
  );
  ok(res, await listZones(db));
});

/* ---- Where each service is offered ---- */

async function loadServiceCoverage(db: Db, serviceId: string): Promise<ServiceCoverage> {
  const [rules, reach] = await Promise.all([
    db
      .from('service_coverage')
      .select('kind, value')
      .eq('service_id', serviceId)
      .order('created_at'),
    db.rpc('staff_service_reach', { p_service: serviceId }),
  ]);
  const r = must<{ everywhere: boolean; pins: number; properties: number }[]>(reach)[0];
  return {
    rules: must<ServiceCoverage['rules']>(rules),
    everywhere: r?.everywhere ?? false,
    pins: r?.pins ?? 0,
    properties: r?.properties ?? 0,
  };
}

/* GET /backoffice/services/:id/coverage */
coverageRouter.get('/services/:id/coverage', async (req, res) => {
  ok(res, await loadServiceCoverage(auth(req).db, uuidParam(req.params.id, 'Service')));
});

/* PUT /backoffice/services/:id/coverage {rules} — replaces the list */
coverageRouter.put('/services/:id/coverage', canManage, async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Service');
  const { rules } = serviceCoverageSchema.parse(req.body);
  for (const r of rules) {
    if (r.kind === 'pincode' && !/^[1-9][0-9]{5}$/.test(r.value))
      throw invalid(`Not a PIN code: ${r.value}`);
    if (r.kind === 'zone' && !uuidSchema.safeParse(r.value).success) throw invalid('Unknown zone');
  }
  const unique = [
    ...new Map(
      rules.map((r) => [`${r.kind}:${r.kind === 'everywhere' ? '' : r.value}`, r]),
    ).values(),
  ].map((r) => ({ service_id: id, kind: r.kind, value: r.kind === 'everywhere' ? '' : r.value }));
  must(await ctx.db.from('service_coverage').delete().eq('service_id', id));
  if (unique.length) must(await ctx.db.from('service_coverage').insert(unique));
  // Keep the older "reach" field roughly in step for app versions that still read it.
  const reach = unique.some((r) => r.kind === 'everywhere')
    ? 'everywhere'
    : unique.some((r) => r.kind === 'zone' || r.kind === 'pincode')
      ? 'area'
      : 'state';
  must(await ctx.db.from('services').update({ reach }).eq('id', id));
  await audit(
    ctx,
    'staff.service.coverage',
    { type: 'service', id },
    { rules: unique.length },
    'staff',
  );
  ok(res, await loadServiceCoverage(ctx.db, id));
});
