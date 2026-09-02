/** Map weekly afisha / site sections → thematic cover templates / free photos. */

const PHOTO = {
  sea: '/covers/photo/sochi-sea.jpg',
  embankment: '/covers/photo/sochi-embankment.jpg',
  mountains: '/covers/photo/mountains.jpg',
  volunteers: '/covers/photo/volunteers.jpg',
  youth: '/covers/photo/youth-event.jpg',
  sport: '/covers/photo/sport.jpg',
  music: '/covers/photo/music-stage.jpg',
  eco: '/covers/photo/eco-green.jpg',
  cowork: '/covers/photo/cowork.jpg',
  workshop: '/covers/photo/workshop.jpg',
  yoga: '/covers/photo/yoga.jpg',
  night: '/covers/photo/city-night.jpg',
  quiz: '/covers/photo/quiz.jpg',
  film: '/covers/photo/film.jpg',
  hall: '/covers/photo/hall.jpg',
  gym: '/covers/photo/gym.jpg',
} as const;

/** Large variety pool — used with index so list cards do not all share one stock photo. */
const PHOTO_POOL = Object.values(PHOTO);

const AFISHA_BY_ID: Record<string, string> = {
  gym: PHOTO.gym,
  'young-family': PHOTO.youth,
  'clubs-bot': PHOTO.music,
  mma: PHOTO.sport,
  film: PHOTO.film,
  vocal: PHOTO.music,
};

const SECTION: Record<string, string> = {
  projects: PHOTO.workshop,
  clubs: PHOTO.youth,
  spaces: PHOTO.cowork,
  events: PHOTO.hall,
  news: PHOTO.embankment,
  documents: PHOTO.quiz,
  about: PHOTO.sea,
  grants: PHOTO.workshop,
  dobro: PHOTO.volunteers,
  'self-gov': PHOTO.hall,
  contacts: PHOTO.embankment,
  places: PHOTO.cowork,
};

