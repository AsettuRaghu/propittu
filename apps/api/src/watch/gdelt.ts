/**
 * GDELT DOC 2.0 — an open, free index of world news (no key). We take only
 * headline, link, source and date; articles stay with their publishers.
 * https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
 */
export interface Headline {
  url: string;
  title: string;
  domain: string | null;
  published_at: string | null;
}

/** "20261002T040000Z" → ISO */
const toIso = (s: string | undefined) =>
  s && /^\d{8}T\d{6}Z$/.test(s)
    ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`
    : null;

export async function searchNews(query: string, days: number, max = 25): Promise<Headline[]> {
  const params = new URLSearchParams({
    query: `${query} sourcecountry:IN`,
    mode: 'artlist',
    format: 'json',
    maxrecords: String(max),
    timespan: `${Math.max(1, Math.min(days, 90))}d`,
    sort: 'datedesc',
  });
  const res = await fetch(`https://api.gdeltproject.org/api/v2/doc/doc?${params}`, {
    signal: AbortSignal.timeout(20_000),
    headers: {
      'User-Agent': 'Propittu/1.0 (property-care app; contact via propittu-api.vercel.app)',
    },
  });
  // GDELT allows about one request every 5 seconds; callers space them out.
  if (res.status === 429) throw new Error('GDELT rate limit (429) — try again later');
  if (!res.ok) throw new Error(`GDELT ${res.status}`);
  const text = await res.text();
  let json: { articles?: { url?: string; title?: string; domain?: string; seendate?: string }[] };
  try {
    json = JSON.parse(text);
  } catch {
    // GDELT answers plain text for empty or malformed queries.
    return [];
  }
  return (json.articles ?? [])
    .filter((a) => a.url && a.title)
    .map((a) => ({
      url: a.url!.slice(0, 2000),
      title: a.title!.replace(/\s+/g, ' ').trim().slice(0, 500),
      domain: a.domain ?? null,
      published_at: toIso(a.seendate),
    }));
}
