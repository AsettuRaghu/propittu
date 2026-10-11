import type { DisputeItem } from '@propittu/shared';

const urlKey = (u: string) =>
  u
    .trim()
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .toLowerCase();

/** Items worth the team's look: about this project or this land, on a page really found. */
export function relevantDisputes(items: DisputeItem[], sources: string[]): DisputeItem[] {
  const seen = new Set(sources.map(urlKey));
  return items.filter(
    (i) => seen.has(urlKey(i.url)) && (i.about === 'this_project' || i.about === 'this_land'),
  );
}
