import crypto from 'crypto';
import bcrypt from 'bcrypt';
import {
  RECOVERY_PHRASE_WORDS,
  RECOVERY_WORD_COUNT,
  RECOVERY_WORDLIST_RU,
} from '@/lib/recovery-wordlist-ru';

export { RECOVERY_PHRASE_WORDS, RECOVERY_WORD_COUNT, RECOVERY_WORDLIST_RU };

const WORD_SET = new Set(RECOVERY_WORDLIST_RU);

/** Normalize user input: lowercase, ё→е, collapse whitespace. */
export function normalizeRecoveryPhrase(input: string | string[]): string {
  const raw = Array.isArray(input) ? input.join(' ') : input;
  return raw
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^а-я\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitRecoveryWords(input: string | string[]): string[] {
  const normalized = normalizeRecoveryPhrase(input);
  if (!normalized) return [];
  return normalized.split(' ');
}

export function validateRecoveryWords(words: string[]): { ok: true } | { ok: false; message: string } {
  if (words.length !== RECOVERY_PHRASE_WORDS) {
    return { ok: false, message: `Нужно ровно ${RECOVERY_PHRASE_WORDS} слов` };
  }
  for (let i = 0; i < words.length; i++) {
    if (!WORD_SET.has(words[i])) {
      return { ok: false, message: `Слово №${i + 1} («${words[i]}») не из списка` };
    }
  }
  return { ok: true };
}

/**
 * BIP39-style: 256-bit entropy + 8-bit checksum → 24 × 11-bit word indices.
 */
export function generateRecoveryPhrase(): string[] {
  if (RECOVERY_WORDLIST_RU.length !== RECOVERY_WORD_COUNT) {
    throw new Error('Recovery wordlist size mismatch');
  }
  const entropy = crypto.randomBytes(32);
  const hash = crypto.createHash('sha256').update(entropy).digest();
  const bits: number[] = [];
  for (const byte of entropy) {
    for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
  }
  for (let i = 7; i >= 0; i--) bits.push((hash[0] >> i) & 1);

  const words: string[] = [];
  for (let w = 0; w < RECOVERY_PHRASE_WORDS; w++) {
    let idx = 0;
    for (let i = 0; i < 11; i++) {
      idx = (idx << 1) | bits[w * 11 + i];
    }
    words.push(RECOVERY_WORDLIST_RU[idx]);
  }
  return words;
}

/** bcrypt of sha256(phrase) — sha256 keeps payload under bcrypt's 72-byte limit. */
export async function hashRecoveryPhrase(words: string[] | string): Promise<string> {
  const normalized = normalizeRecoveryPhrase(words);
  const digest = crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
  return bcrypt.hash(digest, 12);
}

export async function verifyRecoveryPhrase(
  words: string[] | string,
  storedHash: string | null | undefined
): Promise<boolean> {
  if (!storedHash) return false;
  const normalized = normalizeRecoveryPhrase(words);
  const digest = crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
  try {
    return await bcrypt.compare(digest, storedHash);
  } catch {
    return false;
  }
}

/** Suggest wordlist matches for autocomplete (prefix). */
export function suggestRecoveryWords(prefix: string, limit = 8): string[] {
  const p = prefix.toLowerCase().replace(/ё/g, 'е').replace(/[^а-я]/g, '');
  if (p.length < 2) return [];
  const out: string[] = [];
  for (const w of RECOVERY_WORDLIST_RU) {
    if (w.startsWith(p)) {
      out.push(w);
      if (out.length >= limit) break;
    }
  }
  return out;
}
