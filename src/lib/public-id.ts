/**
 * Short public user IDs shown in profile (e.g. YM-A7K2M9).
 * Distinct from internal cuid — easy to share / type.
 */

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generatePublicCode(): string {
  let body = '';
  for (let i = 0; i < 6; i++) {
    body += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `YM-${body}`;
}

export function normalizePublicCode(raw: string): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/^#/, '');
}

export function looksLikePublicCode(raw: string): boolean {
  const n = normalizePublicCode(raw);
  return /^YM-[2-9A-HJ-NP-Z]{6}$/i.test(n) || /^[2-9A-HJ-NP-Z]{6}$/i.test(n);
}

/** Accept YM-XXXXXX or bare 6-char body. */
export function publicCodeLookupVariants(raw: string): string[] {
  const n = normalizePublicCode(raw);
  if (!n) return [];
  if (n.startsWith('YM-')) return [n];
  if (/^[2-9A-HJ-NP-Z]{6}$/i.test(n)) return [`YM-${n}`, n];
  return [n];
}

const NICK_RE = /^[a-zA-Zа-яА-ЯёЁ0-9_]{2,24}$/;

export function normalizeNickname(raw: string | null | undefined): string | null {
  const t = String(raw || '').trim();
  if (!t) return null;
  return t;
}

export function validateNickname(raw: string | null | undefined): string | null {
  const t = normalizeNickname(raw);
  if (!t) return null;
  if (!NICK_RE.test(t)) {
    throw new Error('Никнейм: 2–24 символа, буквы/цифры/_');
  }
  return t;
}

function cleanOptionalUrl(raw: string | null | undefined, hosts?: RegExp): string | null {
  const t = String(raw || '').trim();
  if (!t) return null;
  let url = t;
  if (!/^https?:\/\//i.test(url)) {
    if (url.startsWith('@')) url = url.slice(1);
    if (hosts?.test(url) || /^[a-z0-9._/-]+$/i.test(url)) {
      // handled by caller for known networks
      return url;
    }
    url = `https://${url}`;
  }
  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    return u.toString().slice(0, 500);
  } catch {
    return null;
  }
}

export function normalizeSteamUrl(raw: string | null | undefined): string | null {
  const t = String(raw || '').trim();
  if (!t) return null;
  if (/^\d{5,20}$/.test(t)) return `https://steamcommunity.com/profiles/${t}`;
  if (/^steamcommunity\.com\//i.test(t)) return cleanOptionalUrl(`https://${t}`);
  const url = cleanOptionalUrl(t);
  if (!url) return null;
  if (!/steamcommunity\.com|steampowered\.com/i.test(url)) {
    throw new Error('Укажите ссылку на профиль Steam');
  }
  return url;
}

export function normalizeVkUrl(raw: string | null | undefined): string | null {
  const t = String(raw || '').trim();
  if (!t) return null;
  if (/^id\d+$/i.test(t) || /^[a-zA-Z0-9._]+$/.test(t)) {
    return `https://vk.ru/${t.replace(/^@/, '')}`;
  }
  const url = cleanOptionalUrl(t);
  if (!url) return null;
  if (!/vk\.(ru|com)|vkontakte\.ru/i.test(url)) {
    throw new Error('Укажите ссылку ВКонтакте');
  }
  return url;
}

export function normalizeTelegramUrl(raw: string | null | undefined): string | null {
  const t = String(raw || '').trim();
  if (!t) return null;
  if (/^@[a-zA-Z0-9_]{4,32}$/.test(t) || /^[a-zA-Z0-9_]{4,32}$/.test(t)) {
    return `https://t.me/${t.replace(/^@/, '')}`;
  }
  const url = cleanOptionalUrl(t);
  if (!url) return null;
  if (!/t\.me|telegram\.me/i.test(url)) {
    throw new Error('Укажите @username или ссылку Telegram');
  }
  return url;
}

export function normalizeMaxUrl(raw: string | null | undefined): string | null {
  const t = String(raw || '').trim();
  if (!t) return null;
  const url = cleanOptionalUrl(t);
  if (!url) return null;
  if (!/max\.ru/i.test(url)) {
    throw new Error('Укажите ссылку на профиль MAX (max.ru/…)');
  }
  return url;
}
