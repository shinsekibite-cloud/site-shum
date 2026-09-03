/** «Куда сходить в Сочи» — categories, labels, parse helpers. */

import { transliterateSlug } from '@/lib/slug-latin';
import { galleryUrls, parseGalleryItems } from '@/lib/gallery-shared';

export const PLACE_CATEGORIES = [
  'HISTORICAL',
  'BEACH',
  'MOUNTAIN',
  'PARK',
  'MUSEUM',
  'VIEWPOINT',
  'UNIQUE',
  'FAMILY',
] as const;

export type PlaceCategoryCode = (typeof PLACE_CATEGORIES)[number];

export const PLACE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type PlaceStatusCode = (typeof PLACE_STATUSES)[number];

export const PLACE_CATEGORY_META: Record<
  PlaceCategoryCode,
  { label: string; color: string; bg: string }
> = {
  HISTORICAL: { label: 'История', color: '#78716c', bg: 'rgba(120,113,108,0.14)' },
  BEACH: { label: 'Пляж', color: '#0d9488', bg: 'rgba(13,148,136,0.14)' },
  MOUNTAIN: { label: 'Горы', color: '#475569', bg: 'rgba(71,85,105,0.14)' },
  PARK: { label: 'Парк', color: '#15803d', bg: 'rgba(21,128,61,0.12)' },
  MUSEUM: { label: 'Музей', color: '#b45309', bg: 'rgba(180,83,9,0.12)' },
  VIEWPOINT: { label: 'Смотровая', color: '#0369a1', bg: 'rgba(3,105,161,0.12)' },
  UNIQUE: { label: 'Уникальное', color: '#c2410c', bg: 'rgba(194,65,12,0.12)' },
  FAMILY: { label: 'Семья', color: '#d97706', bg: 'rgba(217,119,6,0.14)' },
};

export const PLACE_STATUS_LABELS: Record<PlaceStatusCode, string> = {
  DRAFT: 'Черновик',
  PUBLISHED: 'Опубликовано',
  ARCHIVED: 'Архив',
};

export type PlaceFeature = {
  icon: string;
  title: string;
  text: string;
};

export function slugifyPlace(title: string, maxLen = 56): string {
  return transliterateSlug(title, maxLen) || 'place';
}

export function normalizePlaceCategory(raw?: string | null): PlaceCategoryCode {
  const v = String(raw || '')
    .trim()
    .toUpperCase();
  if ((PLACE_CATEGORIES as readonly string[]).includes(v)) return v as PlaceCategoryCode;
  return 'UNIQUE';
}

export function normalizePlaceStatus(raw?: string | null): PlaceStatusCode {
  const v = String(raw || '')
    .trim()
    .toUpperCase();
  if ((PLACE_STATUSES as readonly string[]).includes(v)) return v as PlaceStatusCode;
  return 'DRAFT';
}

export function placeCategoryLabel(code?: string | null): string {
  const c = normalizePlaceCategory(code);
  return PLACE_CATEGORY_META[c].label;
}

export function parseGalleryJson(raw?: string | null): string[] {
  return galleryUrls(parseGalleryItems(raw, 24));
}

export function serializeGallery(urls: string[]): string | null {
  const items = urls.map((u) => u.trim()).filter(Boolean).slice(0, 24);
  return items.length ? JSON.stringify(items) : null;
}

export function parseFeaturesJson(raw?: string | null): PlaceFeature[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const icon = String((item as PlaceFeature).icon || 'star').trim().slice(0, 32) || 'star';
        const title = String((item as PlaceFeature).title || '').trim().slice(0, 80);
        const text = String((item as PlaceFeature).text || '').trim().slice(0, 280);
        if (!title) return null;
        return { icon, title, text };
      })
      .filter((x): x is PlaceFeature => Boolean(x))
      .slice(0, 12);
  } catch {
    return [];
  }
}

