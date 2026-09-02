/**
 * Уровень профиля — игровая прогрессия «Волна Сочи».
 * Вклад = эко на руках + стоимость косметики + ценность коллекции.
 * Каждый уровень: ранг, смысл, награда и перк для сообщества.
 */

export type LevelBandId = 'shore' | 'bay' | 'horizon' | 'summit' | 'prestige';

export type LevelReward = {
  /** One-time eco grant when this level is first reached */
  eco: number;
  /** Short perk shown in UI */
  perk: string;
};

export type ProfileLevel = {
  level: number;
  id: string;
  title: string;
  /** One-line meaning for the player */
  blurb: string;
  color: string;
  min: number;
  band: LevelBandId;
  reward: LevelReward;
  next?: number;
};

export const LEVEL_BANDS: Record<
  LevelBandId,
  { id: LevelBandId; title: string; tagline: string; color: string }
> = {
  shore: {
    id: 'shore',
    title: 'Берег',
    tagline: 'Первые шаги на портале',
    color: '#64748b',
  },
  bay: {
    id: 'bay',
    title: 'Бухта',
    tagline: 'Вы уже в деле — события и люди',
    color: '#0d9488',
  },
  horizon: {
    id: 'horizon',
    title: 'Горизонт',
    tagline: 'Ориентир для других',
    color: '#0284c7',
  },
  summit: {
    id: 'summit',
    title: 'Вершина',
    tagline: 'Лицо молодёжного Сочи',
    color: '#ea580c',
  },
  prestige: {
    id: 'prestige',
    title: 'Престиж',
    tagline: 'Сезоны после легенды — вклад без потолка',
    color: '#b45309',
  },
};

/** Contribution span per prestige star after level 10 (min 1500). */
export const PRESTIGE_STEP = 400;
export const PRESTIGE_BASE = 1500;

export const PRESTIGE_SEASONS = [
  { star: 1, title: 'Сезон Прибоя', perk: '+15 мбаллов за звезду' },
  { star: 2, title: 'Сезон Маяка', perk: '+20 мбаллов за звезду' },
  { star: 3, title: 'Сезон Олимпии', perk: '+25 мбаллов за звезду' },
  { star: 4, title: 'Сезон Хребта', perk: '+30 мбаллов за звезду' },
  { star: 5, title: 'Сезон Солнца', perk: '+40 мбаллов за звезду' },
] as const;

export function prestigeProgress(contribution: number) {
  const c = Math.max(0, contribution);
  if (c < PRESTIGE_BASE) {
    return null;
  }
  const over = c - PRESTIGE_BASE;
  const star = Math.floor(over / PRESTIGE_STEP) + 1;
  const into = over % PRESTIGE_STEP;
  const pct = Math.min(100, Math.round((into / PRESTIGE_STEP) * 100));
  const toNext = PRESTIGE_STEP - into;
  const season =
    PRESTIGE_SEASONS[Math.min(PRESTIGE_SEASONS.length - 1, star - 1)] || PRESTIGE_SEASONS[0];
  return {
    star,
    seasonTitle: season.title,
    perk: season.perk,
    pct: into === 0 && star > 1 ? 100 : pct,
    toNext: into === 0 && over > 0 ? PRESTIGE_STEP : toNext,
    ecoReward: 10 + star * 5,
  };
}


/**
 * Curve tuned for real activity: early wins feel fast, late ranks feel earned.
 * Rewards escalate; perks explain *why* the level matters on the portal.
 */
const LEVELS: Omit<ProfileLevel, 'next'>[] = [
  {
    level: 1,
    id: 'newcomer',
    title: 'Новичок',
    blurb: 'Вы на берегу — оформите профиль и сделайте первый шаг',
    color: '#94a3b8',
    min: 0,
    band: 'shore',
    reward: { eco: 0, perk: 'Доступ к кабинету и афише' },
  },
  {
    level: 2,
    id: 'sprout',
    title: 'Росток',
    blurb: 'Первые мбаллы и знакомство с городом',
    color: '#14b8a6',
    min: 25,
    band: 'shore',
    reward: { eco: 8, perk: '+мбаллы за старт прогрессии' },
  },
  {
    level: 3,
    id: 'member',
    title: 'Участник',
    blurb: 'Вы в афише и сообществах — портал узнаёт вас',
    color: '#0ea5e9',
    min: 60,
    band: 'shore',
    reward: { eco: 12, perk: 'Значок «Участник» в достижениях' },
  },
  {
    level: 4,
    id: 'volunteer',
    title: 'Волонтёр',
    blurb: 'Помогаете событиям жить — приходите и отмечайтесь',
    color: '#0d9488',
    min: 120,
    band: 'bay',
    reward: { eco: 18, perk: 'Бонус к эко за активность' },
  },
  {
    level: 5,
    id: 'activist',
    title: 'Активист',
    blurb: 'Регулярно в деле: заявки, друзья, галерея',
    color: '#0284c7',
    min: 200,
    band: 'bay',
    reward: { eco: 25, perk: 'Серебряный титул «Активист»' },
  },
  {
    level: 6,
    id: 'navigator',
    title: 'Навигатор',
    blurb: 'Друзья ориентируются на вас — зовите и делитесь',
    color: '#0369a1',
    min: 320,
    band: 'bay',
    reward: { eco: 30, perk: 'Усиленный вес в сообществе' },
  },
  {
    level: 7,
    id: 'ambassador',
    title: 'Амбассадор',
    blurb: 'Лицо молодёжного Сочи — витрина и стиль',
    color: '#0891b2',
    min: 480,
    band: 'horizon',
    reward: { eco: 40, perk: 'Премиум-эко пакет за ранг' },
  },
  {
    level: 8,
    id: 'keeper',
    title: 'Хранитель',
    blurb: 'Забота о портале и городе — редкий статус',
    color: '#059669',
    min: 700,
    band: 'horizon',
    reward: { eco: 55, perk: 'Золотой титул «Хранитель»' },
  },
  {
    level: 9,
    id: 'captain',
    title: 'Капитан',
    blurb: 'Ведёте за собой — лидер волны',
    color: '#d97706',
    min: 1000,
    band: 'summit',
    reward: { eco: 70, perk: 'Капитанский бонус эко' },
  },
  {
    level: 10,
    id: 'legend',
    title: 'Легенда портала',
    blurb: 'Максимум вклада — легенда Центра',
    color: '#ea580c',
    min: 1500,
    band: 'summit',
    reward: { eco: 100, perk: 'Корона легенды + максимальный ранг' },
  },
];

