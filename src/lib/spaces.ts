/** Space categories and amenity features for catalog filters. */

export const SPACE_CATEGORIES = [
  'Общее',
  'Коворкинг',
  'Зал мероприятий',
  'Студия',
  'Спорт',
  'Игровая зона',
  'Открытая площадка',
  'Образование',
] as const;

export type SpaceCategory = (typeof SPACE_CATEGORIES)[number];

export const SPACE_AMENITIES = [
  { id: 'wifi', label: 'Wi‑Fi' },
  { id: 'gym', label: 'Спортзал' },
  { id: 'game_zone', label: 'Игровая зона' },
  { id: 'projector', label: 'Проектор' },
  { id: 'sound', label: 'Звук / колонки' },
  { id: 'stage', label: 'Сцена' },
  { id: 'kitchen', label: 'Кухня' },
  { id: 'parking', label: 'Парковка' },
  { id: 'aircon', label: 'Кондиционер' },
  { id: 'accessible', label: 'Доступная среда' },
  { id: 'locker', label: 'Гардероб / шкафчики' },
  { id: 'outdoor', label: 'Уличная зона' },
] as const;

export type SpaceAmenityId = (typeof SPACE_AMENITIES)[number]['id'];

const AMENITY_IDS = new Set(SPACE_AMENITIES.map((a) => a.id));

export function parseSpaceAmenities(raw?: string | null): SpaceAmenityId[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.trim())
        .filter((id): id is SpaceAmenityId => AMENITY_IDS.has(id as SpaceAmenityId))
        .slice(0, 20);
    }
  } catch {
    /* comma-separated fallback */
  }
  return raw
    .split(/[,;|]/)
    .map((t) => t.trim())
    .filter((id): id is SpaceAmenityId => AMENITY_IDS.has(id as SpaceAmenityId))
    .slice(0, 20);
}

export function serializeSpaceAmenities(ids: string[]): string | null {
  const unique = Array.from(
    new Set(ids.map((t) => t.trim()).filter((id): id is SpaceAmenityId => AMENITY_IDS.has(id as SpaceAmenityId)))
  ).slice(0, 20);
  return unique.length ? JSON.stringify(unique) : null;
}

/** Read amenity checkbox values from FormData (`amenities` repeated fields). */
export function amenitiesFromFormData(formData: FormData): string | null {
  const all = formData.getAll('amenities').map(String);
  return serializeSpaceAmenities(all);
}

export function amenityLabel(id: string): string {
  return SPACE_AMENITIES.find((a) => a.id === id)?.label || id;
}

export function normalizeSpaceCategory(raw?: string | null): string {
  const v = (raw || '').trim();
  if ((SPACE_CATEGORIES as readonly string[]).includes(v)) return v;
  return 'Общее';
}
