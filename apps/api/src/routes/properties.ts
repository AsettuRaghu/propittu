import { waitUntil } from '@vercel/functions';
import { Router } from 'express';
import {
  computePropertyCompletion,
  createPropertySchema,
  OPEN_REQUEST_STATUSES,
  STORAGE_BUCKETS,
  updatePropertySchema,
  type Property,
  type PropertyDetail,
  type PropertySummary,
  locationIssueText,
  type ServiceFulfilment,
  type ServiceRequestStatus,
  type ValueSource,
} from '@propittu/shared';
import { auth } from '../auth.js';
import { audit } from '../audit.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { invalid, must, notFound, ok, uuidParam } from '../errors.js';
import { assertOwnsProperty } from '../ownership.js';
import { enforceLimit, planOf, requireFeature } from '../plan.js';
import { removeProperty } from '../propertyRemoval.js';
import { signDownloads } from '../storage.js';
import { loadReach } from '../reach.js';
import {
  addressAt,
  findIssue,
  loadDeedPlaces,
  refreshLocationCheck,
  within,
} from '../locationCheck.js';
import { checkRecord, deedKey, storedIssue } from '../locationRecord.js';
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

export type PropertyRow = Property & { location_check?: unknown };
/** The server's last pin-vs-PIN-code check rides along; it is never sent as is. */
const WITH_CHECK = `${PROPERTY_COLUMNS}, location_check`;

interface SummaryRow extends Omit<
  PropertySummary,
  'cover_photo_url' | 'completion_percent' | 'next_step' | 'active_request'
> {
  cover_photo_path: string | null;
}

