import type { CatalogueService } from '@propittu/shared';

/** Services grouped by category, in the order the team set in Backoffice. */
export function serviceGroups(services: CatalogueService[]) {
  const groups = new Map<
    string,
    { code: string; name: string; order: number; items: CatalogueService[] }
  >();
  for (const s of services) {
    const g = groups.get(s.category) ?? {
      code: s.category,
      name: s.category_name,
      order: s.category_order,
      items: [],
    };
    g.items.push(s);
    groups.set(s.category, g);
  }
  return [...groups.values()].sort((a, b) => a.order - b.order);
}
