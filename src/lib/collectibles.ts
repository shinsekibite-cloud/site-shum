/**
 * Коллекционные карточки в духе Steam Inventory:
 * паки за мбаллы → дроп по редкости → витрина на профиле.
 */
export type CardRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type CollectibleCard = {
  id: string;
  title: string;
  series: string;
  rarity: CardRarity;
  /** Короткий слоган */
  tagline: string;
  /** CSS accent */
  accent: string;
  /** Эмодзи / символ на лице карты */
  glyph: string;
};

export type CardPackId = 'starter' | 'sochi' | 'keeper' | 'night' | 'legend';

export type CardPack = {
  id: CardPackId;
  label: string;
  cost: number;
  cards: number;
  blurb: string;
  /** Веса редкостей */
  weights: Record<CardRarity, number>;
};

export type CollectiblesState = {
  /** cardId → count */
  cards: Record<string, number>;
  /** до 5 id на витрине */
  showcase: string[];
  packsOpened: number;
  /** pity: packs since last epic+ */
  pity?: number;
  updatedAt?: string;
};

export const RARITY_META: Record<
  CardRarity,
  { label: string; color: string; glow: string; order: number }
> = {
  common: { label: 'Обычная', color: '#94a3b8', glow: 'rgba(148,163,184,0.35)', order: 1 },
  uncommon: { label: 'Необычная', color: '#34d399', glow: 'rgba(52,211,153,0.4)', order: 2 },
  rare: { label: 'Редкая', color: '#38bdf8', glow: 'rgba(56,189,248,0.45)', order: 3 },
  epic: { label: 'Эпическая', color: '#c084fc', glow: 'rgba(192,132,252,0.5)', order: 4 },
  legendary: { label: 'Легендарная', color: '#fbbf24', glow: 'rgba(251,191,36,0.55)', order: 5 },
};

