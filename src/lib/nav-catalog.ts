/** Dedupe and prefer real catalog rows for header dropdowns. */

export type NavCatalogItem = { id: string; title: string };

function normalizeTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/[«»""„]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function preferenceScore(id: string) {
  if (id.startsWith('crm_')) return 40;
  if (id.startsWith('seed_')) return 20;
  if (id.startsWith('qa_')) return 5;
  return 30;
}

/**
 * Collapse near-duplicate titles (e.g. «Дом молодёжи» / «Дом Молодёжи»),
 * drop QA/demo-ish ids when a better twin exists, keep at most `limit` items.
 */
export function pickNavCatalog(items: NavCatalogItem[], limit = 6): NavCatalogItem[] {
  const best = new Map<string, NavCatalogItem & { score: number }>();
  for (const item of items) {
    const key = normalizeTitle(item.title || '');
    if (!key) continue;
    const score = preferenceScore(item.id);
    const prev = best.get(key);
    if (!prev || score > prev.score) {
      best.set(key, { id: item.id, title: item.title, score });
    }
  }
  return Array.from(best.values())
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'ru'))
    .slice(0, limit)
    .map(({ id, title }) => ({ id, title }));
}

/** Slugs/paths already present as primary header links — skip in «Ещё». */
export const PRIMARY_HEADER_PATHS = new Set([
  '/projects',
  '/clubs',
  '/spaces',
  '/events',
  '/gallery',
  '/places',
  '/news',
  '/vacancies',
  '/contests',
]);

const PRIMARY_HEADER_TITLES = new Set([
  'новости',
  'афиша',
  'галерея',
  'проекты',
  'клубы',
  'пространства',
  'куда сходить',
  'вакансии',
  'конкурсы',
  'о нас',
]);

export function isPrimaryHeaderSlug(slug: string, title?: string) {
  const s = String(slug || '')
    .trim()
    .toLowerCase();
  if (s) {
    if (PRIMARY_HEADER_PATHS.has(`/${s}`)) return true;
    if (s === 'about' || s === 'news' || s === 'events' || s === 'gallery') return true;
  }
  const label = String(title || '')
    .trim()
    .toLowerCase();
  if (label && PRIMARY_HEADER_TITLES.has(label)) return true;
  return false;
}
