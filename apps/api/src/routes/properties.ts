import { Router } from 'express';
import {
  computePropertyCompletion,
  createPropertySchema,
  PREFILL_FIELDS,
  prefillFromFacts,
  sameFactValue,
  type DraftProperty,
  type FactValue,
  type PrefillField,
  OPEN_REQUEST_STATUSES,
  STORAGE_BUCKETS,
  updatePropertySchema,
  type Property,
  type PropertyDetail,
  type PropertySummary,
  type ServiceFulfilment,
  type ServiceRequestStatus,
  type ValueSource,
} from '@propittu/shared';
import { auth } from '../auth.js';
import { audit } from '../audit.js';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assertAiAvailable } from '../ai/jobs.js';
import { HttpError, must, notFound, ok, uuidParam } from '../errors.js';
import { assertOwnsProperty } from '../ownership.js';
import { enforceLimit, planOf, requireFeature } from '../plan.js';
import { removeObjects, signDownloads } from '../storage.js';
import { loadReach } from '../reach.js';
import { refreshReview } from './pittu.js';
import { listReadyPhotos } from './photos.js';
import { listReadyVideos } from './videos.js';

/** Properties CRUD (§8.2, §17, M2). */
export const propertiesRouter = Router();

/** Every column the client sees. user_id is never returned — it is implied. */
export const PROPERTY_COLUMNS =
  'id, property_type, name, address_line, city, state, pincode, latitude, longitude, ' +
  'area_value, area_unit, survey_number, property_number, khata_number, notes, ' +
  'location_source, location_confirmed_at, field_sources, is_draft, created_at, updated_at';

const SUMMARY_COLUMNS =
  'id, property_type, name, city, state, created_at, document_count, service_request_count, ' +
  'cover_photo_path, photo_count, video_count';

type PropertyRow = Property;

interface SummaryRow extends Omit<
  PropertySummary,
  'cover_photo_url' | 'completion_percent' | 'next_step' | 'active_request'
> {
  cover_photo_path: string | null;
}

/** PostgREST returns numeric columns as numbers, but be defensive about strings. */
export function toProperty(row: PropertyRow): Property {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    ...row,
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    area_value: num(row.area_value),
    field_sources: row.field_sources ?? {},
  };
}

/**
 * Provenance (M2/M11): every value the customer supplies is marked as
 * user-provided, so future AI/sale-deed extraction can tell confirmed
 * values apart and never silently overwrite them. A map pin set by the
 * customer is a user-confirmed location.
 */
function withProvenance(
  input: Record<string, unknown>,
  existing: Partial<Record<string, ValueSource>> = {},
): Record<string, unknown> {
  const fieldSources: Partial<Record<string, ValueSource>> = { ...existing };
  for (const [field, value] of Object.entries(input)) {
    if (field === 'latitude' || field === 'longitude') continue;
    if (value === null) delete fieldSources[field];
    else fieldSources[field] = 'user';
  }

  const location =
    'latitude' in input
      ? input.latitude === null
        ? { location_source: null, location_confirmed_at: null }
        : { location_source: 'user', location_confirmed_at: new Date().toISOString() }
      : {};

  return { ...input, ...location, field_sources: fieldSources };
}

/* ------------------------------------------------------------------ *
 * GET /properties — Home cards (§15)
 * ------------------------------------------------------------------ */

