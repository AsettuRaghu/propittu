import { Router } from 'express';
import {
  createPropertySchema,
  STORAGE_BUCKETS,
  updatePropertySchema,
  type Property,
  type PropertyDetail,
  type PropertySummary,
} from '@propittu/shared';
import { auth } from '../auth.js';
import { must, notFound, ok, uuidParam } from '../errors.js';
import { assertOwnsProperty } from '../ownership.js';
import { removeObjects, signDownloads } from '../storage.js';
import { listReadyPhotos } from './photos.js';

/** Properties CRUD (§8.2, §17, §30). */
export const propertiesRouter = Router();

/** Every column the client sees. user_id is never returned — it is implied. */
const PROPERTY_COLUMNS =
  'id, property_type, name, address_line, city, state, pincode, latitude, longitude, ' +
  'area_value, area_unit, survey_number, property_number, khata_number, notes, created_at, updated_at';

const SUMMARY_COLUMNS =
  'id, property_type, name, city, state, created_at, document_count, service_request_count, cover_photo_path';

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
  };
}

/* ------------------------------------------------------------------ *
 * GET /properties — Home cards (§15)
 * ------------------------------------------------------------------ */

propertiesRouter.get('/properties', async (req, res) => {
  const { db, userId } = auth(req);

  const rows = must<SummaryRow[]>(
    await db
      .from('property_summaries')
      .select(SUMMARY_COLUMNS)
      .eq('user_id', userId)
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
  const { db, userId } = auth(req);
  const input = createPropertySchema.parse(req.body);

  const row = must<PropertyRow>(
    await db
      .from('properties')
      .insert({ ...input, user_id: userId })
      .select(PROPERTY_COLUMNS)
      .single(),
  );

  ok(res, toProperty(row), 201);
});

/* ------------------------------------------------------------------ *
 * GET /properties/:id — Property details (§18)
 * ------------------------------------------------------------------ */

propertiesRouter.get('/properties/:id', async (req, res) => {
  const { db, userId } = auth(req);
  const id = uuidParam(req.params.id, 'Property');

  const [propertyResult, summaryResult] = await Promise.all([
    db.from('properties').select(PROPERTY_COLUMNS).eq('id', id).eq('user_id', userId).maybeSingle(),
    db
      .from('property_summaries')
      .select('document_count, service_request_count')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const property = must<PropertyRow | null>(propertyResult);
  if (!property) throw notFound('Property');
  const counts = must<Pick<PropertySummary, 'document_count' | 'service_request_count'> | null>(
    summaryResult,
  );

  const data: PropertyDetail = {
    ...toProperty(property),
    photos: await listReadyPhotos(db, userId, id),
    document_count: counts?.document_count ?? 0,
    service_request_count: counts?.service_request_count ?? 0,
  };

  ok(res, data);
});

/* ------------------------------------------------------------------ *
 * PATCH /properties/:id
 * ------------------------------------------------------------------ */

propertiesRouter.patch('/properties/:id', async (req, res) => {
  const { db, userId } = auth(req);
  const id = uuidParam(req.params.id, 'Property');
  const input = updatePropertySchema.parse(req.body);

  const row = must<PropertyRow | null>(
    await db
      .from('properties')
      .update(input)
      .eq('id', id)
      .eq('user_id', userId)
      .select(PROPERTY_COLUMNS)
      .maybeSingle(),
  );
  if (!row) throw notFound('Property');

  ok(res, toProperty(row));
});

/* ------------------------------------------------------------------ *
 * DELETE /properties/:id
 *
 * Storage objects first, then the row. The reverse order risks orphaned
 * files nobody can see or delete. Photo/document rows cascade with the
 * property; service requests survive with property_id nulled (§8.4).
 * ------------------------------------------------------------------ */

propertiesRouter.delete('/properties/:id', async (req, res) => {
  const { db, userId } = auth(req);
  const id = uuidParam(req.params.id, 'Property');
  await assertOwnsProperty(db, userId, id);

  const [photos, documents] = await Promise.all([
    db.from('property_photos').select('storage_path').eq('property_id', id).eq('user_id', userId),
    db.from('property_documents').select('storage_path').eq('property_id', id).eq('user_id', userId),
  ]);

  const paths = (r: { storage_path: string }[]) => r.map((x) => x.storage_path);
  await removeObjects(db, STORAGE_BUCKETS.photos, paths(must(photos)));
  await removeObjects(db, STORAGE_BUCKETS.documents, paths(must(documents)));

  must(await db.from('properties').delete().eq('id', id).eq('user_id', userId));

  res.status(204).end();
});
