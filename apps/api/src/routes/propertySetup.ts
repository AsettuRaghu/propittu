import { waitUntil } from '@vercel/functions';
import { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  createPropertySchema,
  PREFILL_FIELDS,
  hasUsefulPrefill,
  prefillFromFacts,
  sameFactValue,
  type AnalysisStatus,
  type DraftProperty,
  type FactValue,
  type PrefillField,
  type PropertyPrefill,
  type ValueSource,
} from '@propittu/shared';
import { assertAiAvailable, isRetryableFailure } from '../ai/jobs.js';
import { audit } from '../audit.js';
import { auth } from '../auth.js';
import { HttpError, must, notFound, ok, uuidParam } from '../errors.js';
import { pincodeArea } from '../geo.js';
import { findIssue, placeFromDeed, within } from '../locationCheck.js';
import { checkRecord, deedKey } from '../locationRecord.js';
import { assertOwnsProperty } from '../ownership.js';
import { enforceLimit, planOf, requireFeature } from '../plan.js';
import { removeProperty } from '../propertyRemoval.js';
import { serviceClient } from '../supabase.js';
import { refreshReview } from './pittu.js';
import {
  countConfirmed,
  PROPERTY_COLUMNS,
  toProperty,
  withProvenance,
  type PropertyRow,
} from './properties.js';

/**
 * Adding a property from its sale deed (Pittu): a draft holds the deed →
 * Pittu reads it → the customer checks and confirms. Mounted before
 * propertiesRouter so /properties/drafts isn't taken for an id.
 */
export const propertySetupRouter = Router();

/* ------------------------------------------------------------------ *
 * Sale Deed path (Pittu): draft → deed read → customer confirms
 * ------------------------------------------------------------------ */

/** Unfinished deed set-ups kept at once (they never count toward the plan). */
const MAX_OPEN_DRAFTS = 2;