/** Каталог — молодёжный Сочи, эко, афиша, игры */
export const COLLECTIBLE_CARDS: CollectibleCard[] = [
  { id: 'sea_breeze', title: 'Морской бриз', series: 'Сочи', rarity: 'common', tagline: 'Соль на губах', accent: '#0ea5e9', glyph: '🌊' },
  { id: 'palm_walk', title: 'Пальмовая аллея', series: 'Сочи', rarity: 'common', tagline: 'Тень и лето', accent: '#22c55e', glyph: '🌴' },
  { id: 'pebble_beach', title: 'Галька на пляже', series: 'Сочи', rarity: 'common', tagline: 'Шаг за шагом', accent: '#64748b', glyph: '🪨' },
  { id: 'night_embankment', title: 'Набережная ночью', series: 'Сочи', rarity: 'uncommon', tagline: 'Огни у воды', accent: '#6366f1', glyph: '🌃' },
  { id: 'cable_car', title: 'Канатка', series: 'Сочи', rarity: 'uncommon', tagline: 'Над долиной', accent: '#0ea5e9', glyph: '🚠' },
  { id: 'rosa_peak', title: 'Роза Хутор', series: 'Сочи', rarity: 'rare', tagline: 'Выше облаков', accent: '#38bdf8', glyph: '🏔' },
  { id: 'olympic_park', title: 'Олимпийский парк', series: 'Сочи', rarity: 'rare', tagline: 'Большая сцена', accent: '#f59e0b', glyph: '🏟' },
  { id: 'riviera_park', title: 'Ривьера', series: 'Сочи', rarity: 'rare', tagline: 'Парк и море', accent: '#14b8a6', glyph: '🎡' },
  { id: 'volunteering', title: 'Волонтёр дня', series: 'Сообщество', rarity: 'uncommon', tagline: 'Руки в деле', accent: '#14b8a6', glyph: '🤝' },
  { id: 'club_night', title: 'Вечер в клубе', series: 'Сообщество', rarity: 'common', tagline: 'Свои люди', accent: '#a855f7', glyph: '🎧' },
  { id: 'mentor_note', title: 'Заметка ментора', series: 'Сообщество', rarity: 'uncommon', tagline: 'Подсказка вовремя', accent: '#8b5cf6', glyph: '📝' },
  { id: 'project_spark', title: 'Искра проекта', series: 'Сообщество', rarity: 'rare', tagline: 'Идея → действие', accent: '#f472b6', glyph: '💡' },
  { id: 'team_circle', title: 'Круг команды', series: 'Сообщество', rarity: 'epic', tagline: 'Сильнее вместе', accent: '#c084fc', glyph: '🔵' },
  { id: 'stage_light', title: 'Свет сцены', series: 'Афиша', rarity: 'uncommon', tagline: 'Аншлаг', accent: '#fb7185', glyph: '🎤' },
  { id: 'qr_checkin', title: 'QR на входе', series: 'Афиша', rarity: 'common', tagline: 'Вы на месте', accent: '#94a3b8', glyph: '📱' },
  { id: 'open_mic', title: 'Открытый микрофон', series: 'Афиша', rarity: 'rare', tagline: 'Голос зала', accent: '#f43f5e', glyph: '🎙' },
  { id: 'host_pass', title: 'Хозяин площадки', series: 'Афиша', rarity: 'epic', tagline: 'Ключи от зала', accent: '#c084fc', glyph: '🔑' },
  { id: 'leaf_care', title: 'Зелёный жест', series: 'Эко', rarity: 'common', tagline: 'Забота рядом', accent: '#22c55e', glyph: '🍃' },
  { id: 'clean_shore', title: 'Чистый берег', series: 'Эко', rarity: 'uncommon', tagline: 'Субботник', accent: '#10b981', glyph: '🧹' },
  { id: 'seed_bank', title: 'Банк семян', series: 'Эко', rarity: 'rare', tagline: 'Завтрашний лес', accent: '#84cc16', glyph: '🌱' },
  { id: 'planet_keeper', title: 'Хранитель планеты', series: 'Эко', rarity: 'legendary', tagline: 'Максимум заботы', accent: '#fbbf24', glyph: '🌍' },
  { id: 'snake_run', title: 'Змейка-спринт', series: 'Игры', rarity: 'common', tagline: 'Ещё один рекорд', accent: '#22c55e', glyph: '🐍' },
  { id: 'tetris_flow', title: 'Тетрис-флоу', series: 'Игры', rarity: 'uncommon', tagline: 'Линии сыплются', accent: '#3b82f6', glyph: '🧱' },
  { id: 'fifteen_master', title: 'Мастер пятнашек', series: 'Игры', rarity: 'rare', tagline: 'Порядок из хаоса', accent: '#06b6d4', glyph: '🧩' },
  { id: 'arcade_heart', title: 'Сердце аркады', series: 'Игры', rarity: 'epic', tagline: 'Игровой зал портала', accent: '#ef4444', glyph: '🕹' },
  { id: 'combo_x5', title: 'Комбо ×5', series: 'Игры', rarity: 'epic', tagline: 'Серия без промаха', accent: '#f97316', glyph: '🔥' },
  { id: 'young_crest', title: 'Герб молодёжи', series: 'Легенды', rarity: 'legendary', tagline: 'Символ портала', accent: '#f59e0b', glyph: '🏛' },
  { id: 'sochi_sunrise', title: 'Рассвет Сочи', series: 'Легенды', rarity: 'legendary', tagline: 'Новый день города', accent: '#fb923c', glyph: '🌅' },
  { id: 'harbor_lantern', title: 'Фонарь гавани', series: 'Легенды', rarity: 'legendary', tagline: 'Свет для своих', accent: '#fde68a', glyph: '🏮' },
  { id: 'midnight_wave', title: 'Полночная волна', series: 'Ночь', rarity: 'epic', tagline: 'Чёрное море шумит', accent: '#818cf8', glyph: '🌌' },
  { id: 'neon_boardwalk', title: 'Неоновая доска', series: 'Ночь', rarity: 'rare', tagline: 'Шаги по свету', accent: '#22d3ee', glyph: '✨' },
  { id: 'jazz_terrace', title: 'Джаз на террасе', series: 'Ночь', rarity: 'uncommon', tagline: 'Тёплый вечер', accent: '#f472b6', glyph: '🎷' },
];

export const CARD_BY_ID: Record<string, CollectibleCard> = Object.fromEntries(
  COLLECTIBLE_CARDS.map((c) => [c.id, c])
);

export const CARD_PACKS: Record<CardPackId, CardPack> = {
  starter: {
    id: 'starter',
    label: 'Стартовый пак',
    cost: 35,
    cards: 3,
    blurb: '3 карты · чаще обычные',
    weights: { common: 55, uncommon: 30, rare: 12, epic: 2.5, legendary: 0.5 },
  },
  sochi: {
    id: 'sochi',
    label: 'Пак «Сочи»',
    cost: 75,
    cards: 5,
    blurb: '5 карт · городской вайб',
    weights: { common: 40, uncommon: 32, rare: 20, epic: 6, legendary: 2 },
  },
  keeper: {
    id: 'keeper',
    label: 'Пак «Хранитель»',
    cost: 140,
    cards: 5,
    blurb: '5 карт · выше шанс редких',
    weights: { common: 22, uncommon: 30, rare: 28, epic: 14, legendary: 6 },
  },
  night: {
    id: 'night',
    label: 'Пак «Ночной Сочи»',
    cost: 95,
    cards: 4,
    blurb: '4 карты · неоновый дроп',
    weights: { common: 28, uncommon: 30, rare: 26, epic: 12, legendary: 4 },
  },
  legend: {
    id: 'legend',
    label: 'Пак «Легенда»',
    cost: 220,
    cards: 3,
    blurb: '3 карты · pity и легенды',
    weights: { common: 10, uncommon: 22, rare: 30, epic: 24, legendary: 14 },
  },
};

export function emptyCollectibles(): CollectiblesState {
  return { cards: {}, showcase: [], packsOpened: 0, pity: 0 };
}

