/**
 * Personal presence QR — opaque user id + short-lived signed token (24h rotation).
 * Payload URL: /c/{token}
 */
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { originFromEnv } from '@/lib/site-identity-shared';

export const PRESENCE_TTL_MS = 24 * 60 * 60 * 1000;
const PRESENCE_PREFIX = 'P';

function secret() {
  return process.env.NEXTAUTH_SECRET || process.env.TICKET_SECRET || '';
}

function randomToken() {
  return crypto.randomBytes(18).toString('base64url');
}

function signToken(userId: string, raw: string, expMs: number) {
  const s = secret();
  if (!s) throw new Error('NEXTAUTH_SECRET is required for presence QR');
  return crypto
    .createHmac('sha256', s)
    .update(`${userId}:${raw}:${expMs}`)
    .digest('hex')
    .slice(0, 16);
}

/** Compact token stored in DB and encoded in URL: P.{userId}.{exp}.{raw}.{sig} — too long.
 * Prefer opaque DB token only in URL: /c/{opaque} where opaque is presenceQrToken.
 */
export async function issuePresenceQr(userId: string, opts?: { force?: boolean }) {
  const now = Date.now();
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { presenceQrToken: true, presenceQrExpiresAt: true, name: true, publicCode: true, image: true },
  });
  if (!existing) return null;

  const stillValid =
    !opts?.force &&
    existing.presenceQrToken &&
    existing.presenceQrExpiresAt &&
    existing.presenceQrExpiresAt.getTime() > now + 5 * 60 * 1000;

  if (stillValid && existing.presenceQrToken) {
    return {
      token: existing.presenceQrToken,
      expiresAt: existing.presenceQrExpiresAt!,
      url: presenceUrl(existing.presenceQrToken),
      user: existing,
    };
  }

  const token = `${PRESENCE_PREFIX}${randomToken()}`;
  const expiresAt = new Date(now + PRESENCE_TTL_MS);
  // bind signature into meta by storing only opaque token; verification is DB lookup + expiry
  await prisma.user.update({
    where: { id: userId },
    data: { presenceQrToken: token, presenceQrExpiresAt: expiresAt },
  });

  return {
    token,
    expiresAt,
    url: presenceUrl(token),
    user: existing,
  };
}

export function presenceUrl(token: string) {
  const origin = originFromEnv().replace(/\/$/, '');
  return `${origin}/c/${encodeURIComponent(token)}`;
}

export async function resolvePresenceToken(raw: string) {
  const token = String(raw || '')
    .trim()
    .replace(/^.*\/c\//i, '')
    .split(/[?#]/)[0];
  if (!token || token.length < 8) {
    return { ok: false as const, code: 'INVALID', message: 'Некорректный QR' };
  }

  const user = await prisma.user.findFirst({
    where: { presenceQrToken: token },
    select: {
      id: true,
      name: true,
      nickname: true,
      publicCode: true,
      image: true,
      presenceQrExpiresAt: true,
      blockedAt: true,
      mBall: true,
      ecoBall: true,
      role: true,
    },
  });

  if (!user) {
    return { ok: false as const, code: 'UNKNOWN', message: 'QR не найден — попросите обновить в кабинете' };
  }
  if (user.blockedAt) {
    return { ok: false as const, code: 'BLOCKED', message: 'Аккаунт заблокирован' };
  }
  if (!user.presenceQrExpiresAt || user.presenceQrExpiresAt.getTime() < Date.now()) {
    return { ok: false as const, code: 'EXPIRED', message: 'QR просрочен — обновите в кабинете' };
  }

  return { ok: true as const, user, token };
}

/** Mask FIO for reception: «Иван П.» */
export function maskDisplayName(name: string | null | undefined) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'Участник';
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  return `${parts[0]} ${last.charAt(0).toUpperCase()}.`;
}

export { signToken };