/** Generic SVG / brand placeholders that must not appear as “real” catalog photos. */
const WEAK_COVER =
  /(\/covers\/[^/?#]+\.svg)|(\/uploads\/covers\/[^/?#]+\.svg)|(\/brand\/templates\/)|(\/media\/news\/)|space-house\.svg|news-default|news-seed/i;

export const DEFAULT_SECTION_COVER = PHOTO.sea;

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic photo from pool (stable per entity id/title). */
export function photoBySeed(seed: string, index = 0): string {
  const h = hashSeed(`${seed}::${index}`);
  return PHOTO_POOL[h % PHOTO_POOL.length];
}

/** Normalize entity image URL; empty → thematic fallback. */
export function resolveEntityCover(
  src: string | null | undefined,
  fallback: string = DEFAULT_SECTION_COVER
): string {
  const u = String(src || '').trim();
  if (!u || isWeakCover(u)) return fallback;
  if (u.startsWith('/') || /^https?:\/\//i.test(u)) return u;
  return `/${u.replace(/^\/+/, '')}`;
}

export function isWeakCover(src: string | null | undefined): boolean {
  const u = String(src || '').trim();
  if (!u) return true;
  return WEAK_COVER.test(u);
}

function titlePhoto(title: string): string | null {
  const t = String(title || '').toLowerCase();
  if (/гимнаст/.test(t)) return PHOTO.gym;
  if (/семья|овз/.test(t)) return PHOTO.youth;
  if (/нити|амплитуд|новое время|вокал|гитар|музык|джаз|концерт/.test(t)) return PHOTO.music;
  if (/мма|рукопаш|спорт|воркаут|забег|матч|экстрем/.test(t)) return PHOTO.sport;
  if (/фильм|кино|медиа|фото|видео|блог/.test(t)) return PHOTO.film;
  if (/йог|медитац|растяж/.test(t)) return PHOTO.yoga;
  if (/квиз|викторин|интеллект|дебат/.test(t)) return PHOTO.quiz;
  if (/эко|субботник|уборк|дерев|планет/.test(t)) return PHOTO.eco;
  if (/мастер|workshop|лекц|встреч|форум|кампус|школ|универ/.test(t)) return PHOTO.workshop;
  if (/гор|лыж|роза|снег|лагер/.test(t)) return PHOTO.mountains;
  if (/ночь|неон|набереж/.test(t)) return PHOTO.night;
  if (/волонт|добро|помощ|патрул/.test(t)) return PHOTO.volunteers;
  if (/квн|юмор|стендап/.test(t)) return PHOTO.music;
  if (/коворк|офис/.test(t)) return PHOTO.cowork;
  if (/павильон|дом|зал/.test(t)) return PHOTO.hall;
  if (/порул|авто|водител|труд/.test(t)) return PHOTO.workshop;
  return null;
}

/** Cover for a weekly afisha card (by id / title heuristics). */
export function afishaItemCover(item: { id?: string; title?: string }, index = 0): string {
  const id = String(item.id || '');
  if (AFISHA_BY_ID[id]) return AFISHA_BY_ID[id];
  const byTitle = titlePhoto(item.title || '');
  if (byTitle) return byTitle;
  return photoBySeed(id || item.title || 'afisha', index);
}

/** Cover for an approved booking / event card. */
export function eventCover(
  event: { title?: string | null; space?: { image?: string | null; title?: string | null } | null },
  index = 0
): string {
  const spaceImg = String(event.space?.image || '').trim();
  const byTitle = afishaItemCover({ title: event.title || '' }, index);
  if (spaceImg && !isWeakCover(spaceImg)) {
    return resolveEntityCover(spaceImg, byTitle || sectionCover('events', index));
  }
  if (byTitle) return byTitle;
  if (spaceImg) return resolveEntityCover(spaceImg, sectionCover('events', index));
  return sectionCover('events', index);
}

export function sectionCover(section: string, index = 0): string {
  const base = SECTION[section] || DEFAULT_SECTION_COVER;
  if (index <= 0) return base;
  return photoBySeed(`section:${section}`, index);
}

type CoverEntity = { id?: string | null; title?: string | null; image?: string | null };

function entityCover(
  entity: CoverEntity,
  index: number,
  section: string
): string {
  const img = String(entity.image || '').trim();
  if (img && !isWeakCover(img)) return resolveEntityCover(img, sectionCover(section, index));
  // Prefer stable per-entity seed so list cards never all share one stock photo.
  // Title only nudges the seed (does not collapse many entities onto one JPG).
  const seed = `${section}:${entity.id || entity.title || index}:${titlePhoto(entity.title || '') || ''}`;
  return photoBySeed(seed, index);
}

/** Project cover: real uploads win; weak SVGs → unique thematic photos. */
export function projectCover(project: CoverEntity, index = 0): string {
  return entityCover(project, index, 'projects');
}

export function clubCover(club: CoverEntity, index = 0): string {
  return entityCover(club, index, 'clubs');
}

export function spaceCover(space: CoverEntity, index = 0): string {
  return entityCover(space, index, 'spaces');
}

export function placeCover(place: CoverEntity, index = 0): string {
  return entityCover(place, index, 'places');
}

export function programCover(
  program: CoverEntity & { kind?: string | null },
  index = 0
): string {
  const kind = String(program.kind || '').toUpperCase();
  const section = kind === 'DOBRO' ? 'dobro' : kind === 'SELF_GOV' ? 'self-gov' : 'grants';
  return entityCover(program, index, section);
}

export function newsCover(
  news: { id?: string | null; title?: string | null; imageUrl?: string | null },
  index = 0
): string {
  return entityCover({ id: news.id, title: news.title, image: news.imageUrl }, index, 'news');
}

export { PHOTO as THEME_PHOTOS, PHOTO_POOL };