export function profileContribution(opts: {
  ecoPoints: number;
  cosmeticsValue?: number;
  collectiblesValue?: number;
}): number {
  return Math.max(
    0,
    (opts.ecoPoints || 0) + (opts.cosmeticsValue || 0) + (opts.collectiblesValue || 0)
  );
}

export function profileLevel(contribution: number): ProfileLevel {
  const c = Math.max(0, contribution);
  let current = LEVELS[0];
  for (const lvl of LEVELS) {
    if (c >= lvl.min) current = lvl;
  }
  const idx = LEVELS.findIndex((l) => l.id === current.id);
  const nextMin = LEVELS[idx + 1]?.min;
  return { ...current, next: nextMin };
}

export function profileLevelProgress(contribution: number) {
  const level = profileLevel(contribution);
  const nextAt = level.next ?? level.min;
  const prevAt = level.min;
  const span = Math.max(1, nextAt - prevAt);
  const pct = level.next
    ? Math.min(100, Math.round(((contribution - prevAt) / span) * 100))
    : 100;
  const toNext = level.next != null ? Math.max(0, level.next - contribution) : 0;
  const band = LEVEL_BANDS[level.band];
  const nextLevel = level.next != null ? LEVELS.find((l) => l.min === level.next) : null;
  return {
    level,
    pct,
    nextAt: level.next,
    contribution,
    toNext,
    band,
    nextReward: nextLevel
      ? {
          level: nextLevel.level,
          title: nextLevel.title,
          eco: nextLevel.reward.eco,
          perk: nextLevel.reward.perk,
        }
      : null,
    prestige: prestigeProgress(contribution),
    roadmap: LEVELS.map((l) => ({
      level: l.level,
      title: l.title,
      min: l.min,
      color: l.color,
      band: l.band,
      reward: l.reward,
      reached: contribution >= l.min,
      current: l.level === level.level,
    })),
  };
}

/** Обратная совместимость со старыми «эко-тирами». */
export function ecoTier(points: number) {
  const lvl = profileLevel(points);
  return {
    id: lvl.id,
    label: lvl.title,
    color: lvl.color,
    min: lvl.min,
    next: lvl.next,
  };
}

export function ecoTierProgress(points: number) {
  const { level: lvl, pct, nextAt } = profileLevelProgress(points);
  return {
    tier: {
      id: lvl.id,
      label: lvl.title,
      color: lvl.color,
      min: lvl.min,
      next: lvl.next,
    },
    pct,
    nextAt,
  };
}

export function levelByNumber(n: number): ProfileLevel | undefined {
  const row = LEVELS.find((l) => l.level === n);
  if (!row) return undefined;
  const idx = LEVELS.findIndex((l) => l.id === row.id);
  return { ...row, next: LEVELS[idx + 1]?.min };
}

export const ECO_EARN_HINTS = [
  { action: 'Отметка на входе (QR)', points: 15 },
  { action: 'Запись на мероприятие', points: 5 },
  { action: 'Принятие заявки / клуб', points: 8 },
  { action: 'Новый друг', points: 4 },
  { action: 'Фото в галерею', points: 2 },
  { action: 'Инструктаж пройден', points: 20 },
  { action: 'Отклик на вакансию (скрининг)', points: 10 },
  { action: 'Одобрение вакансии', points: 25 },
  { action: 'Работа на конкурс', points: 8 },
  { action: 'Одобрение работы / победа', points: 12 },
  { action: 'Победа в розыгрыше', points: 40 },
  { action: 'Игра (раз в сутки МСК)', points: 3 },
  { action: 'Победа в «Пятнашках»', points: 5 },
  { action: 'Уникальный просмотр карточки (до 5/день)', points: 1 },
  { action: 'Реферал: регистрация друга', points: 8 },
  { action: 'Реферал: друг на мероприятии (QR)', points: 25 },
] as const;

export const PROFILE_LEVELS = LEVELS;

/** How authority/social meters map to player-facing labels & tips */
export const RATING_METER_COPY = {
  AUTHORITY: {
    label: 'Надёжность',
    short: 'Доверие',
    tip: 'Приходите на события — рейтинг открывает заявки и брони',
    color: '#0284c7',
  },
  SOCIAL: {
    label: 'Сообщество',
    short: 'Связи',
    tip: 'Друзья, галерея и чат — расширяют лимиты общения',
    color: '#0d9488',
  },
  ECO: {
    label: 'М-кошелёк',
    short: 'мб',
    tip: 'Тратьте мбаллы на стиль и карты — вклад в уровень остаётся',
    color: '#0f766e',
  },
  LEVEL: {
    label: 'Уровень',
    short: 'Ранг',
    tip: 'Общий вклад на портале: мбаллы + стиль + коллекция',
    color: '#ea580c',
  },
} as const;
