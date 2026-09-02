/** Client-safe eco cosmetics metadata (no Prisma). */

export type CosmeticSlot =
  | 'frame'
  | 'badge'
  | 'theme'
  | 'ticket'
  | 'voice'
  | 'aura'
  | 'banner'
  | 'cursor';

export type EcoLoadout = {
  voice?: string | null;
  frame?: string | null;
  badge?: string | null;
  theme?: string | null;
  ticket?: string | null;
  aura?: string | null;
  banner?: string | null;
  cursor?: string | null;
};

export const SLOT_LABELS: Record<CosmeticSlot, string> = {
  voice: 'Голос интерфейса',
  frame: 'Рамка',
  badge: 'Значок',
  theme: 'Тема профиля',
  ticket: 'Билет',
  aura: 'Аура аватара',
  banner: 'Шапка профиля',
  cursor: 'Курсор',
};

export const LOADOUT_SLOTS: CosmeticSlot[] = [
  'voice',
  'frame',
  'badge',
  'theme',
  'ticket',
  'aura',
  'banner',
  'cursor',
];

/** Short glyphs for shop previews + equipped strip */
export const COSMETIC_PREVIEW: Record<
  string,
  { glyph: string; tint: string; label?: string }
> = {
  frame_ocean: { glyph: '🌊', tint: '#0ea5e9', label: 'Океан' },
  frame_forest: { glyph: '🌲', tint: '#16a34a', label: 'Лес' },
  frame_gold: { glyph: '✦', tint: '#eab308', label: 'Золото' },
  frame_neon: { glyph: '◈', tint: '#22d3ee', label: 'Неон' },
  frame_cyber: { glyph: '▣', tint: '#a855f7', label: 'Кибер' },
  frame_pearl: { glyph: '◇', tint: '#e2e8f0', label: 'Жемчуг' },
  badge_leaf: { glyph: '🍃', tint: '#16a34a', label: 'Лист' },
  badge_star: { glyph: '⭐', tint: '#eab308', label: 'Звезда' },
  badge_wave: { glyph: '🌊', tint: '#0ea5e9', label: 'Волна' },
  badge_fire: { glyph: '🔥', tint: '#f97316', label: 'Огонь' },
  badge_compass: { glyph: '🧭', tint: '#0284c7', label: 'Компас' },
  theme_aurora: { glyph: '🌌', tint: '#8b5cf6', label: 'Сияние' },
  theme_forest: { glyph: '🌿', tint: '#16a34a', label: 'Чаща' },
  theme_nightcity: { glyph: '🌃', tint: '#1e293b', label: 'Ночной город' },
  theme_harbor: { glyph: '⚓', tint: '#0d9488', label: 'Гавань' },
  theme_lagoon: { glyph: '🏝', tint: '#2dd4bf', label: 'Лагуна' },
  ticket_glow: { glyph: '▣', tint: '#0d9488', label: 'Свечение' },
  ticket_holo: { glyph: '✦', tint: '#a855f7', label: 'Голограмма' },
  ticket_pulse: { glyph: '◉', tint: '#14b8a6', label: 'Пульс' },
  voice_slavonic: { glyph: '♪', tint: '#78716c', label: 'Славянский' },
  voice_punk: { glyph: '♫', tint: '#e11d48', label: 'Панк' },
  voice_elite: { glyph: '♬', tint: '#a16207', label: 'Элита' },
  voice_sochi: { glyph: '♪', tint: '#0ea5e9', label: 'Сочи' },
  voice_youth: { glyph: '♩', tint: '#db2777', label: 'Молодёжный' },
  aura_spark: { glyph: '✨', tint: '#22c55e', label: 'Искры' },
  aura_wave: { glyph: '〰️', tint: '#06b6d4', label: 'Волна' },
  aura_ember: { glyph: '🔥', tint: '#ea580c', label: 'Угли' },
  banner_sunset: { glyph: '🌅', tint: '#fb923c', label: 'Закат' },
  banner_sochi: { glyph: '🏖', tint: '#0d9488', label: 'Сочи' },
  banner_palms: { glyph: '🌴', tint: '#22c55e', label: 'Пальмы' },
  cursor_leaf: { glyph: '➜', tint: '#16a34a', label: 'Лист' },
  cursor_star: { glyph: '➜', tint: '#eab308', label: 'Звезда' },
};

