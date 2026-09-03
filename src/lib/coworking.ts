/**
 * Coworking signup helpers — hourly slots, seat limits, cancel rules.
 */
import { BOOKING_OFFSET, BOOKING_TZ, getTzYmd } from '@/lib/booking-hours';

/** Max seats one signup can request (per person / group). */
export const COWORKING_MAX_SEATS = 10;

/** Hourly open slots 09:00–21:00 (Moscow). */
export const COWORKING_PERIODS = [
  { id: 'H09', label: '09:00', start: '09:00', end: '10:00' },
  { id: 'H10', label: '10:00', start: '10:00', end: '11:00' },
  { id: 'H11', label: '11:00', start: '11:00', end: '12:00' },
  { id: 'H12', label: '12:00', start: '12:00', end: '13:00' },
  { id: 'H13', label: '13:00', start: '13:00', end: '14:00' },
  { id: 'H14', label: '14:00', start: '14:00', end: '15:00' },
  { id: 'H15', label: '15:00', start: '15:00', end: '16:00' },
  { id: 'H16', label: '16:00', start: '16:00', end: '17:00' },
  { id: 'H17', label: '17:00', start: '17:00', end: '18:00' },
  { id: 'H18', label: '18:00', start: '18:00', end: '19:00' },
  { id: 'H19', label: '19:00', start: '19:00', end: '20:00' },
  { id: 'H20', label: '20:00', start: '20:00', end: '21:00' },
] as const;

/** Legacy 4-hour blocks — kept so old rows still resolve. */
export const COWORKING_PERIODS_LEGACY = [
  { id: 'MORNING', label: 'Утро', start: '09:00', end: '13:00' },
  { id: 'DAY', label: 'День', start: '13:00', end: '17:00' },
  { id: 'EVENING', label: 'Вечер', start: '17:00', end: '21:00' },
] as const;

export type CoworkingPeriodId = (typeof COWORKING_PERIODS)[number]['id'];

export type CoworkingPeriodDef = {
  id: string;
  label: string;
  start: string;
  end: string;
};

export function resolveCoworkingPeriod(period: string): CoworkingPeriodDef {
  const hourly = COWORKING_PERIODS.find((p) => p.id === period);
  if (hourly) return hourly;
  const legacy = COWORKING_PERIODS_LEGACY.find((p) => p.id === period);
  if (legacy) return legacy;
  return COWORKING_PERIODS[0];
}

export function isCoworkingSpace(space: {
  category?: string | null;
  bookingMode?: string | null;
  title?: string | null;
}) {
  const mode = (space.bookingMode || '').toUpperCase();
  if (mode === 'COWORKING' || mode === 'BOTH') return true;
  const cat = (space.category || '').toLowerCase();
  const title = (space.title || '').toLowerCase();
  return cat.includes('коворк') || title.includes('коворк');
}

export function periodBounds(dayKey: string, period: CoworkingPeriodId | string) {
  const def = resolveCoworkingPeriod(period);
  const start = new Date(`${dayKey}T${def.start}:00${BOOKING_OFFSET}`);
  const end = new Date(`${dayKey}T${def.end}:00${BOOKING_OFFSET}`);
  return { start, end, period: def };
}

/** Next bookable hour today, otherwise first slot. */
export function defaultCoworkingPeriodId(dayKey: string, now = new Date()) {
  const today = todayKey(now);
  if (dayKey !== today) return COWORKING_PERIODS[0].id;
  for (const p of COWORKING_PERIODS) {
    const { end } = periodBounds(dayKey, p.id);
    if (end.getTime() > now.getTime()) return p.id;
  }
  return COWORKING_PERIODS[COWORKING_PERIODS.length - 1].id;
}

export function canCancelFree(startTime: Date, now = new Date()) {
  return startTime.getTime() - now.getTime() >= 3 * 60 * 60 * 1000;
}

export function todayKey(now = new Date()) {
  return getTzYmd(now, BOOKING_TZ);
}

export function activeSignupStatuses() {
  return ['PENDING', 'CONFIRMED', 'WAITLIST'] as const;
}

export function occupiedSeatStatuses() {
  return ['PENDING', 'CONFIRMED', 'ATTENDED'] as const;
}

export function clampCoworkingSeats(raw: unknown, max = COWORKING_MAX_SEATS) {
  const n = Math.floor(Number(raw));
  const cap = Math.max(1, Math.floor(max) || COWORKING_MAX_SEATS);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(cap, n);
}
