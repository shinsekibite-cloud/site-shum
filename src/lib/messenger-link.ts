/**
 * Signed one-time deep-link tokens for binding Telegram / MAX.
 *
 * Site → bot:  link_<b64(userId.channel.exp.jti.sig)>
 * Bot → site:  claim_<b64(max.exp.jti.sig)>  (MAX id stored server-side by jti)
 *
 * Protection:
 * - HMAC-SHA256 (NEXTAUTH_SECRET)
 * - short TTL
 * - random jti registered in Redis (or memory) and burned on successful use
 * - claim bind requires authenticated POST confirmation (no silent GET bind)
 */
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { getSharedRedis } from '@/lib/rateLimit';

export type MessengerChannel = 'tg' | 'max';

const LINK_TTL_SEC = 60 * 20; // 20 minutes
const CLAIM_TTL_SEC = 60 * 15; // 15 minutes
const SIG_LEN = 32;

const MEM = new Map<string, { value: string; exp: number }>();

function secret() {
  const s =
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    '';
  if (s) return s;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEXTAUTH_SECRET is required for messenger link tokens');
  }
  return 'dev-messenger-link';
}

function b64url(buf: Buffer | string) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf, 'utf8');
  return b.toString('base64url');
}

function fromB64url(s: string) {
  return Buffer.from(s, 'base64url').toString('utf8');
}

function sign(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url').slice(0, SIG_LEN);
}

function safeEqual(a: string, b: string) {
  try {
    const aa = Buffer.from(a);
    const bb = Buffer.from(b);
    if (aa.length !== bb.length) return false;
    return timingSafeEqual(aa, bb);
  } catch {
    return false;
  }
}

function newJti() {
  return randomBytes(16).toString('base64url');
}

function cleanupMem() {
  const now = Date.now();
  for (const [k, v] of MEM) {
    if (v.exp < now) MEM.delete(k);
  }
}

async function storeToken(key: string, value: string, ttlSec: number) {
  cleanupMem();
  const redis = getSharedRedis();
  if (redis) {
    await redis.set(key, value, 'EX', ttlSec);
    return;
  }
  MEM.set(key, { value, exp: Date.now() + ttlSec * 1000 });
}

async function peekToken(key: string): Promise<string | null> {
  cleanupMem();
  const redis = getSharedRedis();
  if (redis) {
    const v = await redis.get(key);
    return v == null ? null : String(v);
  }
  const row = MEM.get(key);
  if (!row) return null;
  if (row.exp < Date.now()) {
    MEM.delete(key);
    return null;
  }
  return row.value;
}

/** Atomic-ish consume: read then delete; concurrent second call fails. */
async function consumeToken(key: string): Promise<string | null> {
  cleanupMem();
  const redis = getSharedRedis();
  if (redis) {
    // Prefer GETDEL when available (Redis 6.2+)
    const client = redis as unknown as {
      getdel?: (k: string) => Promise<string | null>;
      get: (k: string) => Promise<string | null>;
      del: (k: string) => Promise<number>;
    };
    if (typeof client.getdel === 'function') {
      const v = await client.getdel(key);
      return v == null ? null : String(v);
    }
    const v = await client.get(key);
    if (v == null) return null;
    const n = await client.del(key);
    if (!n) return null;
    return String(v);
  }
  const row = MEM.get(key);
  if (!row) return null;
  if (row.exp < Date.now()) {
    MEM.delete(key);
    return null;
  }
  MEM.delete(key);
  return row.value;
}

function linkStoreKey(jti: string) {
  return `yp:msg-link:${jti}`;
}

function claimStoreKey(jti: string) {
  return `yp:max-claim:${jti}`;
}

/** Site → bot one-tap bind token (issued for logged-in user). */
export async function issueMessengerLinkToken(
  userId: string,
  channel: MessengerChannel
): Promise<string> {
  if (!userId || userId.length < 8) throw new Error('userId required');
  if (channel !== 'tg' && channel !== 'max') throw new Error('channel');
  const exp = Math.floor(Date.now() / 1000) + LINK_TTL_SEC;
  const jti = newJti();
  const body = `${userId}.${channel}.${exp}.${jti}`;
  const sig = sign(body);
  const token = `link_${b64url(`${body}.${sig}`)}`;
  await storeToken(linkStoreKey(jti), `${channel}:${userId}`, LINK_TTL_SEC);
  return token;
}