/** PostgREST returns numeric columns as numbers, but be defensive about strings. */
export function toProperty({ location_check: _check, ...row }: PropertyRow): Property {
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
export function withProvenance(
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
  const [summaryRes, propertyRes, documentRes, requestRes, photoRes] = await Promise.all([
    db
      .from('property_summaries')
      .select(SUMMARY_COLUMNS)
      .eq('account_id', accountId)
      .eq('is_draft', false)
      .order('created_at', { ascending: false }),
    db.from('properties').select(WITH_CHECK).eq('account_id', accountId),
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
    db
      .from('property_photos')
      .select('property_id, storage_path')
      .eq('account_id', accountId)
      .eq('upload_status', 'ready')
      .order('created_at', { ascending: true }),
  ]);
  const rows = must<SummaryRow[]>(summaryRes);
  const propertyRows = must<PropertyRow[]>(propertyRes);
  const properties = new Map(propertyRows.map((p) => [p.id, toProperty(p)]));
  const checks = new Map(propertyRows.map((p) => [p.id, p.location_check]));
  // Up to five photos per property, for the swipeable cover.
  const photoPaths = new Map<string, string[]>();
  for (const ph of must<{ property_id: string; storage_path: string }[]>(photoRes)) {
    const list = photoPaths.get(ph.property_id) ?? [];
    if (list.length < 5) photoPaths.set(ph.property_id, [...list, ph.storage_path]);
  }
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

  const deeds = await loadDeedPlaces(
    db,
    rows.map((r) => r.id),
  );
  const coverPaths = [
    ...rows.flatMap((r) => (r.cover_photo_path ? [r.cover_photo_path] : [])),
    ...[...photoPaths.values()].flat(),
  ];
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
      latitude: property?.latitude ?? null,
      longitude: property?.longitude ?? null,
      location_approximate:
        !!property && property.latitude !== null && property.location_source !== 'user',
      photo_urls: (photoPaths.get(r.id) ?? []).flatMap((path) => urls.get(path) ?? []),
      location_issue: property
        ? storedIssue(checks.get(r.id), property, deedKey(deeds.get(r.id) ?? null)).issue
        : null,
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
export async function countConfirmed(db: SupabaseClient, accountId: string): Promise<number> {
  return Number(must<number>(await db.rpc('property_slots_used', { p_account: accountId })) ?? 0);
}

propertiesRouter.get('/properties/:id', async (req, res) => {
  const { db, accountId } = auth(req);
  const id = uuidParam(req.params.id, 'Property');

  const [propertyResult, summaryResult, documentsResult] = await Promise.all([
    db.from('properties').select(WITH_CHECK).eq('id', id).eq('account_id', accountId).maybeSingle(),
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
  // Pin vs PIN code: the stored check, redone after the response when out of date.
  const deed = (await loadDeedPlaces(db, [id])).get(id) ?? null;
  const check = storedIssue(row.location_check, property, deedKey(deed));
  if (check.stale) waitUntil(refreshLocationCheck(id, property, deed, check.confirmed));
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
    location_issue: check.issue,
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
  //   address_from_pin  "the pin is right": take the PIN code, city and state from it
  //   pin_confirmed     "the pin is right" although the deed names a place far from it
  const {
    address_from_pin: addressFromPin,
    pin_confirmed: pinConfirmedFlag,
    ...input
  } = updatePropertySchema.parse(req.body);
  const pinConfirmed = !!(pinConfirmedFlag || addressFromPin);

  const existing = must<
    | (Pick<Property, 'pincode' | 'latitude' | 'longitude'> & {
        field_sources: Partial<Record<string, ValueSource>>;
      })
    | null
  >(
    await db
      .from('properties')
      .select('field_sources, pincode, latitude, longitude')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle(),
  );
  if (!existing) throw notFound('Property');

  // The pin must agree with the PIN code and with the deed's place.
  const after = {
    pincode: input.pincode !== undefined ? input.pincode : existing.pincode,
    latitude: input.latitude !== undefined ? input.latitude : toNum(existing.latitude),
    longitude: input.longitude !== undefined ? input.longitude : toNum(existing.longitude),
  };
  const pinMoved = 'latitude' in input;
  const pincodeChanged = input.pincode !== undefined && input.pincode !== existing.pincode;
  const hasPin = after.latitude !== null && after.longitude !== null;
  let check: ReturnType<typeof checkRecord> | undefined;

  if (hasPin && (pinMoved || addressFromPin || pinConfirmed || pincodeChanged)) {
    // "The pin is right", or a pin for a property with no PIN code yet: the pin's address wins.
    if (addressFromPin || (pinMoved && !after.pincode)) {
      const here = await within(addressAt(after.latitude!, after.longitude!), 8000);
      if (here?.pincode) {
        Object.assign(input, {
          pincode: here.pincode,
          ...(here.city && (addressFromPin || !existing.pincode) ? { city: here.city } : {}),
          ...(here.state && (addressFromPin || !existing.pincode) ? { state: here.state } : {}),
        });
        after.pincode = here.pincode;
      }
    }
    const deed = (await loadDeedPlaces(db, [id])).get(id) ?? null;
    const issue = await within(findIssue(after, deed, pinConfirmed), 9000);
    if (issue && pinMoved && !pinConfirmed) {
      const message = locationIssueText(issue);
      throw invalid(message, {
        latitude: message,
        kind: issue.kind,
        pin_place: issue.pin_place,
        other_place: issue.other_place,
      });
    }
    if (issue?.kind === 'pincode' && pincodeChanged && !pinMoved) {
      throw invalid(locationIssueText(issue), {
        pincode: `PIN code ${issue.pincode} is in ${issue.other_place}, about ${issue.distance_km} km from the pin on the map. Check the PIN code, or move the pin.`,
      });
    }
    // Stored either way: an issue stays on the property until it is resolved.
    if (issue !== null || pinConfirmed || pinMoved || pincodeChanged) {
      check = checkRecord(after, issue, deedKey(deed), pinConfirmed);
    }
  }

  const row = must<PropertyRow | null>(
    await db
      .from('properties')
      .update({
        ...withProvenance(input, existing.field_sources ?? {}),
        ...(check !== undefined ? { location_check: check } : {}),
      })
      .eq('id', id)
      .eq('account_id', accountId)
      .select(PROPERTY_COLUMNS)
      .maybeSingle(),
  );
  if (!row) throw notFound('Property');

  if (pinMoved) {
    await audit(auth(req), 'property.location_confirmed', { type: 'property', id });
  }
  ok(res, toProperty(row));
});

const toNum = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/* DELETE /properties/:id */
propertiesRouter.delete('/properties/:id', async (req, res) => {
  const { db, accountId } = auth(req);
  const id = uuidParam(req.params.id, 'Property');
  await assertOwnsProperty(db, accountId, id);
  await removeProperty(db, accountId, id);
  await audit(auth(req), 'property.deleted', { type: 'property', id });
  res.status(204).end();
});
