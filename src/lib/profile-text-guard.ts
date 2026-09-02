/**
 * Stricter profile text rules: block profanity (via censor), gibberish names,
 * and spammy tag lists. Used by register + profile update.
 */
import { containsUnsafeContent, profanityResponse } from '@/lib/censor';

const LETTER_RE = /[a-zA-Zа-яА-ЯёЁ]/;
const ONLY_LETTERS_SPACES_RE = /^[\p{L}\p{M}\s'.\-]+$/u;

/** Common keyboard-smash / filler patterns (latin + cyrillic). */
const GIBBERISH_RE =
  /^(?:([a-zа-яё])\1{2,}|(?:asdf|qwer|zxcv|йцук|фыва|ячсм|test|asdfg|qwerty|ytty|tyty|аааа|бббб)(?:[a-zа-яё]{0,6})?)$/i;

export type NameGuardResult =
  | { ok: true; name: string }
  | { ok: false; message: string };

function collapseSpaces(s: string) {
  return s.replace(/\s+/g, ' ').trim();
}

function letterRatio(s: string) {
  const chars = [...s.replace(/\s/g, '')];
  if (!chars.length) return 0;
  const letters = chars.filter((c) => LETTER_RE.test(c)).length;
  return letters / chars.length;
}

function maxRunRatio(s: string) {
  const compact = s.replace(/\s/g, '').toLowerCase();
  if (compact.length < 3) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < compact.length; i++) {
    if (compact[i] === compact[i - 1]) {
      run += 1;
      best = Math.max(best, run);
    } else run = 1;
  }
  return best / compact.length;
}

function looksLikeGibberishWord(word: string) {
  const w = word.toLowerCase();
  if (w.length < 3) return false;
  if (GIBBERISH_RE.test(w)) return true;
  // Alternating 2-char spam: ytyt, abab, toto
  if (w.length >= 4 && w.length <= 12) {
    const a = w.slice(0, 2);
    if (a[0] !== a[1] && w === a.repeat(Math.floor(w.length / 2)).slice(0, w.length)) {
      return true;
    }
  }
  // Too few unique letters for length
  const unique = new Set([...w]).size;
  if (w.length >= 6 && unique <= 2) return true;
  if (w.length >= 8 && unique <= 3) return true;
  return false;
}

/** Validate public display name (registration + profile). */
export function validateDisplayName(raw: string | null | undefined): NameGuardResult {
  const name = collapseSpaces(String(raw || ''));
  if (name.length < 2) {
    return { ok: false, message: 'Имя слишком короткое' };
  }
  if (name.length > 60) {
    return { ok: false, message: 'Имя слишком длинное (макс. 60 символов)' };
  }
  if (!ONLY_LETTERS_SPACES_RE.test(name)) {
    return {
      ok: false,
      message: 'В имени допустимы только буквы, пробел, дефис и апостроф',
    };
  }
  if (letterRatio(name) < 0.85) {
    return { ok: false, message: 'Укажите настоящее имя буквами' };
  }
  if (maxRunRatio(name) > 0.45) {
    return { ok: false, message: 'Имя выглядит как набор одинаковых букв' };
  }
  const words = name.split(' ').filter(Boolean);
  if (words.length > 5) {
    return { ok: false, message: 'Слишком много слов в имени (макс. 5)' };
  }
  if (words.some((w) => w.length > 24)) {
    return { ok: false, message: 'Слишком длинное слово в имени' };
  }
  if (words.some(looksLikeGibberishWord)) {
    return {
      ok: false,
      message: 'Имя похоже на случайный набор символов. Укажите реальное имя или ник',
    };
  }
  if (containsUnsafeContent(name)) {
    return {
      ok: false,
      message: 'Имя содержит недопустимые выражения',
    };
  }
  return { ok: true, name };
}

export function validateBioText(raw: string | null | undefined, max = 280): NameGuardResult {
  const text = String(raw || '').trim();
  if (!text) return { ok: true, name: '' };
  if (text.length > max) {
    return { ok: false, message: `Текст слишком длинный (макс. ${max})` };
  }
  if (containsUnsafeContent(text)) {
    return {
      ok: false,
      message: 'Текст содержит недопустимые выражения',
    };
  }
  return { ok: true, name: text };
}

/** Join tag arrays for censor scan. */
export function tagsProfanityResponse(tags: string[] | undefined | null) {
  if (!tags?.length) return null;
  return profanityResponse(tags.join(' · '));
}

export function nameGuardJson(result: Exclude<NameGuardResult, { ok: true }>) {
  return Response.json({ message: result.message }, { status: 400 });
}
