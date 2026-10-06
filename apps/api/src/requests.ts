import type { SupabaseClient } from '@supabase/supabase-js';
import {
  STORAGE_BUCKETS,
  type VisitCondition,
  type VisitMedia,
  type VisitReport,
} from '@propittu/shared';
import { must } from './errors.js';
import { signDownloads } from './storage.js';

/**
 * Service requests (M4): the columns every caller sees and the visit
 * report loader, shared by the customer routes and the Backoffice.
 */

export const REQUEST_COLUMNS =
  'id, reference, status, description, coverage, price_paise, preferred_date, preferred_slot, scheduled_for, ' +
  'status_note, confirmed_at, completed_at, cancelled_at, cancelled_by, created_at, updated_at, ' +
  'service:services(id, code, name, category), ' +
  'property:properties(id, name, city)';

interface ReportRow {
  id: string;
  visited_at: string;
  condition: VisitCondition;
  observations: string;
  issues: string;
  recommendations: string;
  updated_at: string;
  media: {
    id: string;
    kind: 'photo' | 'video';
    mime_type: string;
    storage_path: string;
    upload_status: 'pending' | 'ready';
    created_at: string;
  }[];
}

/** The visit report for a request, with signed media URLs (ready files only). */
export async function loadReport(
  db: SupabaseClient,
  requestId: string,
): Promise<VisitReport | null> {
  const row = must<ReportRow | null>(
    await db
      .from('visit_reports')
      .select(
        'id, visited_at, condition, observations, issues, recommendations, updated_at, ' +
          'media:visit_report_media(id, kind, mime_type, storage_path, upload_status, created_at)',
      )
      .eq('service_request_id', requestId)
      .maybeSingle(),
  );
  if (!row) return null;

  const ready = row.media
    .filter((m) => m.upload_status === 'ready')
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const [photoUrls, videoUrls] = await Promise.all([
    signDownloads(
      db,
      STORAGE_BUCKETS.photos,
      ready.filter((m) => m.kind === 'photo').map((m) => m.storage_path),
    ),
    signDownloads(
      db,
      STORAGE_BUCKETS.videos,
      ready.filter((m) => m.kind === 'video').map((m) => m.storage_path),
    ),
  ]);

  const media: VisitMedia[] = ready.map((m) => ({
    id: m.id,
    kind: m.kind,
    mime_type: m.mime_type,
    url: (m.kind === 'photo' ? photoUrls : videoUrls).get(m.storage_path) ?? null,
    created_at: m.created_at,
  }));

  return {
    id: row.id,
    visited_at: row.visited_at,
    condition: row.condition,
    observations: row.observations,
    issues: row.issues,
    recommendations: row.recommendations,
    updated_at: row.updated_at,
    media,
  };
}

/** Today's date in India (YYYY-MM-DD), for "not in the past" checks. */
export function todayInIndia(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}
