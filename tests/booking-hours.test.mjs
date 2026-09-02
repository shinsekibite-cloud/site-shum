/**
 * Booking hours / Moscow wall-clock — mirrors src/lib/booking-hours.ts.
 * Run: node --test tests/*.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const BOOKING_OFFSET = '+03:00';
const BOOKING_TZ = 'Europe/Moscow';

function moscowWallDate(year, monthIndex, day, hhmm) {
  const y = String(year).padStart(4, '0');
  const mo = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  const time = /^\d{1,2}:\d{2}$/.test(hhmm.trim()) ? hhmm.trim() : '09:00';
  const [hh, mm] = time.split(':');
  return new Date(`${y}-${mo}-${d}T${String(hh).padStart(2, '0')}:${mm}:00${BOOKING_OFFSET}`);
}

function getTzMinutes(date, timeZone = BOOKING_TZ) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  const h = hour === 24 ? 0 : hour;
  return h * 60 + minute;
}

function getTzYmd(date, timeZone = BOOKING_TZ) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function timeToMinutes(value, fallback) {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value.trim())) return fallback;
  const [h, m] = value.trim().split(':').map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return fallback;
  return h * 60 + m;
}

function isWithinWorkingHours(start, end, openTime = '09:00', closeTime = '21:00') {
  const open = timeToMinutes(openTime, 9 * 60);
  const close = timeToMinutes(closeTime, 21 * 60);
  if (close <= open) return { ok: false };
  if (getTzYmd(start) !== getTzYmd(end)) return { ok: false };
  const startMins = getTzMinutes(start);
  const endMins = getTzMinutes(end);
  if (startMins < open || endMins > close) {
    return { ok: false, message: `Бронирование доступно только в рабочее время` };
  }
  return { ok: true };
}

test('09:00–11:00 Sochi wall time is accepted (not UTC getHours false reject)', () => {
  const start = moscowWallDate(2026, 7, 28, '09:00');
  const end = moscowWallDate(2026, 7, 28, '11:00');

  assert.equal(start.toISOString(), '2026-08-28T06:00:00.000Z');
  assert.equal(getTzMinutes(start), 540);
  assert.equal(isWithinWorkingHours(start, end).ok, true);

  // Bug reproduction: naive UTC getHours on VPS would see 06:00 and reject
  assert.ok(start.getUTCHours() < 9);
  assert.equal(isWithinWorkingHours(moscowWallDate(2026, 7, 28, '08:00'), end).ok, false);
});
