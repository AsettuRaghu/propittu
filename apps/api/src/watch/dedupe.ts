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
