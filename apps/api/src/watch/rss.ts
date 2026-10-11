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

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
};

/** Parse an RSS document into items (no XML library needed for feeds this simple). */
export function parseFeed(xml: string, url: string): FeedItem[] {
  const domain = hostOf(url);
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].flatMap((m) => {
    const item = m[1] ?? '';
    // Aggregated feeds (Google News) name the publisher: <source url="…">Name</source>.
    const source = item.match(/<source[^>]*url="([^"]+)"[^>]*>([\s\S]*?)<\/source>/i);
    const publisher = source ? decode(source[2] ?? '') : '';
    let title = tag(item, 'title');
    if (publisher && title.endsWith(` - ${publisher}`)) {
      title = title.slice(0, -(publisher.length + 3)).trim();
    }
    const link = tag(item, 'link') || tag(item, 'guid');
    if (!title || !/^https?:\/\//.test(link)) return [];
    const date = Date.parse(tag(item, 'pubDate'));
    return [
      {
        url: link.slice(0, 2000),
        title: title.slice(0, 500),
        // Google News descriptions only repeat the headline as links.
        snippet: publisher ? null : tag(item, 'description').slice(0, 600) || null,
        domain: source ? (hostOf(source[1] ?? '') ?? domain) : domain,
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

/** Spellings of a place name that local papers mix up (Lingampalli / Lingampally). */
export function spellings(name: string): string[] {
  const n = name.trim();
  const out = new Set([n]);
  if (/palli$/i.test(n)) out.add(n.replace(/palli$/i, 'pally'));
  if (/pally$/i.test(n)) out.add(n.replace(/pally$/i, 'palli'));
  if (/halli$/i.test(n)) out.add(n.replace(/halli$/i, 'hally'));
  if (/enahalli$/i.test(n)) out.add(n.replace(/enahalli$/i, 'anahalli'));
  if (/anahalli$/i.test(n)) out.add(n.replace(/anahalli$/i, 'enahalli'));
  if (/pet$/i.test(n)) out.add(n.replace(/pet$/i, 'pete'));
  if (/pete$/i.test(n)) out.add(n.replace(/pete$/i, 'pet'));
  return [...out];
}

/**
 * Google News' public RSS search for one locality (all Indian publishers,
 * last `days` days). Unlike city feeds, the search itself matches the name,
 * including in the article body; Pittu then decides what's relevant.
 */
export function localNewsUrl(name: string, days: number): string {
  const q = `${spellings(name)
    .map((s) => `"${s}"`)
    .join(' OR ')} when:${Math.max(1, Math.min(days, 30))}d`;
  return `https://news.google.com/rss/search?${new URLSearchParams({
    q,
    hl: 'en-IN',
    gl: 'IN',
    ceid: 'IN:en',
  })}`;
}
