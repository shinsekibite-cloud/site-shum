/**
 * Short-lived 2FA login challenge tokens (signed HMAC).
 * Used when password is OK but TOTP is still required.
 */
import { createHmac, timingSafeEqual } from 'crypto';

const TTL_MS = 5 * 60_000;

function secret() {
  const value = process.env.NEXTAUTH_SECRET?.trim();
  if (value) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEXTAUTH_SECRET is required for 2FA challenges');
  }
  return 'dev-2fa-challenge';
}

export type TotpChallengePayload = {
  uid: string;
  exp: number;
};

export function issueTotpChallenge(userId: string): string {
  const payload: TotpChallengePayload = {
    uid: userId,
    exp: Date.now() + TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyTotpChallenge(token: string): TotpChallengePayload | null {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;
  const expected = createHmac('sha256', secret()).update(body).digest('base64url');
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TotpChallengePayload;
    if (!payload?.uid || typeof payload.exp !== 'number') return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
