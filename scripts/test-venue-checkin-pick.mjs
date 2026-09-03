import assert from 'node:assert/strict';
import {
  pickNearestVenueBooking,
  VENUE_CHECKIN_EARLY_MS,
  VENUE_CHECKIN_LATE_MS,
} from '../src/lib/venue-checkin-pick.ts';
import { bookingsConflictWithTurnover, BOOKING_TURNOVER_MS } from '../src/lib/booking-hours.ts';

function d(iso) {
  return new Date(iso);
}

assert.equal(VENUE_CHECKIN_LATE_MS, BOOKING_TURNOVER_MS);

// Бронь: 10–11 → следующее с 11:10 ок, с 11:05 конфликт
{
  const a0 = d('2026-08-17T07:00:00.000Z'); // 10:00 MSK
  const a1 = d('2026-08-17T08:00:00.000Z'); // 11:00 MSK
  const okStart = d('2026-08-17T08:10:00.000Z'); // 11:10
  const okEnd = d('2026-08-17T09:00:00.000Z');
  const badStart = d('2026-08-17T08:05:00.000Z'); // 11:05
  assert.equal(bookingsConflictWithTurnover(a0, a1, okStart, okEnd), false);
  assert.equal(bookingsConflictWithTurnover(a0, a1, badStart, okEnd), true);
}

const morning = {
  id: 'a',
  title: 'Утро',
  startTime: d('2026-08-17T07:00:00.000Z'), // 10:00 MSK
  endTime: d('2026-08-17T08:00:00.000Z'), // 11:00 MSK
};
const next = {
  id: 'b',
  title: 'Следующее',
  startTime: d('2026-08-17T08:10:00.000Z'), // 11:10 MSK
  endTime: d('2026-08-17T09:10:00.000Z'), // 12:10 MSK
};

// В зазоре 11:05 — предпочитаем следующее (upcoming), не late утра
{
  const now = d('2026-08-17T08:05:00.000Z'); // 11:05 MSK
  const r = pickNearestVenueBooking([morning, next], now, new Set());
  assert.equal(r?.booking.id, 'b');
  assert.equal(r?.phase, 'upcoming');
}

// Только утро, 11:05 — late ещё действует (10 мин)
{
  const now = d('2026-08-17T08:05:00.000Z');
  const r = pickNearestVenueBooking([morning], now, new Set());
  assert.equal(r?.booking.id, 'a');
  assert.equal(r?.phase, 'late');
}

// 11:15 — late утра закрыт, следующее during
{
  const now = d('2026-08-17T08:15:00.000Z'); // 11:15 MSK
  const r = pickNearestVenueBooking([morning, next], now, new Set());
  assert.equal(r?.booking.id, 'b');
  assert.equal(r?.phase, 'during');
}

// Середина длинного слота 10:00–14:00 — всё ещё during
{
  const long = {
    id: 'long',
    title: 'Длинное',
    startTime: d('2026-08-17T07:00:00.000Z'), // 10:00
    endTime: d('2026-08-17T11:00:00.000Z'), // 14:00
  };
  const now = d('2026-08-17T09:30:00.000Z'); // 12:30 MSK — середина
  const r = pickNearestVenueBooking([long, next], now, new Set());
  assert.equal(r?.booking.id, 'long');
  assert.equal(r?.phase, 'during');
}

{
  const now = new Date(morning.startTime.getTime() - VENUE_CHECKIN_EARLY_MS - 60_000);
  assert.equal(pickNearestVenueBooking([morning], now, new Set()), null);
}

console.log('venue-checkin-pick + turnover: ok');
