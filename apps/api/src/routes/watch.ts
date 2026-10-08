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
        'id, place_id, url, title, snippet, domain, published_at, ai_status, relevant, category, impact, summary, ai_confidence, review, reviewed_at',
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
    rows.map((r) => ({ ...r, place_name: names.get(r.place_id) ?? null })),
  );
});
