/**
 * One-shot HMAC tickets so a captcha already solved on login-challenge
 * or SMS request is not consumed twice by NextAuth credentials.
 */
import { createHmac, timingSafeEqual } from 'crypto';

const TTL_MS = 2 * 60_000;

function secret() {
  const value = process.env.NEXTAUTH_SECRET?.trim();
  if (value) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEXTAUTH_SECRET is required for auth tickets');
  }
  return 'dev-auth-ticket';
}

export type AuthTicketPayload = {
  login: string;
  purpose: 'login' | 'sms' | 'register';
  exp: number;
};

function normalizeLoginKey(login: string) {
  return String(login || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

export function issueAuthTicket(login: string, purpose: AuthTicketPayload['purpose'] = 'login'): string {
  const payload: AuthTicketPayload = {
    login: normalizeLoginKey(login),
    purpose,
    exp: Date.now() + TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyAuthTicket(
  token: string,
  login: string,
  purpose?: AuthTicketPayload['purpose']
): AuthTicketPayload | null {
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
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as AuthTicketPayload;
    if (!payload?.login || typeof payload.exp !== 'number') return null;
    if (Date.now() > payload.exp) return null;
    if (normalizeLoginKey(login) !== payload.login) return null;
    if (purpose && payload.purpose !== purpose) return null;
    return payload;
  } catch {
    return null;
  }
}
