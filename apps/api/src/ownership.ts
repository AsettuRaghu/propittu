import type { SupabaseClient } from '@supabase/supabase-js';
import { must, notFound } from './errors.js';

/**
 * Asserts the property exists AND belongs to the caller. Every nested
 * resource (photos, documents, service requests) calls this first.
 *
 * Someone else's property and a non-existent one both read as 404, so
 * property ids cannot be probed. RLS would hide the row anyway; this
 * check exists so the API fails clearly instead of relying on it.
 */
export async function assertOwnsProperty(
  db: SupabaseClient,
  userId: string,
  propertyId: string,
): Promise<void> {
  const row = must<{ id: string } | null>(
    await db
      .from('properties')
      .select('id')
      .eq('id', propertyId)
      .eq('user_id', userId)
      .maybeSingle(),
  );
  if (!row) throw notFound('Property');
}