/* POST /properties/draft — a placeholder the deed can be stored against */
propertySetupRouter.post('/properties/draft', async (req, res) => {
  const ctx = auth(req);
  assertAiAvailable(ctx.accountId);
  const plan = planOf(req);
  requireFeature(plan, 'property_profile', 'Adding properties');
  // Check the limit now, so nobody reads a deed only to be refused at the end.
  enforceLimit(plan, 'max_properties', await countConfirmed(ctx.db, ctx.accountId), 1, [
    'property',
    'properties',
  ]);
  await clearStaleDrafts(ctx.db, ctx.accountId);
  const remaining = await ctx.db
    .from('properties')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', ctx.accountId)
    .eq('is_draft', true);
  must(remaining);
  if ((remaining.count ?? 0) >= MAX_OPEN_DRAFTS) {
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

/* GET /properties/drafts — unfinished deed set-ups, for "Waiting for you" on Home */
propertySetupRouter.get('/properties/drafts', async (req, res) => {
  const { db, accountId } = auth(req);
  const all = await loadDrafts(db, accountId);
  const read = await readings(db, all);
  // Attempts Pittu found nothing in are never "waiting": hidden at once, and
  // removed once the customer has had time to act on them on the Add screen.
  const drafts: DraftState[] = [];
  for (const d of all) {
    if (!isEmptyAttempt(d, read)) drafts.push(d);
    else if (Date.now() - Date.parse(d.analysis?.finished_at ?? d.created_at) > EMPTY_GRACE_MS) {
      await removeProperty(db, accountId, d.id);
    }
  }
  const dupIds = drafts.flatMap((d) => (d.analysis?.duplicate_of ? [d.analysis.duplicate_of] : []));
  const dupNames = new Map(
    dupIds.length === 0
      ? []
      : must<{ id: string; name: string }[]>(
          await db.from('properties').select('id, name').in('id', dupIds).eq('is_draft', false),
        ).map((p) => [p.id, p.name]),
  );
  const data: DraftProperty[] = drafts.map((d) => {
    const dup = d.analysis?.duplicate_of;
    return {
      id: d.id,
      created_at: d.created_at,
      document_id: d.document_id,
      status: d.analysis?.status ?? null,
      name: nameOf(d.analysis ? read.get(d.analysis.id) : undefined),
      duplicate_of: dup && dupNames.has(dup) ? { id: dup, name: dupNames.get(dup)! } : null,
    };
  });
  ok(res, data);
});

interface DraftState {
  id: string;
  created_at: string;
  document_id: string | null;
  analysis: {
    id: string;
    status: AnalysisStatus;
    error_code: string | null;
    attempts: number;
    duplicate_of: string | null;
    finished_at: string | null;
  } | null;
}

/** Each draft with its deed and the latest reading of it. */
async function loadDrafts(db: SupabaseClient, accountId: string): Promise<DraftState[]> {
  const drafts = must<{ id: string; created_at: string }[]>(
    await db
      .from('properties')
      .select('id, created_at')
      .eq('account_id', accountId)
      .eq('is_draft', true)
      .order('created_at', { ascending: false }),
  );
  const ids = drafts.map((d) => d.id);
  if (ids.length === 0) return [];
  const [docs, analyses] = await Promise.all([
    db
      .from('property_documents')
      .select('id, property_id')
      .in('property_id', ids)
      .eq('document_type', 'sale_deed')
      .eq('upload_status', 'ready')
      .order('created_at', { ascending: false }),
    db
      .from('document_analyses')
      .select('id, property_id, status, error_code, attempts, duplicate_of, finished_at')
      .in('property_id', ids)
      .order('created_at', { ascending: false }),
  ]);
  const docRows = must<{ id: string; property_id: string }[]>(docs);
  const analysisRows =
    must<(NonNullable<DraftState['analysis']> & { property_id: string })[]>(analyses);
  return drafts.map((d) => {
    const a = analysisRows.find((x) => x.property_id === d.id);
    return {
      ...d,
      document_id: docRows.find((x) => x.property_id === d.id)?.id ?? null,
      analysis: a
        ? {
            id: a.id,
            status: a.status,
            error_code: a.error_code,
            attempts: a.attempts,
            duplicate_of: a.duplicate_of,
            finished_at: a.finished_at,
          }
        : null,
    };
  });
}

/** What each finished reading would pre-fill (its facts, as Pittu read them). */
async function readings(
  db: SupabaseClient,
  drafts: DraftState[],
): Promise<Map<string, PropertyPrefill>> {
  const ids = drafts.flatMap((d) => (d.analysis?.status === 'ready' ? [d.analysis.id] : []));
  if (ids.length === 0) return new Map();
  const facts = must<{ analysis_id: string; key: string; value: FactValue }[]>(
    await db.from('property_facts').select('analysis_id, key, value').in('analysis_id', ids),
  );
  return new Map(
    ids.map((id) => [id, prefillFromFacts(facts.filter((f) => f.analysis_id === id))]),
  );
}

/** "Prasanthi Green Park – Site 28" — what Pittu would call a read deed. */
const nameOf = (p: PropertyPrefill | undefined) =>
  typeof p?.name === 'string' && p.name ? p.name : null;

/** Read, but nothing about a property in it — or not a sale deed at all. */
function isEmptyAttempt(d: DraftState, read: Map<string, PropertyPrefill>): boolean {
  const a = d.analysis;
  if (!a) return false;
  if (a.status === 'failed') return a.error_code === 'not_a_sale_deed';
  if (a.status !== 'ready' || a.duplicate_of) return false;
  const p = read.get(a.id);
  return !p || !hasUsefulPrefill(p);
}

/** How long an empty attempt is kept, so the Add screen can still show what happened. */
const EMPTY_GRACE_MS = 10 * 60_000;

const HOUR = 3600_000;

/**
 * Failed and abandoned attempts don't pile up: before a new draft, clear
 * drafts whose deed never arrived (after an hour), whose reading failed for
 * good, that Pittu found nothing in, or that were left for 30 days.
 */
async function clearStaleDrafts(db: SupabaseClient, accountId: string): Promise<void> {
  const now = Date.now();
  const all = await loadDrafts(db, accountId);
  const read = await readings(db, all);
  for (const d of all) {
    const age = now - Date.parse(d.created_at);
    const a = d.analysis;
    const failedForGood =
      a?.status === 'failed' && (!isRetryableFailure(a.error_code) || a.attempts >= 3);
    if (
      (!d.document_id && age > HOUR) ||
      failedForGood ||
      isEmptyAttempt(d, read) ||
      age > 30 * 24 * HOUR
    ) {
      await removeProperty(db, accountId, d.id);
    }
  }
}

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

propertySetupRouter.post('/properties/:id/setup', async (req, res) => {
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
  // Roughly where it is, from the deed's village — done after answering.
  if (row.latitude === null) waitUntil(placeNearDeed(id, facts, input));
  ok(res, toProperty(row));
});

/** The deed's place names (village → state), as Pittu read them. */
function deedPlace(facts: { key: string; value: FactValue }[]) {
  const s = (k: string) => {
    const v = facts.find((f) => f.key === k)?.value;
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  };
  return {
    village: s('village'),
    hobli: s('hobli'),
    taluk: s('taluk_or_mandal'),
    district: s('district'),
    city: s('city'),
    state: s('state'),
    pincode: s('pincode'),
  };
}

/**
 * An approximate pin for a property added from its deed: the village (or
 * the PIN code's area if the two disagree). Marked as from the deed, not
 * confirmed — the property page asks the customer to set the exact spot.
 */
async function placeNearDeed(
  id: string,
  facts: { key: string; value: FactValue }[],
  input: { pincode?: string | null; city?: string | null; state?: string | null },
): Promise<void> {
  if (!serviceClient) return;
  const named = deedPlace(facts);
  const pincode = input.pincode ?? named.pincode;
  const place = await placeFromDeed({
    ...named,
    city: input.city ?? named.city,
    state: input.state ?? named.state,
    pincode,
  });
  if (!place) return;
  let at: { latitude: number; longitude: number } = place;
  if (pincode && (await findIssue({ pincode, ...at }))) {
    const area = await pincodeArea(pincode);
    if (!area) return;
    at = area;
  }
  const latitude = Number(at.latitude.toFixed(6));
  const longitude = Number(at.longitude.toFixed(6));
  await serviceClient
    .from('properties')
    .update({
      latitude,
      longitude,
      location_source: 'sale_deed',
      location_confirmed_at: null,
      location_check: checkRecord(
        { pincode: pincode ?? null, latitude, longitude },
        null,
        deedKey({
          village: named.village,
          hobli: named.hobli,
          taluk: named.taluk,
          district: named.district,
          state: named.state,
        }),
      ),
    })
    .eq('id', id)
    .is('latitude', null);
}

/*
 * GET /properties/:id/place-suggestion — for a draft whose deed has been
 * read: the PIN code, city and state of the deed's village, when the deed
 * itself doesn't say. The customer still checks them before saving.
 */
propertySetupRouter.get('/properties/:id/place-suggestion', async (req, res) => {
  const { db, accountId } = auth(req);
  const id = uuidParam(req.params.id, 'Property');
  await assertOwnsProperty(db, accountId, id);
  const facts = must<{ key: string; value: FactValue }[]>(
    await db
      .from('property_facts')
      .select('key, value')
      .eq('property_id', id)
      .eq('account_id', accountId)
      .in('key', ['village', 'hobli', 'taluk_or_mandal', 'district', 'city', 'state', 'pincode']),
  );
  const named = deedPlace(facts);
  const place = named.village || named.district ? await within(placeFromDeed(named), 9000) : null;
  ok(
    res,
    place
      ? { pincode: place.pincode, city: place.city, state: place.state, near: place.label }
      : null,
  );
});