export function parseEcoLoadout(raw: unknown): EcoLoadout {
  if (!raw) return {};
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data || typeof data !== 'object') return {};
    const out: EcoLoadout = {};
    for (const slot of LOADOUT_SLOTS) {
      const v = (data as Record<string, unknown>)[slot];
      if (typeof v === 'string' && v.trim()) out[slot] = v.trim().slice(0, 64);
    }
    return out;
  } catch {
    return {};
  }
}

export type EcoDomAttrs = {
  'data-voice'?: string;
  'data-eco-cursor'?: string;
  'data-eco-aura'?: string;
  'data-eco-banner'?: string;
  'data-eco-frame'?: string;
  'data-eco-badge'?: string;
  'data-eco-theme'?: string;
  'data-eco-ticket'?: string;
};

/** Map loadout → DOM data-* used by CSS (owner html or public .yp-eco-surface). */
export function ecoLoadoutToDomAttrs(loadout: EcoLoadout): EcoDomAttrs {
  const attrs: EcoDomAttrs = {};

  if (loadout.voice) attrs['data-voice'] = loadout.voice;

  if (loadout.cursor === 'cursor_leaf') attrs['data-eco-cursor'] = 'leaf';
  else if (loadout.cursor === 'cursor_star') attrs['data-eco-cursor'] = 'star';

  if (loadout.aura === 'aura_spark') attrs['data-eco-aura'] = 'spark';
  else if (loadout.aura === 'aura_wave') attrs['data-eco-aura'] = 'wave';
  else if (loadout.aura === 'aura_ember') attrs['data-eco-aura'] = 'ember';

  if (loadout.banner === 'banner_sunset') attrs['data-eco-banner'] = 'sunset';
  else if (loadout.banner === 'banner_sochi') attrs['data-eco-banner'] = 'sochi';
  else if (loadout.banner === 'banner_palms') attrs['data-eco-banner'] = 'palms';

  if (loadout.frame) attrs['data-eco-frame'] = loadout.frame;
  if (loadout.badge) attrs['data-eco-badge'] = loadout.badge;
  if (loadout.theme) attrs['data-eco-theme'] = loadout.theme;
  if (loadout.ticket) attrs['data-eco-ticket'] = loadout.ticket;

  return attrs;
}

const ECO_ATTR_KEYS = [
  'data-voice',
  'data-eco-cursor',
  'data-eco-aura',
  'data-eco-banner',
  'data-eco-frame',
  'data-eco-badge',
  'data-eco-theme',
  'data-eco-ticket',
] as const;

export function applyEcoDomEffects(target: HTMLElement, loadout: EcoLoadout) {
  const next = ecoLoadoutToDomAttrs(loadout);
  let changed = false;
  for (const key of ECO_ATTR_KEYS) {
    const val = next[key];
    const prev = target.getAttribute(key);
    if (val) {
      if (prev !== val) {
        target.setAttribute(key, val);
        changed = true;
      }
    } else if (prev != null) {
      target.removeAttribute(key);
      changed = true;
    }
  }
  return changed;
}

/** Map shop frame id → avatar ring colors (public profile / UserAvatar). */
export function shopFrameStyle(frameId: string | null | undefined): {
  border: string;
  glow: string;
} | null {
  if (!frameId) return null;
  const map: Record<string, { border: string; glow: string }> = {
    frame_ocean: { border: '#0ea5e9', glow: 'rgba(14,165,233,0.45)' },
    frame_forest: { border: '#16a34a', glow: 'rgba(22,163,74,0.4)' },
    frame_gold: { border: '#eab308', glow: 'rgba(234,179,8,0.5)' },
    frame_neon: { border: '#22d3ee', glow: 'rgba(34,211,238,0.55)' },
    frame_cyber: { border: '#a855f7', glow: 'rgba(168,85,247,0.5)' },
    frame_pearl: { border: '#e2e8f0', glow: 'rgba(226,232,240,0.7)' },
  };
  return map[frameId] || null;
}

/** Equipped items for the hero “надето” strip */
export function equippedLoadoutItems(loadout: EcoLoadout) {
  const items: { slot: CosmeticSlot; id: string; glyph: string; tint: string; label: string }[] =
    [];
  for (const slot of LOADOUT_SLOTS) {
    const id = loadout[slot];
    if (!id) continue;
    const preview = COSMETIC_PREVIEW[id] || { glyph: '◈', tint: '#0d9488' };
    items.push({
      slot,
      id,
      glyph: preview.glyph,
      tint: preview.tint,
      label: preview.label ? `${SLOT_LABELS[slot]}: ${preview.label}` : SLOT_LABELS[slot],
    });
  }
  return items;
}
