import { randomUUID } from 'node:crypto';
import { STORAGE_BUCKETS, type RateSource } from '@propittu/shared';
import { logger } from '../logger.js';
import { server } from '../pittu/core/limits.js';
import { runTask } from '../pittu/core/run.js';
import { ratesTask } from '../pittu/value/tasks/rates.js';
import { HttpError, must, notFound } from '../errors.js';
import { signUpload, verifyUploaded } from '../storage.js';

/**
 * Government rate documents for Pittu Value: the team uploads one (private
 * bucket, server key only), Pittu reads it into draft rates, the team checks
 * and publishes. One reading serves every property in the area.
 */

const SOURCE_COLUMNS =
  'id, state, district, office, title, effective_from, upload_status, read_status, read_error, rows_found, created_at';

export async function listSources(): Promise<RateSource[]> {
  const db = server();
  const [sources, rates] = await Promise.all([
    db
      .from('value_sources')
      .select(SOURCE_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(200),
    db.from('value_rates').select('source_id, status').not('source_id', 'is', null).limit(50_000),
  ]);
  const rows = must<{ source_id: string; status: string }[]>(rates);
  return must<Omit<RateSource, 'drafts' | 'published'>[]>(sources).map((s) => ({
    ...s,
    drafts: rows.filter((r) => r.source_id === s.id && r.status === 'draft').length,
    published: rows.filter((r) => r.source_id === s.id && r.status === 'published').length,
  }));
}

export async function createSource(
  input: {
    state: string;
    district: string;
    office?: string | null;
    title: string;
    effective_from?: string | null;
    file_size: number;
  },
  staffUserId: string,
): Promise<{ id: string; upload_url: string }> {
  const db = server();
  const id = randomUUID();
  const path = `rates/${id}.pdf`;
  const { file_size, ...rest } = input;
  must(
    await db
      .from('value_sources')
      .insert({ id, ...rest, storage_path: path, file_size, created_by: staffUserId }),
  );
  return { id, upload_url: await signUpload(db, STORAGE_BUCKETS.reference, path) };
}

export async function confirmSource(id: string): Promise<void> {
  const db = server();
  const s = must<{ storage_path: string } | null>(
    await db.from('value_sources').select('storage_path').eq('id', id).maybeSingle(),
  );
  if (!s) throw notFound('Document');
  await verifyUploaded(db, STORAGE_BUCKETS.reference, s.storage_path, 'application/pdf');
  must(await db.from('value_sources').update({ upload_status: 'ready' }).eq('id', id));
}

/** Pittu reads the document; its rows become DRAFT rates for the team to check. */
export async function readSource(id: string): Promise<void> {
  const db = server();
  const s = must<{
    storage_path: string;
    state: string;
    district: string;
    office: string | null;
    effective_from: string | null;
    upload_status: string;
  } | null>(
    await db
      .from('value_sources')
      .select('storage_path, state, district, office, effective_from, upload_status')
      .eq('id', id)
      .maybeSingle(),
  );
  if (!s) return;
  const fail = (msg: string) =>
    db
      .from('value_sources')
      .update({ read_status: 'failed', read_error: msg.slice(0, 300) })
      .eq('id', id);
  try {
    const { data: file, error } = await db.storage
      .from(STORAGE_BUCKETS.reference)
      .download(s.storage_path);
    if (error || !file) throw new Error('Could not fetch the document');
    const { result } = await runTask(
      db,
      ratesTask,
      { documents: [{ kind: 'pdf', bytes: new Uint8Array(await file.arrayBuffer()) }] },
      { capability: 'value', accountId: null },
    );
    // A new reading replaces the previous drafts (published rates stay).
    await db.from('value_rates').delete().eq('source_id', id).eq('status', 'draft');
    if (result.rows.length) {
      const { error: insertError } = await db.from('value_rates').insert(
        result.rows.map((r) => ({
          source_id: id,
          state: s.state,
          district: s.district,
          office: s.office ?? result.office,
          locality: r.locality,
          survey_numbers: r.survey_numbers,
          kind: r.kind,
          rate_inr: r.rate_inr,
          unit: r.unit,
          effective_from: s.effective_from ?? result.effective_from,
          page: r.page,
          status: 'draft',
        })),
      );
      if (insertError) throw new Error(insertError.message);
    }
    await db
      .from('value_sources')
      .update({
        read_status: 'read',
        read_error: null,
        rows_found: result.rows.length,
        effective_from: s.effective_from ?? result.effective_from,
        office: s.office ?? result.office,
      })
      .eq('id', id);
  } catch (err) {
    logger.warn({ err: String(err), source: id }, 'value: reading the rate document failed');
    await fail(String(err instanceof Error ? err.message : err));
  }
}

export async function startReading(id: string): Promise<void> {
  const db = server();
  const s = must<{ upload_status: string; read_status: string } | null>(
    await db.from('value_sources').select('upload_status, read_status').eq('id', id).maybeSingle(),
  );
  if (!s) throw notFound('Document');
  if (s.upload_status !== 'ready')
    throw new HttpError(409, 'CONFLICT', 'The upload has not finished yet');
  if (s.read_status === 'reading')
    throw new HttpError(409, 'CONFLICT', 'Pittu is already reading it');
  must(
    await db
      .from('value_sources')
      .update({ read_status: 'reading', read_error: null })
      .eq('id', id),
  );
}

/** Publish the checked drafts of a document: from now on they value properties. */
export async function publishSource(id: string): Promise<number> {
  const db = server();
  const rows = must<{ id: string }[]>(
    await db
      .from('value_rates')
      .update({ status: 'published' })
      .eq('source_id', id)
      .eq('status', 'draft')
      .select('id'),
  );
  return rows.length;
}