/** @deprecated sync helper — prefer issueMessengerLinkToken */
export function createMessengerLinkToken(userId: string, channel: MessengerChannel): string {
  // Best-effort sync path without one-time store (dev / legacy). Prefer async issue.
  const exp = Math.floor(Date.now() / 1000) + LINK_TTL_SEC;
  const jti = newJti();
  const body = `${userId}.${channel}.${exp}.${jti}`;
  const sig = sign(body);
  const token = `link_${b64url(`${body}.${sig}`)}`;
  void storeToken(linkStoreKey(jti), `${channel}:${userId}`, LINK_TTL_SEC);
  return token;
}

export function verifyMessengerLinkToken(
  raw: string
):
  | { ok: true; userId: string; channel: MessengerChannel; jti: string; exp: number }
  | { ok: false; reason: string } {
  const token = String(raw || '').trim();
  const stripped = token.replace(/^\/start(?:@\w+)?\s+/i, '').trim();
  const m = stripped.match(/^link_([A-Za-z0-9_-]+)$/i);
  if (!m) return { ok: false, reason: 'format' };
  let decoded: string;
  try {
    decoded = fromB64url(m[1]);
  } catch {
    return { ok: false, reason: 'decode' };
  }
  const parts = decoded.split('.');
  // New: userId.channel.exp.jti.sig (5) — legacy without jti: userId.channel.exp.sig (4)
  if (parts.length === 4) {
    const [userId, channel, expStr, sig] = parts;
    if (channel !== 'tg' && channel !== 'max') return { ok: false, reason: 'channel' };
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
      return { ok: false, reason: 'expired' };
    }
    const body = `${userId}.${channel}.${expStr}`;
    if (!safeEqual(sig, sign(body))) return { ok: false, reason: 'sig' };
    if (!userId || userId.length < 8) return { ok: false, reason: 'user' };
    return { ok: true, userId, channel, jti: '', exp };
  }
  if (parts.length !== 5) return { ok: false, reason: 'parts' };
  const [userId, channel, expStr, jti, sig] = parts;
  if (channel !== 'tg' && channel !== 'max') return { ok: false, reason: 'channel' };
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: 'expired' };
  }
  if (!jti || jti.length < 8) return { ok: false, reason: 'jti' };
  const body = `${userId}.${channel}.${expStr}.${jti}`;
  if (!safeEqual(sig, sign(body))) return { ok: false, reason: 'sig' };
  if (!userId || userId.length < 8) return { ok: false, reason: 'user' };
  return { ok: true, userId, channel, jti, exp };
}

/** Verify signature + burn one-time jti (when present). */
export async function consumeMessengerLinkToken(
  raw: string
): Promise<
  | { ok: true; userId: string; channel: MessengerChannel }
  | { ok: false; reason: string }
> {
  const verified = verifyMessengerLinkToken(raw);
  if (!verified.ok) return verified;
  if (verified.jti) {
    const stored = await consumeToken(linkStoreKey(verified.jti));
    if (!stored) return { ok: false, reason: 'used' };
    const expect = `${verified.channel}:${verified.userId}`;
    if (stored !== expect) return { ok: false, reason: 'mismatch' };
  }
  return { ok: true, userId: verified.userId, channel: verified.channel };
}

/** Extract link token from /start payload text or bot_started payload */
export function extractMessengerLinkToken(text: string | null | undefined): string | null {
  const t = String(text || '').trim();
  if (!t) return null;
  const start = t.match(/^\/start(?:@\w+)?(?:\s+|$)(.*)$/i);
  const payload = start ? start[1].trim() : t;
  if (/^link_[A-Za-z0-9_-]+$/i.test(payload)) return payload;
  const embedded = payload.match(/link_[A-Za-z0-9_-]+/i);
  return embedded ? embedded[0] : null;
}

export const MESSENGER_LINK_TTL_SEC = LINK_TTL_SEC;

/**
 * Bot → site claim: MAX id is NOT embedded in a forgeable plaintext form only —
 * signed jti points to server-side store. Bind requires login + POST confirm.
 */
