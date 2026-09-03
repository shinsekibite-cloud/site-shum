/** Soft catalog categories for projects (no DB column yet). */

export type SoftCategory = {
  id: string;
  label: string;
  match: RegExp;
};

export const PROJECT_SOFT_CATEGORIES: SoftCategory[] = [
  { id: 'kvn', label: 'КВН', match: /квн/i },
  { id: 'forum', label: 'Форумы', match: /форум|слёт|слет/i },
  { id: 'festival', label: 'Фестивали', match: /фестивал|праздник/i },
  { id: 'media', label: 'Медиа', match: /медиа|съём|съем|блог|кино/i },
  { id: 'sport', label: 'Спорт', match: /спорт|турнир|матч|забег/i },
  { id: 'edu', label: 'Обучение', match: /школ|курс|обучен|лектор|мастер/i },
  { id: 'vol', label: 'Добро', match: /волонт|добро|помощ/i },
  { id: 'art', label: 'Творчество', match: /творч|театр|танц|музык|арт/i },
];

export function matchSoftCategory(text: string, cats: SoftCategory[]): SoftCategory | null {
  const hay = String(text || '');
  for (const c of cats) {
    if (c.match.test(hay)) return c;
  }
  return null;
}

export function softCategoryIdsFor(text: string, cats: SoftCategory[]): string[] {
  const hay = String(text || '');
  return cats.filter((c) => c.match.test(hay)).map((c) => c.id);
}