export function serializeFeatures(features: PlaceFeature[]): string | null {
  const cleaned = features
    .map((f) => ({
      icon: String(f.icon || 'star').trim().slice(0, 32) || 'star',
      title: String(f.title || '').trim().slice(0, 80),
      text: String(f.text || '').trim().slice(0, 280),
    }))
    .filter((f) => f.title)
    .slice(0, 12);
  return cleaned.length ? JSON.stringify(cleaned) : null;
}

/** Stars display helper: round to 1 decimal. */
export function formatPlaceRating(avg?: number | null, count?: number | null): string {
  const n = Number(avg) || 0;
  const c = Number(count) || 0;
  if (c <= 0) return 'Нет оценок';
  return `${n.toFixed(1)} · ${c}`;
}

/** Soft keyword map so a place can match several categories beyond the primary DB field. */
const PLACE_SOFT_MATCH: Record<PlaceCategoryCode, RegExp> = {
  HISTORICAL: /истор|музей|крепост|памятник|архитект/i,
  BEACH: /пляж|море|набереж|купан/i,
  MOUNTAIN: /гор[аыеу]|хребет|подъём|подъем|канатн/i,
  PARK: /парк|сквер|аллея|дендрар/i,
  MUSEUM: /музей|галере|экспозиц/i,
  VIEWPOINT: /смотров|панорам|обзорн|вид на/i,
  UNIQUE: /уникал|необычн|секрет/i,
  FAMILY: /семь|детск|для детей|пикник/i,
};

type PlaceCatSource = {
  category?: string | null;
  title?: string | null;
  summary?: string | null;
  description?: string | null;
  tips?: string | null;
  /** Optional JSON string[] of PlaceCategoryCode stored by admin */
  extraCategoriesJson?: string | null;
};

function parseExtraCategoryCodes(raw?: string | null): PlaceCategoryCode[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => normalizePlaceCategory(String(x)))
      .filter((c, i, arr) => arr.indexOf(c) === i)
      .slice(0, 6);
  } catch {
    return [];
  }
}

/** Primary + soft/extra categories (deduped, primary first). */
export function placeCategoryCodesFor(place: PlaceCatSource): PlaceCategoryCode[] {
  const primary = normalizePlaceCategory(place.category);
  const out: PlaceCategoryCode[] = [primary];
  for (const c of parseExtraCategoryCodes(place.extraCategoriesJson)) {
    if (!out.includes(c)) out.push(c);
  }
  const hay = [place.title, place.summary, place.description, place.tips].filter(Boolean).join(' \n ');
  for (const code of PLACE_CATEGORIES) {
    if (out.includes(code)) continue;
    if (PLACE_SOFT_MATCH[code].test(hay)) out.push(code);
  }
  return out.slice(0, 5);
}

/** Features from CMS, or sensible fallbacks from place facts so the section is never blank. */
export function resolvePlaceFeatures(place: {
  featuresJson?: string | null;
  bestSeason?: string | null;
  visitTime?: string | null;
  priceHint?: string | null;
  tips?: string | null;
  district?: string | null;
}): PlaceFeature[] {
  const fromJson = parseFeaturesJson(place.featuresJson);
  if (fromJson.length) return fromJson;

  const fallback: PlaceFeature[] = [];
  if (place.bestSeason?.trim()) {
    fallback.push({ icon: 'sun', title: 'Лучший сезон', text: place.bestSeason.trim() });
  }
  if (place.visitTime?.trim()) {
    fallback.push({ icon: 'clock', title: 'Сколько гулять', text: place.visitTime.trim() });
  }
  if (place.priceHint?.trim()) {
    fallback.push({ icon: 'wallet', title: 'Стоимость', text: place.priceHint.trim() });
  }
  if (place.district?.trim()) {
    fallback.push({ icon: 'map', title: 'Район', text: place.district.trim() });
  }
  if (place.tips?.trim()) {
    fallback.push({
      icon: 'tip',
      title: 'Совет',
      text: place.tips.trim().slice(0, 280),
    });
  }
  if (!fallback.length) {
    fallback.push({
      icon: 'star',
      title: 'Стоит заглянуть',
      text: 'Откройте карту маршрута ниже и добавьте место в избранное.',
    });
  }
  return fallback.slice(0, 6);
}