propertiesRouter.get('/properties', async (req, res) => {
  const { db, accountId } = auth(req);

  // Everything Home needs in four parallel reads (no per-property queries).
  const [summaryRes, propertyRes, documentRes, requestRes] = await Promise.all([
    db
      .from('property_summaries')
      .select(SUMMARY_COLUMNS)
      .eq('account_id', accountId)
      .eq('is_draft', false)
      .order('created_at', { ascending: false }),
    db.from('properties').select(PROPERTY_COLUMNS).eq('account_id', accountId),
    db
      .from('property_documents')
      .select('property_id, document_type')
      .eq('account_id', accountId)
      .eq('upload_status', 'ready'),
    db
      .from('service_requests')
      .select(
        'id, reference, status, fulfilment, property_id, scheduled_for, preferred_date, service:services(name)',
      )
      .eq('account_id', accountId)
      .in('status', OPEN_REQUEST_STATUSES)
      .order('created_at', { ascending: false }),
  ]);
  const rows = must<SummaryRow[]>(summaryRes);
  const properties = new Map(must<PropertyRow[]>(propertyRes).map((p) => [p.id, toProperty(p)]));
  const docTypes = new Map<string, string[]>();
  for (const d of must<{ property_id: string; document_type: string }[]>(documentRes)) {
    docTypes.set(d.property_id, [...(docTypes.get(d.property_id) ?? []), d.document_type]);
  }
  const activeRequest = new Map<string, PropertySummary['active_request']>();
  for (const r of must<
    {
      id: string;
      reference: string;
      status: ServiceRequestStatus;
      fulfilment: ServiceFulfilment;
      property_id: string | null;
      scheduled_for: string | null;
      preferred_date: string | null;
      service: { name: string } | null;
    }[]
  >(requestRes)) {
    if (!r.property_id || activeRequest.has(r.property_id)) continue;
    activeRequest.set(r.property_id, {
      id: r.id,
      reference: r.reference,
      status: r.status,
      fulfilment: r.fulfilment,
      service_name: r.service?.name ?? 'Service',
      scheduled_for: r.scheduled_for,
      preferred_date: r.preferred_date,
    });
  }

  const coverPaths = rows.flatMap((r) => (r.cover_photo_path ? [r.cover_photo_path] : []));
  const [urls, reach] = await Promise.all([
    signDownloads(db, STORAGE_BUCKETS.photos, coverPaths),
    loadReach(db, accountId),
  ]);

  const data: PropertySummary[] = rows.map(({ cover_photo_path, ...r }) => {
    const property = properties.get(r.id);
    const completion = property
      ? computePropertyCompletion({
          property,
          photoCount: r.photo_count,
          documentTypes: docTypes.get(r.id) ?? [],
        })
      : null;
    return {
      ...r,
      cover_photo_url: cover_photo_path ? (urls.get(cover_photo_path) ?? null) : null,
      completion_percent: completion?.percent ?? 0,
      next_step: completion?.next[0] ?? null,
      active_request: activeRequest.get(r.id) ?? null,
      reach: reach.get(r.id) ?? null,
    };
  });

  ok(res, data);
});

/* ------------------------------------------------------------------ *
 * POST /properties
 * ------------------------------------------------------------------ */

propertiesRouter.post('/properties', async (req, res) => {
  const { db, userId, accountId } = auth(req);
  const input = createPropertySchema.parse(req.body);

  // Benefit + Usage (M5/M6): creation counts, edit does not, delete frees capacity.
  const plan = planOf(req);
  requireFeature(plan, 'property_profile', 'Adding properties');
  enforceLimit(plan, 'max_properties', await countConfirmed(db, accountId), 1, [
    'property',
    'properties',
  ]);

  const row = must<PropertyRow>(
    await db
      .from('properties')
      .insert({ ...withProvenance(input), account_id: accountId, user_id: userId })
      .select(PROPERTY_COLUMNS)
      .single(),
  );

  await audit(auth(req), 'property.created', { type: 'property', id: row.id });
  ok(res, toProperty(row), 201);
});

/* ------------------------------------------------------------------ *
 * GET /properties/:id — Property details (§18) + completion (M2)
 * ------------------------------------------------------------------ */

/**
 * Property slots used this plan term (the database counts them): every
 * property that existed or was added this term, deleted or not, unless staff
 * freed it. Drafts never count.
 */
async function countConfirmed(db: SupabaseClient, accountId: string): Promise<number> {
  return Number(must<number>(await db.rpc('property_slots_used', { p_account: accountId })) ?? 0);
}

/* ------------------------------------------------------------------ *
 * Sale Deed path (Pittu): draft → deed read → customer confirms
 * ------------------------------------------------------------------ */

const MAX_OPEN_DRAFTS = 3;

/* POST /properties/draft — a placeholder the deed can be stored against */
propertiesRouter.post('/properties/draft', async (req, res) => {
  const ctx = auth(req);
  assertAiAvailable(ctx.accountId);
  const plan = planOf(req);
  requireFeature(plan, 'property_profile', 'Adding properties');
  // Check the limit now, so nobody reads a deed only to be refused at the end.
  enforceLimit(plan, 'max_properties', await countConfirmed(ctx.db, ctx.accountId), 1, [
    'property',
    'properties',
  ]);
  const drafts = await ctx.db
    .from('properties')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', ctx.accountId)
    .eq('is_draft', true);
  must(drafts);
  if ((drafts.count ?? 0) >= MAX_OPEN_DRAFTS) {
    throw new HttpError(
      409,
      'CONFLICT',
      'You have properties waiting to be finished. Finish or remove one of them first.',
    );
  }
  const row = must<PropertyRow>(
    await ctx.db
      .from('properties')
      .insert({
        account_id: ctx.accountId,
        user_id: ctx.userId,
        property_type: 'other',
        name: 'New property',
        is_draft: true,
        field_sources: {},
      })
      .select(PROPERTY_COLUMNS)
      .single(),
  );
  await audit(ctx, 'property.draft_created', { type: 'property', id: row.id });
  ok(res, toProperty(row), 201);
});