export function parseCollectibles(raw: unknown): CollectiblesState {
  if (!raw) return emptyCollectibles();
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data || typeof data !== 'object') return emptyCollectibles();
    const cards: Record<string, number> = {};
    const src = (data as { cards?: unknown }).cards;
    if (src && typeof src === 'object') {
      for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
        if (!CARD_BY_ID[k]) continue;
        const n = Math.floor(Number(v) || 0);
        if (n > 0) cards[k] = Math.min(999, n);
      }
    }
    const showcase = Array.isArray((data as { showcase?: unknown }).showcase)
      ? (data as { showcase: unknown[] }).showcase
          .map((x) => String(x))
          .filter((id) => CARD_BY_ID[id] && cards[id])
          .slice(0, 5)
      : [];
    const packsOpened = Math.max(0, Math.floor(Number((data as { packsOpened?: unknown }).packsOpened) || 0));
    const pity = Math.max(0, Math.floor(Number((data as { pity?: unknown }).pity) || 0));
    return { cards, showcase, packsOpened, pity };
  } catch {
    return emptyCollectibles();
  }
}

export function collectiblesValue(state: CollectiblesState): number {
  let sum = 0;
  for (const [id, count] of Object.entries(state.cards)) {
    const card = CARD_BY_ID[id];
    if (!card) continue;
    const unit =
      card.rarity === 'legendary'
        ? 80
        : card.rarity === 'epic'
          ? 45
          : card.rarity === 'rare'
            ? 25
            : card.rarity === 'uncommon'
              ? 12
              : 6;
    sum += unit * count;
  }
  return sum;
}

export function uniqueCardCount(state: CollectiblesState): number {
  return Object.keys(state.cards).length;
}

function pickRarity(weights: Record<CardRarity, number>): CardRarity {
  const entries = Object.entries(weights) as [CardRarity, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [rar, w] of entries) {
    r -= w;
    if (r <= 0) return rar;
  }
  return 'common';
}

function pickCardOfRarity(rarity: CardRarity, preferSeries?: string[]): CollectibleCard {
  let pool = COLLECTIBLE_CARDS.filter((c) => c.rarity === rarity);
  if (preferSeries?.length) {
    const themed = pool.filter((c) => preferSeries.includes(c.series));
    if (themed.length) pool = themed;
  }
  if (!pool.length) return COLLECTIBLE_CARDS[0];
  // Soft uniqueness bias: prefer cards with rarer glyph entropy via random shuffle pick
  const idx = Math.floor(Math.random() * pool.length);
  const alt = Math.floor(Math.random() * pool.length);
  return Math.random() > 0.35 ? pool[idx] : pool[alt];
}

const PACK_SERIES: Partial<Record<CardPackId, string[]>> = {
  sochi: ['Сочи', 'Афиша'],
  night: ['Ночь', 'Сочи', 'Афиша'],
  keeper: ['Эко', 'Легенды', 'Сообщество'],
  legend: ['Легенды', 'Эко', 'Игры'],
};

export function rollPack(
  packId: CardPackId,
  opts?: { pity?: number }
): CollectibleCard[] {
  const pack = CARD_PACKS[packId];
  if (!pack) return [];
  const pity = Math.max(0, opts?.pity ?? 0);
  const weights = { ...pack.weights };
  // Soft pity: after 8 packs without epic+, boost epic/legendary
  if (pity >= 8) {
    weights.epic *= 1.8;
    weights.legendary *= 2.2;
  }
  if (pity >= 14) {
    weights.epic *= 1.5;
    weights.legendary *= 2;
    weights.common *= 0.5;
  }
  const prefer = PACK_SERIES[packId];
  const out: CollectibleCard[] = [];
  for (let i = 0; i < pack.cards; i++) {
    let rarity = pickRarity(weights);
    // Hard pity: 15th pack guarantees at least one epic on last card
    if (i === pack.cards - 1 && pity >= 15) {
      rarity = Math.random() < 0.35 ? 'legendary' : 'epic';
    }
    out.push(pickCardOfRarity(rarity, prefer));
  }
  // Guaranteed unique-ish: if all commons and pack has 4+ cards, upgrade one
  if (out.length >= 4 && out.every((c) => c.rarity === 'common')) {
    out[out.length - 1] = pickCardOfRarity('uncommon', prefer);
  }
  return out;
}

export function applyDrops(state: CollectiblesState, drops: CollectibleCard[]): CollectiblesState {
  const cards = { ...state.cards };
  for (const d of drops) {
    cards[d.id] = Math.min(999, (cards[d.id] || 0) + 1);
  }
  const gotEpicPlus = drops.some((d) => d.rarity === 'epic' || d.rarity === 'legendary');
  const pity = gotEpicPlus ? 0 : Math.min(99, (state.pity || 0) + 1);
  return {
    ...state,
    cards,
    packsOpened: state.packsOpened + 1,
    pity,
    updatedAt: new Date().toISOString(),
  };
}
