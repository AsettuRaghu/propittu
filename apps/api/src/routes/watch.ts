import { Router } from 'express';
import type { WatchItem } from '@propittu/shared';
import { auth } from '../auth.js';
import { must, notFound, ok, uuidParam } from '../errors.js';
import { serviceClient } from '../supabase.js';

/**
 * GET /properties/:id/watch — Pittu Watch news the team approved for the
 * property's locality (newest first). Ownership is checked with the owner's
 * own client; the places lookup uses the server key.
 */
export const watchCustomerRouter = Router();

watchCustomerRouter.get('/properties/:id/watch', async (req, res) => {
  const { db, accountId } = auth(req);
  const id = uuidParam(req.params.id, 'Property');
  const prop = must<{ pincode: string | null } | null>(
    await db
      .from('properties')
      .select('pincode')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle(),
  );
  if (!prop) throw notFound('Property');
  if (!prop.pincode || !serviceClient) {
    ok(res, []);
    return;
  }
  const places = must<{ id: string; name: string }[]>(
    await serviceClient
      .from('watch_places')
      .select('id, name')
      .eq('is_active', true)
      .contains('pincodes', [prop.pincode]),
  );
  if (!places.length) {
    ok(res, []);
    return;
  }
  const rows = must<Omit<WatchItem, 'place_name'>[]>(
    await serviceClient
      .from('watch_items')
      .select(
        'id, place_id, url, title, snippet, domain, published_at, ai_status, relevant, category, impact, summary, ai_confidence, review, reviewed_at, auto_approved',
      )
      .in(
        'place_id',
        places.map((p) => p.id),
      )
      .eq('review', 'approved')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(20),
  );
  const names = new Map(places.map((p) => [p.id, p.name]));
  ok(
    res,
    sameStoryOnce(rows).map((r) => ({ ...r, place_name: names.get(r.place_id) ?? null })),
  );
});

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );

/**
 * Several papers often carry the same story: keep the newest of each, where
 * "the same" is a Pittu line or headline sharing most of its words with one
 * already kept from the same week.
 */
export function sameStoryOnce<
  T extends { title: string; summary: string | null; published_at: string | null },
>(items: T[]): T[] {
  const kept: { item: T; words: Set<string> }[] = [];
  for (const item of items) {
    const w = words(item.summary ?? item.title);
    const at = item.published_at ? Date.parse(item.published_at) : 0;
    const dup = kept.some((k) => {
      const kAt = k.item.published_at ? Date.parse(k.item.published_at) : 0;
      if (Math.abs(kAt - at) > 7 * 86_400_000) return false;
      const shared = [...w].filter((x) => k.words.has(x)).length;
      return shared / Math.max(1, Math.min(w.size, k.words.size)) >= 0.6;
    });
    if (!dup) kept.push({ item, words: w });
  }
  return kept.map((k) => k.item);
}
