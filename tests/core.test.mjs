/**
 * Lightweight unit tests for booking overlap helpers / publish / tickets.
 * Run: node --test tests/*.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, timingSafeEqual } from 'node:crypto';

function publishedWhere(now = new Date()) {
  return {
    status: 'PUBLISHED',
    OR: [{ publishedAt: null }, { publishedAt: { lte: now } }],
  };
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

function signTicket(bookingId, userId, secret) {
  const sig = createHmac('sha256', secret)
    .update(`${bookingId}:${userId}`)
    .digest('hex')
    .slice(0, 16);
  return `TICKET-${bookingId}-${userId}-${sig}`;
}

function parseTicket(raw, secret) {
  const parts = String(raw || '').split('-');
  if (parts.length < 4 || parts[0].toUpperCase() !== 'TICKET') return null;
  const sig = parts[parts.length - 1];
  const userId = parts[parts.length - 2];
  const bookingId = parts.slice(1, -2).join('-');
  const expected = createHmac('sha256', secret).update(`${bookingId}:${userId}`).digest('hex').slice(0, 16);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { bookingId, userId };
}

function brandNameLines(raw) {
  const name = String(raw || '').trim() || 'Молодёжь Сочи';
  const crm = name.match(/^(Центр развития)\s+(молод[её]жи\s+Сочи)$/iu);
  if (crm) return [crm[1], crm[2]];
  if (name.length <= 24) return [name];
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length < 3) return [name];
  const mid = Math.ceil(parts.length / 2);
  return [parts.slice(0, mid).join(' '), parts.slice(mid).join(' ')].filter(Boolean);
}

test('booking intervals overlap detection', () => {
  const a0 = new Date('2026-08-04T10:00:00Z');
  const a1 = new Date('2026-08-04T12:00:00Z');
  const b0 = new Date('2026-08-04T11:00:00Z');
  const b1 = new Date('2026-08-04T13:00:00Z');
  const c0 = new Date('2026-08-04T12:00:00Z');
  const c1 = new Date('2026-08-04T14:00:00Z');
  assert.equal(overlaps(a0, a1, b0, b1), true);
  assert.equal(overlaps(a0, a1, c0, c1), false); // touching end==start not overlap with < and >
});

test('publishedWhere hides drafts and future schedules', () => {
  const now = new Date('2026-08-04T12:00:00Z');
  const where = publishedWhere(now);
  assert.equal(where.status, 'PUBLISHED');
  assert.ok(Array.isArray(where.OR));
});

test('signed tickets reject unsigned codes', () => {
  const secret = 'test-secret';
  const code = signTicket('book1', 'user1', secret);
  assert.ok(parseTicket(code, secret));
  assert.equal(parseTicket(`TICKET-book1-user1`, secret), null);
  assert.equal(parseTicket(`TICKET-book1-user1-deadbeefdeadbeef`, secret), null);
});

test('capacity join race invariant (logical)', () => {
  const capacity = 2;
  let count = 0;
  function tryJoin() {
    if (count >= capacity) return false;
    count += 1;
    return true;
  }
  assert.equal(tryJoin(), true);
  assert.equal(tryJoin(), true);
  assert.equal(tryJoin(), false);
  assert.equal(count, 2);
});

test('short portal name stays on one header line', () => {
  assert.deepEqual(brandNameLines('Молодёжь Сочи'), ['Молодёжь Сочи']);
  assert.deepEqual(brandNameLines('Молодежь Сочи'), ['Молодежь Сочи']);
  assert.deepEqual(brandNameLines('Центр развития молодёжи Сочи'), [
    'Центр развития',
    'молодёжи Сочи',
  ]);
});
