/**
 * Minimal TOTP (RFC 6238) — HMAC-SHA1, 30s step, 6 digits.
 * No otplib dependency; secret stored as base32.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(bytes = 20): string {
  const buf = randomBytes(bytes);
  return base32Encode(buf);
}

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(input: string): Buffer {
  const cleaned = input.replace(/=+$/, '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

export function generateTotp(secretBase32: string, atMs = Date.now(), stepSec = 30): string {
  const secret = base32Decode(secretBase32);
  const counter = Math.floor(atMs / 1000 / stepSec);
  return hotp(secret, counter);
}

export function verifyTotp(
  secretBase32: string,
  token: string,
  opts?: { window?: number; stepSec?: number; atMs?: number }
): boolean {
  const cleaned = String(token || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;
  const window = opts?.window ?? 1;
  const stepSec = opts?.stepSec ?? 30;
  const atMs = opts?.atMs ?? Date.now();
  const secret = base32Decode(secretBase32);
  const counter = Math.floor(atMs / 1000 / stepSec);
  const expected = Buffer.from(cleaned);
  for (let w = -window; w <= window; w++) {
    const code = Buffer.from(hotp(secret, counter + w));
    if (code.length === expected.length && timingSafeEqual(code, expected)) return true;
  }
  return false;
}

export function buildOtpAuthUrl(opts: {
  secret: string;
  accountName: string;
  issuer?: string;
}): string {
  const issuer = opts.issuer || 'Молодёжь Сочи';
  const label = encodeURIComponent(`${issuer}:${opts.accountName}`);
  const params = new URLSearchParams({
    secret: opts.secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