/* GET /properties/drafts — unfinished deed set-ups, for "Finish adding" on Home */
propertiesRouter.get('/properties/drafts', async (req, res) => {
  const { db, accountId } = auth(req);
  const drafts = must<{ id: string; name: string; created_at: string }[]>(
    await db
      .from('properties')
      .select('id, name, created_at')
      .eq('account_id', accountId)
      .eq('is_draft', true)
      .order('created_at', { ascending: false }),
  );
  const ids = drafts.map((d) => d.id);
  const docs =
    ids.length === 0
      ? []
      : must<{ id: string; property_id: string }[]>(
          await db
            .from('property_documents')
            .select('id, property_id')
            .in('property_id', ids)
            .eq('document_type', 'sale_deed')
            .eq('upload_status', 'ready')
            .order('created_at', { ascending: false }),
        );
  const data: DraftProperty[] = drafts.map((d) => ({
    id: d.id,
    created_at: d.created_at,
    document_id: docs.find((x) => x.property_id === d.id)?.id ?? null,
  }));
  ok(res, data);
});

/*
 * POST /properties/:id/setup {property, analysis_id?} — the customer confirms.
 * Turns the draft into a real property, records where each value came from
 * (deed vs typed), and keeps each fact's outcome: confirmed / edited (with
 * the customer's value) / rejected. Nothing Pittu found is applied unless
 * it is in what the customer submitted.
 */
const setupSchema = z.object({
  property: createPropertySchema,
  analysis_id: z.uuid().nullable().optional(),
});

/** Facts that map one-to-one onto a property field (the rest are confirmed as shown). */
const FACT_FIELD: Record<string, PrefillField> = {
  property_kind: 'property_type',
  city: 'city',
  state: 'state',
  pincode: 'pincode',
  area_value: 'area_value',
  area_unit: 'area_unit',
  khata_number: 'khata_number',
  unit_number: 'property_number',
};

propertiesRouter.post('/properties/:id/setup', async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Property');
  const { property: input, analysis_id: analysisId } = setupSchema.parse(req.body);

  const draft = must<{ id: string; is_draft: boolean } | null>(
    await ctx.db
      .from('properties')
      .select('id, is_draft')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle(),
  );
  if (!draft) throw notFound('Property');
  if (!draft.is_draft) throw new HttpError(409, 'CONFLICT', 'This property is already set up.');
  const plan = planOf(req);
  enforceLimit(plan, 'max_properties', await countConfirmed(ctx.db, ctx.accountId), 1, [
    'property',
    'properties',
  ]);

  const facts = analysisId
    ? must<{ id: string; key: string; value: FactValue }[]>(
        await ctx.db
          .from('property_facts')
          .select('id, key, value')
          .eq('analysis_id', analysisId)
          .eq('property_id', id)
          .eq('account_id', ctx.accountId),
      )
    : [];
  const prefill = prefillFromFacts(facts);

  // Provenance: unchanged deed values are 'sale_deed'; anything typed is 'user'.
  const update = withProvenance(input, {});
  const sources = update.field_sources as Partial<Record<string, ValueSource>>;
  for (const field of PREFILL_FIELDS) {
    const deed = prefill[field];
    if (
      deed !== null &&
      deed !== undefined &&
      sameFactValue(deed, input[field as keyof typeof input])
    ) {
      sources[field] = 'sale_deed';
    }
  }
  const row = must<PropertyRow | null>(
    await ctx.db
      .from('properties')
      .update({ ...update, field_sources: sources, is_draft: false })
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .select(PROPERTY_COLUMNS)
      .maybeSingle(),
  );
  if (!row) throw notFound('Property');

  // The improvement signal: what the customer did with each fact.
  const now = new Date().toISOString();
  const confirmed: string[] = [];
  let edited = 0;
  let rejected = 0;
  for (const f of facts) {
    const field = FACT_FIELD[f.key];
    if (!field) {
      confirmed.push(f.id);
      continue;
    }
    const submitted = input[field as keyof typeof input] ?? null;
    if (sameFactValue(f.value, submitted)) {
      confirmed.push(f.id);
    } else {
      const removed = submitted === null || submitted === '';
      if (removed) rejected++;
      else edited++;
      must(
        await ctx.db
          .from('property_facts')
          .update({
            status: removed ? 'rejected' : 'edited',
            final_value: removed ? null : submitted,
            decided_by: ctx.userId,
            decided_at: now,
          })
          .eq('id', f.id),
      );
    }
  }
  if (confirmed.length) {
    must(
      await ctx.db
        .from('property_facts')
        .update({ status: 'confirmed', decided_by: ctx.userId, decided_at: now })
        .in('id', confirmed),
    );
  }
  await audit(
    ctx,
    'property.created_from_deed',
    { type: 'property', id },
    {
      analysis_id: analysisId ?? null,
      facts_confirmed: confirmed.length,
      facts_edited: edited,
      facts_rejected: rejected,
    },
  );
  await refreshReview(ctx, id);
  ok(res, toProperty(row));
});

