import type { SupabaseClient } from '@supabase/supabase-js';
import { STORAGE_BUCKETS } from '@propittu/shared';
import { logger } from './logger.js';
import { removeObjects } from './storage.js';

/**
 * Daily clean-up of uploads that were started but never finished (the app
 * asks for an upload URL, then the person goes away). After a day the row is
 * deleted and any partial object removed. Users never see these rows.
 */
type Bucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];
const TABLES: { table: string; bucket: (row: { kind?: string }) => Bucket }[] = [
  { table: 'property_documents', bucket: () => STORAGE_BUCKETS.documents },
  { table: 'property_photos', bucket: () => STORAGE_BUCKETS.photos },
  { table: 'property_videos', bucket: () => STORAGE_BUCKETS.videos },
  { table: 'service_outcome_files', bucket: () => STORAGE_BUCKETS.documents },
  { table: 'support_ticket_attachments', bucket: () => STORAGE_BUCKETS.documents },
  {
    table: 'visit_report_media',
    bucket: (r) => (r.kind === 'video' ? STORAGE_BUCKETS.videos : STORAGE_BUCKETS.photos),
  },
  { table: 'value_sources', bucket: () => STORAGE_BUCKETS.reference },
];

export async function cleanAbandonedUploads(db: SupabaseClient): Promise<number> {
  const before = new Date(Date.now() - 24 * 3600_000).toISOString();
  let removed = 0;
  for (const t of TABLES) {
    const columns =
      t.table === 'visit_report_media' ? 'id, storage_path, kind' : 'id, storage_path';
    const { data, error } = await db
      .from(t.table)
      .select(columns)
      .eq('upload_status', 'pending')
      .lt('created_at', before)
      .limit(500);
    if (error) {
      logger.warn(
        { table: t.table, err: error.message },
        'cleanup: could not list abandoned uploads',
      );
      continue;
    }
    const rows = (data ?? []) as unknown as {
      id: string;
      storage_path: string | null;
      kind?: string;
    }[];
    if (!rows.length) continue;
    const byBucket = new Map<Bucket, string[]>();
    for (const r of rows) {
      if (!r.storage_path) continue;
      const b = t.bucket(r);
      byBucket.set(b, [...(byBucket.get(b) ?? []), r.storage_path]);
    }
    for (const [bucket, paths] of byBucket)
      await removeObjects(db, bucket, paths).catch(() => undefined);
    const del = await db
      .from(t.table)
      .delete()
      .in(
        'id',
        rows.map((r) => r.id),
      );
    if (del.error)
      logger.warn({ table: t.table, err: del.error.message }, 'cleanup: could not delete');
    else removed += rows.length;
  }
  if (removed) logger.info({ removed }, 'cleanup: abandoned uploads removed');
  return removed;
}
