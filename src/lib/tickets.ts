import crypto from 'crypto';
import { originFromEnv } from '@/lib/site-identity-shared';

export const TICKET_PREFIX = 'TICKET';
export const VENUE_PREFIX = 'VENUE';
export const ORG_PREFIX = 'ORG';

function ticketSecret() {
  return process.env.NEXTAUTH_SECRET || process.env.TICKET_SECRET || '';
}

function signPayload(bookingId: string, userId: string) {
  const secret = ticketSecret();
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is required for ticket signing');
  }
  return crypto
    .createHmac('sha256', secret)
    .update(`${bookingId}:${userId}`)
    .digest('hex')
    .slice(0, 16);
}

function signVenue(spaceId: string) {
  const secret = ticketSecret();
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is required for venue signing');
  }
  return crypto.createHmac('sha256', secret).update(`venue:${spaceId}`).digest('hex').slice(0, 20);
}

/** Signed ticket: TICKET-{bookingId}-{userId}-{sig} */
export function buildTicketCode(bookingId: string, userId: string) {
  const sig = signPayload(bookingId, userId);
  return `${TICKET_PREFIX}-${bookingId}-${userId}-${sig}`;
}

export function parseTicketCode(raw: string): { bookingId: string; userId: string } | null {
  const value = String(raw || '').trim();
  const parts = value.split('-');
  if (parts.length < 4 || parts[0].toUpperCase() !== TICKET_PREFIX) return null;

  const sig = parts[parts.length - 1];
  const userId = parts[parts.length - 2];
  const bookingId = parts.slice(1, -2).join('-');
  if (!bookingId || !userId || !sig) return null;

  let expected: string;
  try {
    expected = signPayload(bookingId, userId);
  } catch {
    return null;
  }

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  return { bookingId, userId };
}

/** Permanent door QR payload: VENUE-{spaceId}-{sig} */
export function buildVenueCode(spaceId: string) {
  return `${VENUE_PREFIX}-${spaceId}-${signVenue(spaceId)}`;
}

export function parseVenueCode(raw: string): { spaceId: string } | null {
  const value = String(raw || '').trim();
  // Also accept full URL containing the code
  const match = value.match(/VENUE-[A-Za-z0-9_-]+-[a-f0-9]{20}/i);
  const code = match ? match[0] : value;
  const parts = code.split('-');
  if (parts.length < 3 || parts[0].toUpperCase() !== VENUE_PREFIX) return null;
  const sig = parts[parts.length - 1];
  const spaceId = parts.slice(1, -1).join('-');
  if (!spaceId || !sig) return null;
  let expected: string;
  try {
    expected = signVenue(spaceId);
  } catch {
    return null;
  }
  const a = Buffer.from(sig.toLowerCase());
  const b = Buffer.from(expected.toLowerCase());
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { spaceId };
}

/** Public self check-in URL for printed QR */
export function buildVenueCheckInUrl(spaceId: string, origin?: string) {
  const base = (origin || originFromEnv()).replace(/\/$/, '');
  const code = buildVenueCode(spaceId);
  return `${base}/check-in?code=${encodeURIComponent(code)}`;
}

function signOrgEntrance() {
  const secret = ticketSecret();
  if (!secret) throw new Error('NEXTAUTH_SECRET is required for org signing');
  return crypto.createHmac('sha256', secret).update('org:entrance:portal').digest('hex').slice(0, 20);
}

/** Single permanent QR for organization entrance (all spaces). ORG-portal-{sig} */
export function buildOrgEntranceCode() {
  return `${ORG_PREFIX}-portal-${signOrgEntrance()}`;
}

export function parseOrgEntranceCode(raw: string): boolean {
  const value = String(raw || '').trim();
  const match = value.match(/ORG-portal-[a-f0-9]{20}/i);
  const code = match ? match[0] : value;
  const parts = code.split('-');
  if (parts.length < 3 || parts[0].toUpperCase() !== ORG_PREFIX) return false;
  if (parts[1] !== 'portal') return false;
  const sig = parts[parts.length - 1];
  let expected: string;
  try {
    expected = signOrgEntrance();
  } catch {
    return false;
  }
  const a = Buffer.from(sig.toLowerCase());
  const b = Buffer.from(expected.toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** URL for the single org entrance QR (participants scan at the door). */
export function buildOrgEntranceCheckInUrl(origin?: string) {
  const base = (origin || originFromEnv()).replace(/\/$/, '');
  const code = buildOrgEntranceCode();
  return `${base}/check-in?code=${encodeURIComponent(code)}`;
}
