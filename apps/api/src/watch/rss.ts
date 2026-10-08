import type { Headline } from './gdelt.js';

/**
 * City news feeds (RSS) published by newspapers for syndication. We keep the
 * headline, link, the feed's own short description and the date — never the
 * article. A feed covers a whole city; a story is matched to a locality only
 * when it names it.
 */
const FEEDS: { matches: (district: string, state: string) => boolean; urls: string[] }[] = [
  {
    matches: (d, s) => s === 'Karnataka' && /bangalore|bengaluru/i.test(d),
    urls: [
      'https://timesofindia.indiatimes.com/rssfeeds/-2128833038.cms',
      'https://www.thehindu.com/news/cities/bangalore/feeder/default.rss',
    ],
  },
  {
    matches: (d, s) =>
      s === 'Telangana' && /hyderabad|rangareddy|ranga reddy|medchal|sangareddy/i.test(d),
    urls: [
      'https://timesofindia.indiatimes.com/rssfeeds/-2128816011.cms',
      'https://www.thehindu.com/news/cities/Hyderabad/feeder/default.rss',
    ],
  },
];

export const feedsFor = (district: string, state: string) =>
  FEEDS.filter((f) => f.matches(district, state)).flatMap((f) => f.urls);

export interface FeedItem extends Headline {
  snippet: string | null;
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
const tag = (item: string, name: string) => {
  const m = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1] ?? '') : '';
};

/** Parse an RSS document into items (no XML library needed for feeds this simple). */
export function parseFeed(xml: string, url: string): FeedItem[] {
  const domain = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  })();
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].flatMap((m) => {
    const item = m[1] ?? '';
    const title = tag(item, 'title');
    const link = tag(item, 'link') || tag(item, 'guid');
    if (!title || !/^https?:\/\//.test(link)) return [];
    const date = Date.parse(tag(item, 'pubDate'));
    return [
      {
        url: link.slice(0, 2000),
        title: title.slice(0, 500),
        snippet: tag(item, 'description').slice(0, 600) || null,
        domain,
        published_at: Number.isFinite(date) ? new Date(date).toISOString() : null,
      },
    ];
  });
}

export async function fetchFeed(url: string): Promise<FeedItem[]> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Propittu/1.0)' },
  });
  if (!res.ok) throw new Error(`Feed ${res.status}`);
  return parseFeed(await res.text(), url);
}

/** Does the story name this locality? Whole words, case-insensitive. */
export function mentions(item: FeedItem, place: string): boolean {
  const name = place.trim();
  if (name.length < 4) return false;
  const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return re.test(item.title) || (!!item.snippet && re.test(item.snippet));
}
