/**
 * Deterministic display aliases from Russian fairy-tale names.
 * Used when a user hides personal data (FRIENDS / PRIVATE visibility).
 */

const FIRST_NAMES = [
  'Иван',
  'Марья',
  'Василиса',
  'Елена',
  'Алёша',
  'Добрыня',
  'Никита',
  'Настасья',
  'Финист',
  'Царевна',
  'Емеля',
  'Алёнушка',
  'Иванушка',
  'Снегурочка',
  'Морозко',
  'Василиса',
  'Катя',
  'Миша',
  'Данила',
  'Кирилл',
  'Олеся',
  'Таня',
  'Глеб',
  'Лада',
] as const;

const LAST_NAMES = [
  'Царевич',
  'Прекрасная',
  'Премудрая',
  'Несмеяна',
  'Попович',
  'Никитич',
  'Муромец',
  'Серый',
  'Белый',
  'Горыныч',
  'Красносолнышко',
  'Златовласка',
  'Сказочный',
  'Лесной',
  'Речной',
  'Ясный',
  'Удалой',
  'Добрый',
  'Храбрый',
  'Чудесный',
  'Заозёрный',
  'Подгорье',
  'Вещий',
  'Златой',
] as const;

/** Soft fairy-tale palettes (from → to) for generated avatars. */
const AVATAR_PALETTES = [
  ['#1d4ed8', '#38bdf8'],
  ['#0f766e', '#5eead4'],
  ['#b45309', '#fbbf24'],
  ['#9f1239', '#fb7185'],
  ['#4338ca', '#a5b4fc'],
  ['#166534', '#86efac'],
  ['#9a3412', '#fdba74'],
  ['#075985', '#7dd3fc'],
  ['#854d0e', '#fde68a'],
  ['#1e3a8a', '#93c5fd'],
] as const;

export function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable fairy-tale «Имя Фамилия» for a user id. */
export function fairyTaleDisplayName(userId: string): string {
  const seed = hashSeed(`fairy:${userId}`);
  const first = FIRST_NAMES[seed % FIRST_NAMES.length];
  const last = LAST_NAMES[Math.floor(seed / FIRST_NAMES.length) % LAST_NAMES.length];
  return `${first} ${last}`;
}

/** Public URL of the deterministic fairy-tale avatar SVG. */
export function fairyTaleAvatarUrl(userId: string): string {
  return `/api/avatar/fairy/${encodeURIComponent(userId)}`;
}

export function fairyTaleAvatarPalette(userId: string): { from: string; to: string } {
  const seed = hashSeed(`fairy-avatar:${userId}`);
  const [from, to] = AVATAR_PALETTES[seed % AVATAR_PALETTES.length];
  return { from, to };
}

/** Initials for fairy avatar (1–2 chars from the alias). */
export function fairyTaleAvatarInitials(userId: string): string {
  const name = fairyTaleDisplayName(userId);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }
  return (parts[0] || '?').slice(0, 1).toUpperCase();
}

/** Inline SVG for fairy-tale avatar (server or client). */
export function fairyTaleAvatarSvg(userId: string, size = 128): string {
  const { from, to } = fairyTaleAvatarPalette(userId);
  const initials = fairyTaleAvatarInitials(userId);
  const seed = hashSeed(`fairy-avatar:${userId}`);
  const sparkleX = 18 + (seed % 40);
  const sparkleY = 16 + (Math.floor(seed / 7) % 36);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128" role="img" aria-label="">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <circle cx="64" cy="64" r="64" fill="url(#g)"/>
  <circle cx="${sparkleX}" cy="${sparkleY}" r="3.2" fill="rgba(255,255,255,0.55)"/>
  <circle cx="${128 - sparkleX}" cy="${128 - sparkleY * 0.7}" r="2.4" fill="rgba(255,255,255,0.4)"/>
  <text x="64" y="72" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="42" font-weight="700" fill="#fff">${initials}</text>
</svg>`;
}

export type PublicIdentity = {
  id: string;
  name: string | null;
  image: string | null;
  aliased: boolean;
};

/**
 * Resolve what a viewer may see of a target user's identity.
 * Guests (no session) never see real name/avatar — only fairy-tale alias.
 * Logged-in: self, friends, PUBLIC profiles, and staff see the real identity.
 */
export function resolvePublicIdentity(opts: {
  target: {
    id: string;
    name: string | null;
    image: string | null;
    profileVisibility?: string | null;
  };
  viewerId?: string | null;
  isFriend?: boolean;
  isStaff?: boolean;
}): PublicIdentity {
  const { target, viewerId, isFriend, isStaff } = opts;
  const visibility = (target.profileVisibility || 'FRIENDS').toUpperCase();
  const isSelf = Boolean(viewerId && viewerId === target.id);
  // Guests must not see personal data — even PUBLIC profiles stay aliased until login.
  const canSeeReal =
    isSelf ||
    Boolean(isStaff) ||
    Boolean(isFriend) ||
    (Boolean(viewerId) && visibility === 'PUBLIC');

  if (canSeeReal) {
    return {
      id: target.id,
      name: target.name,
      image: target.image,
      aliased: false,
    };
  }

  return {
    id: target.id,
    name: fairyTaleDisplayName(target.id),
    image: fairyTaleAvatarUrl(target.id),
    aliased: true,
  };
}

export function isFairyAvatarUrl(url: string | null | undefined): boolean {
  return Boolean(url && url.startsWith('/api/avatar/fairy/'));
}
