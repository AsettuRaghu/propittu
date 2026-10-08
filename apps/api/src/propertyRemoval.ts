import type { SupabaseClient } from '@supabase/supabase-js';
import { OPEN_REQUEST_STATUSES, STORAGE_BUCKETS } from '@propittu/shared';
import { cancelOpenLinks } from './billing/billing.js';
import { must } from './errors.js';
import { removeObjects } from './storage.js';

/**
 * Deletes a property: storage objects first, then the row. The reverse
 * order risks orphaned files nobody can see or delete. Media/document rows
 * cascade with the property; service requests survive with property_id
 * nulled (§8.4). Used by DELETE /properties/:id and by draft clean-up.
 */
export async function removeProperty(
  db: SupabaseClient,
  accountId: string,
  id: string,
): Promise<void> {
  // Its open requests are cancelled by the database (before-delete trigger);
  // their payment links must not stay payable either.
  const { data: open } = await db
    .from('service_requests')
    .select('id')
    .eq('property_id', id)
    .in('status', OPEN_REQUEST_STATUSES);
  await Promise.all(
    (open ?? []).map((r: { id: string }) =>
      cancelOpenLinks({ kind: 'extra_service', requestId: r.id }),
    ),
  );
  const [photos, documents, videos] = await Promise.all(
    (['property_photos', 'property_documents', 'property_videos'] as const).map((table) =>
      db.from(table).select('storage_path').eq('property_id', id).eq('account_id', accountId),
    ),
  );
  const paths = (r: { storage_path: string }[]) => r.map((x) => x.storage_path);
  await removeObjects(db, STORAGE_BUCKETS.photos, paths(must(photos!)));
  await removeObjects(db, STORAGE_BUCKETS.documents, paths(must(documents!)));
  await removeObjects(db, STORAGE_BUCKETS.videos, paths(must(videos!)));
  must(await db.from('properties').delete().eq('id', id).eq('account_id', accountId));
}
