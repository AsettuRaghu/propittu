import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../logger.js';
import { aiConfigured } from '../pittu/core/limits.js';
import { runTask } from '../pittu/core/run.js';
import { newsPrompt, newsTask } from '../pittu/watch/tasks/news.js';
import { searchNews, type Headline } from './gdelt.js';
import { feedsFor, fetchFeed, mentions, type FeedItem } from './rss.js';

/**
 * Pittu Watch — the application layer (docs/PITTU.md): collect headlines per
 * place (no AI), have Pittu read them in batches, and queue the likely
 * relevant ones for the team. Irrelevant ones are filtered out (kept, marked
 * rejected) so the queue stays short. Owners only ever see approved items.
 */

interface Place {
  id: string;
  name: string;
  district: string;
  state: string;
  query: string;
  last_collected_at: string | null;
}

const BATCH = 20;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** City feeds fetched once per run and shared by every place in that city. */
export type FeedCache = Map<string, Promise<FeedItem[]>>;

/**
 * New stories for one place: city feeds that name the locality, plus a GDELT
 * search when it answers (it rate-limits shared servers, so it is optional).
 */
export async function collectPlace(
  db: SupabaseClient,
  place: Place,
  feeds: FeedCache = new Map(),
): Promise<number> {
  const days = place.last_collected_at
    ? Math.ceil((Date.now() - Date.parse(place.last_collected_at)) / 86_400_000) + 1
    : 14;
  const rows: (Headline & { snippet: string | null; source: 'rss' | 'gdelt' })[] = [];
  for (const url of feedsFor(place.district, place.state)) {
    if (!feeds.has(url))
      feeds.set(
        url,
        fetchFeed(url).catch(() => []),
      );
    for (const item of await feeds.get(url)!) {
      if (mentions(item, place.name)) rows.push({ ...item, source: 'rss' });
    }
  }
  try {
    for (const h of await searchNews(place.query, days))
      rows.push({ ...h, snippet: null, source: 'gdelt' });
  } catch (err) {
    logger.info({ err: String(err), place: place.id }, 'watch: news index unavailable this time');
  }
  const unique = [...new Map(rows.map((r) => [r.url, r])).values()];
  if (unique.length) {
    const { error } = await db.from('watch_items').upsert(
      unique.map((r) => ({ place_id: place.id, ...r })),
      { onConflict: 'place_id,url', ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
  }
  const headlines = unique;
  await db
    .from('watch_places')
    .update({ last_collected_at: new Date().toISOString() })
    .eq('id', place.id);
  return headlines.length;
}

/** Pittu reads the place's unread headlines (one AI call per 20). */
export async function readPlace(db: SupabaseClient, place: Place): Promise<number> {
  if (!aiConfigured()) return 0;
  const { data, error } = await db
    .from('watch_items')
    .select('id, title, snippet, domain, published_at')
    .eq('place_id', place.id)
    .eq('ai_status', 'new')
    .order('published_at', { ascending: false })
    .limit(BATCH * 3);
  if (error) throw new Error(error.message);
  const items = (data ?? []) as {
    id: string;
    title: string;
    domain: string | null;
    published_at: string | null;
  }[];
  let read = 0;
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    try {
      const { result } = await runTask(
        db,
        newsTask,
        { documents: [], text: newsPrompt(place, batch) },
        { capability: 'watch', accountId: null },
      );
      for (const [k, item] of batch.entries()) {
        const r = result.find((x) => x.n === k + 1);
        await db
          .from('watch_items')
          .update(
            r
              ? {
                  ai_status: 'read',
                  relevant: r.relevant,
                  category: r.category,
                  impact: r.impact,
                  summary: r.summary,
                  ai_confidence: r.confidence,
                  // Clearly irrelevant: filtered out, still visible to staff.
                  ...(!r.relevant && r.confidence !== 'low' ? { review: 'rejected' } : {}),
                }
              : { ai_status: 'failed' },
          )
          .eq('id', item.id);
        read++;
      }
    } catch (err) {
      logger.warn({ err: String(err), place: place.id }, 'watch: reading failed');
      if (String(err).includes('budget')) return read;
    }
  }
  return read;
}

/** The daily run: places not collected in the last 20 hours, a few at a time. */
export async function runWatch(
  db: SupabaseClient,
  maxPlaces = 20,
): Promise<{ places: number; collected: number; read: number }> {
  const due = new Date(Date.now() - 20 * 3600_000).toISOString();
  const { data } = await db
    .from('watch_places')
    .select('id, name, district, state, query, last_collected_at')
    .eq('is_active', true)
    .or(`last_collected_at.is.null,last_collected_at.lt.${due}`)
    .order('last_collected_at', { ascending: true, nullsFirst: true })
    .limit(maxPlaces);
  let collected = 0;
  let read = 0;
  const feeds: FeedCache = new Map();
  for (const place of (data ?? []) as Place[]) {
    try {
      collected += await collectPlace(db, place, feeds);
      read += await readPlace(db, place);
    } catch (err) {
      logger.warn({ err: String(err), place: place.id }, 'watch: collecting failed');
    }
    await pause(6000); // GDELT allows about one request every 5 seconds
  }
  logger.info({ places: data?.length ?? 0, collected, read }, 'watch: run finished');
  return { places: data?.length ?? 0, collected, read };
}