export async function issueMaxClaimToken(maxUserId: string): Promise<string> {
  const id = String(maxUserId || '').replace(/[^\d]/g, '');
  if (!id || !/^\d{3,32}$/.test(id)) throw new Error('maxUserId required');
  const exp = Math.floor(Date.now() / 1000) + CLAIM_TTL_SEC;
  const jti = newJti();
  const body = `max2.${exp}.${jti}`;
  const sig = sign(body);
  const token = `claim_${b64url(`${body}.${sig}`)}`;
  await storeToken(claimStoreKey(jti), id, CLAIM_TTL_SEC);
  return token;
}

export function verifyMaxClaimToken(
  raw: string
):
  | { ok: true; jti: string; exp: number; legacyMaxUserId?: string }
  | { ok: false; reason: string } {
  const token = String(raw || '').trim();
  const m = token.match(/^claim_([A-Za-z0-9_-]+)$/i);
  if (!m) return { ok: false, reason: 'format' };
  let decoded: string;
  try {
    decoded = fromB64url(m[1]);
  } catch {
    return { ok: false, reason: 'decode' };
  }
  const parts = decoded.split('.');

  // New v2: max2.<exp>.<jti>.<sig>
  if (parts.length === 4 && parts[0] === 'max2') {
    const [, expStr, jti, sig] = parts;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
      return { ok: false, reason: 'expired' };
    }
    if (!jti || jti.length < 8) return { ok: false, reason: 'jti' };
    const body = `max2.${expStr}.${jti}`;
    if (!safeEqual(sig, sign(body))) return { ok: false, reason: 'sig' };
    return { ok: true, jti, exp };
  }

  // Legacy plaintext-id: max.<id>.<exp>.<sig>
  if (parts.length === 4 && parts[0] === 'max') {
    const [, maxUserId, expStr, sig] = parts;
    if (!/^\d{3,32}$/.test(maxUserId)) return { ok: false, reason: 'id' };
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
      return { ok: false, reason: 'expired' };
    }
    const body = `max.${maxUserId}.${expStr}`;
    if (!safeEqual(sig, sign(body))) return { ok: false, reason: 'sig' };
    return { ok: true, jti: '', exp, legacyMaxUserId: maxUserId };
  }

  return { ok: false, reason: 'parts' };
}

/** Peek claim without burning — for confirmation UI. */
export async function peekMaxClaim(
  raw: string
): Promise<{ ok: true; maxUserId: string; jti: string } | { ok: false; reason: string }> {
  const verified = verifyMaxClaimToken(raw);
  if (!verified.ok) return verified;
  if (verified.legacyMaxUserId) {
    return { ok: true, maxUserId: verified.legacyMaxUserId, jti: '' };
  }
  const stored = await peekToken(claimStoreKey(verified.jti));
  if (!stored) return { ok: false, reason: 'used' };
  return { ok: true, maxUserId: stored, jti: verified.jti };
}

/** Burn claim token and return MAX id (one-time). */
export async function consumeMaxClaimToken(
  raw: string
): Promise<{ ok: true; maxUserId: string } | { ok: false; reason: string }> {
  const verified = verifyMaxClaimToken(raw);
  if (!verified.ok) return verified;
  if (verified.legacyMaxUserId) {
    // Legacy tokens: no server store — allow once per request path only (TTL + confirm)
    return { ok: true, maxUserId: verified.legacyMaxUserId };
  }
  const stored = await consumeToken(claimStoreKey(verified.jti));
  if (!stored) return { ok: false, reason: 'used' };
  return { ok: true, maxUserId: stored };
}

export async function buildMaxClaimPath(maxUserId: string): Promise<string> {
  const t = await issueMaxClaimToken(maxUserId);
  return `/bind/max?t=${encodeURIComponent(t)}`;
}

export function maskMaxUserId(id: string) {
  const s = String(id || '').replace(/[^\d]/g, '');
  if (s.length <= 4) return '••••';
  return `${'•'.repeat(Math.min(8, s.length - 4))}${s.slice(-4)}`;
}

export const MAX_CLAIM_TTL_SEC = CLAIM_TTL_SEC;
