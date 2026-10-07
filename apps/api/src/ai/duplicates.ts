import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { STORAGE_BUCKETS } from '@propittu/shared';

/**
 * Has this deed been seen before? Checked BEFORE any AI call, so the same
 * file uploaded twice costs nothing:
 *
 *   1. Same file — documents of the same size in the account are compared
 *      by SHA-256 (fingerprints are computed once and kept).
 *   2. Same deed, different scan — after a reading, its registration number
 *      is matched against facts already confirmed for other properties.
 */

export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

interface Doc {
  id: string;
  property_id: string;
  storage_path: string;
  content_sha256: string | null;
}

/** Another document in the account with exactly the same file, if any. */
export async function findSameFile(
  db: SupabaseClient,
  accountId: string,
  documentId: string,
  fileSize: number,
  hash: string,
): Promise<{ id: string; property_id: string } | null> {
  const { data } = await db
    .from('property_documents')
    .select('id, property_id, storage_path, content_sha256')
    .eq('account_id', accountId)
    .eq('file_size', fileSize)
    .eq('upload_status', 'ready')
    .neq('id', documentId)
    .order('created_at', { ascending: true })
    .limit(5);
  for (const d of (data ?? []) as Doc[]) {
    let theirs = d.content_sha256;
    if (!theirs) {
      const { data: file } = await db.storage
        .from(STORAGE_BUCKETS.documents)
        .download(d.storage_path);
      if (!file) continue;
      theirs = sha256(new Uint8Array(await file.arrayBuffer()));
      await db.from('property_documents').update({ content_sha256: theirs }).eq('id', d.id);
    }
    if (theirs === hash) return { id: d.id, property_id: d.property_id };
  }
  return null;
}

const norm = (v: unknown) =>
  String(Array.isArray(v) ? v[0] : (v ?? ''))
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** A property in the locker whose deed has the same registration number. */
export async function findSameRegistration(
  db: SupabaseClient,
  accountId: string,
  propertyId: string,
  registration: unknown,
): Promise<string | null> {
  const mine = norm(registration);
  if (mine.length < 4) return null;
  const { data } = await db
    .from('property_facts')
    .select('property_id, value, final_value, status, property:properties!inner(is_draft)')
    .eq('account_id', accountId)
    .eq('key', 'registration_number')
    .neq('property_id', propertyId)
    .eq('property.is_draft', false)
    .in('status', ['confirmed', 'edited', 'suggested']);
  const hit = (data ?? []).find(
    (f: { value: unknown; final_value: unknown; status: string }) =>
      norm(f.status === 'edited' ? f.final_value : f.value) === mine,
  );
  return hit ? (hit as { property_id: string }).property_id : null;
}
