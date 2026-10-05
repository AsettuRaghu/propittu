import { Router } from 'express';
import {
  computePropertyCompletion,
  createPropertySchema,
  STORAGE_BUCKETS,
  updatePropertySchema,
  type Property,
  type PropertyDetail,
  type PropertySummary,
  type ValueSource,
} from '@propittu/shared';
import { auth } from '../auth.js';
import { audit } from '../audit.js';
import { must, notFound, ok, uuidParam } from '../errors.js';
import { assertOwnsProperty } from '../ownership.js';
import { enforceLimit, planOf, requireFeature } from '../plan.js';
import { removeObjects, signDownloads } from '../storage.js';
import { listReadyPhotos } from './photos.js';
import { listReadyVideos } from './videos.js';

/** Properties CRUD (§8.2, §17, M2). */
export const propertiesRouter = Router();

/** Every column the client sees. user_id is never returned — it is implied. */
const PROPERTY_COLUMNS =
  'id, property_type, name, address_line, city, state, pincode, latitude, longitude, ' +
  'area_value, area_unit, survey_number, property_number, khata_number, notes, ' +
  'location_source, location_confirmed_at, field_sources, created_at, updated_at';

const SUMMARY_COLUMNS =
  'id, property_type, name, city, state, created_at, document_count, service_request_count, ' +
  'cover_photo_path, photo_count, video_count';

type PropertyRow = Property;

interface SummaryRow extends Omit<PropertySummary, 'cover_photo_url'> {
  cover_photo_path: string | null;
}

/** PostgREST returns numeric columns as numbers, but be defensive about strings. */
function toProperty(row: PropertyRow): Property {
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

  const rows = must<SummaryRow[]>(
    await db
      .from('property_summaries')
      .select(SUMMARY_COLUMNS)
      .eq('account_id', accountId)
      .order('created_at', { ascending: false }),
  );

  const coverPaths = rows.flatMap((r) => (r.cover_photo_path ? [r.cover_photo_path] : []));
  const urls = await signDownloads(db, STORAGE_BUCKETS.photos, coverPaths);

  const data: PropertySummary[] = rows.map(({ cover_photo_path, ...r }) => ({
    ...r,
    cover_photo_url: cover_photo_path ? (urls.get(cover_photo_path) ?? null) : null,
  }));

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
  const existing = await db
    .from('properties')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId);
  must(existing);
  enforceLimit(plan, 'max_properties', existing.count ?? 0, 1, 'properties');

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
  const [photos, videos] = await Promise.all([
    listReadyPhotos(db, accountId, id),
    listReadyVideos(db, accountId, id),
  ]);

  const data: PropertyDetail = {
    ...property,
    photos,
    videos,
    document_count: counts?.document_count ?? 0,
    service_request_count: counts?.service_request_count ?? 0,
    completion: computePropertyCompletion({ property, photoCount: photos.length, documentTypes }),
  };

  ok(res, data);
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