propertiesRouter.get('/properties/:id', async (req, res) => {
  const { db, accountId } = auth(req);
  const id = uuidParam(req.params.id, 'Property');

  const [propertyResult, summaryResult, documentsResult] = await Promise.all([
    db
      .from('properties')
      .select(PROPERTY_COLUMNS)
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle(),
    db
      .from('property_summaries')
      .select('document_count, service_request_count')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle(),
    db
      .from('property_documents')
      .select('document_type')
      .eq('property_id', id)
      .eq('account_id', accountId)
      .eq('upload_status', 'ready'),
  ]);

  const row = must<PropertyRow | null>(propertyResult);
  if (!row) throw notFound('Property');
  const counts = must<Pick<PropertySummary, 'document_count' | 'service_request_count'> | null>(
    summaryResult,
  );
  const documentTypes = must<{ document_type: string }[]>(documentsResult).map(
    (d) => d.document_type,
  );

  const property = toProperty(row);
  const [photos, videos, reach] = await Promise.all([
    listReadyPhotos(db, accountId, id),
    listReadyVideos(db, accountId, id),
    loadReach(db, accountId),
  ]);

  const data: PropertyDetail = {
    ...property,
    photos,
    videos,
    document_count: counts?.document_count ?? 0,
    service_request_count: counts?.service_request_count ?? 0,
    completion: computePropertyCompletion({ property, photoCount: photos.length, documentTypes }),
    reach: reach.get(id) ?? null,
  };

  ok(res, data);
});

/*
 * POST /properties/:id/reach-interest — "Tell me when you arrive" for a
 * property our team cannot visit yet (shows on the staff demand list).
 */
propertiesRouter.post('/properties/:id/reach-interest', async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Property');
  await assertOwnsProperty(ctx.db, ctx.accountId, id);
  must(
    await ctx.db
      .from('reach_interest')
      .upsert(
        { property_id: id, account_id: ctx.accountId, created_by: ctx.userId },
        { onConflict: 'property_id', ignoreDuplicates: true },
      ),
  );
  await audit(ctx, 'property.reach_interest', { type: 'property', id });
  ok(res, (await loadReach(ctx.db, ctx.accountId)).get(id) ?? null);
});

/* ------------------------------------------------------------------ *
 * PATCH /properties/:id
 * ------------------------------------------------------------------ */

propertiesRouter.patch('/properties/:id', async (req, res) => {
  const { db, accountId } = auth(req);
  const id = uuidParam(req.params.id, 'Property');
  const input = updatePropertySchema.parse(req.body);

  const existing = must<{ field_sources: Partial<Record<string, ValueSource>> } | null>(
    await db
      .from('properties')
      .select('field_sources')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle(),
  );
  if (!existing) throw notFound('Property');

  const row = must<PropertyRow | null>(
    await db
      .from('properties')
      .update(withProvenance(input, existing.field_sources ?? {}))
      .eq('id', id)
      .eq('account_id', accountId)
      .select(PROPERTY_COLUMNS)
      .maybeSingle(),
  );
  if (!row) throw notFound('Property');

  if ('latitude' in input) {
    await audit(auth(req), 'property.location_confirmed', { type: 'property', id });
  }
  ok(res, toProperty(row));
});

/* ------------------------------------------------------------------ *
 * DELETE /properties/:id
 *
 * Storage objects first, then the row. The reverse order risks orphaned
 * files nobody can see or delete. Media/document rows cascade with the
 * property; service requests survive with property_id nulled (§8.4).
 * ------------------------------------------------------------------ */

propertiesRouter.delete('/properties/:id', async (req, res) => {
  const { db, accountId } = auth(req);
  const id = uuidParam(req.params.id, 'Property');
  await assertOwnsProperty(db, accountId, id);

  const [photos, documents, videos] = await Promise.all([
    db
      .from('property_photos')
      .select('storage_path')
      .eq('property_id', id)
      .eq('account_id', accountId),
    db
      .from('property_documents')
      .select('storage_path')
      .eq('property_id', id)
      .eq('account_id', accountId),
    db
      .from('property_videos')
      .select('storage_path')
      .eq('property_id', id)
      .eq('account_id', accountId),
  ]);

  const paths = (r: { storage_path: string }[]) => r.map((x) => x.storage_path);
  await removeObjects(db, STORAGE_BUCKETS.photos, paths(must(photos)));
  await removeObjects(db, STORAGE_BUCKETS.documents, paths(must(documents)));
  await removeObjects(db, STORAGE_BUCKETS.videos, paths(must(videos)));

  must(await db.from('properties').delete().eq('id', id).eq('account_id', accountId));
  await audit(auth(req), 'property.deleted', { type: 'property', id });

  res.status(204).end();
});
