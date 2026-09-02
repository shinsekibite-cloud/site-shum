/**
 * Coworking signup helpers — periods, seat limits, cancel rules.
 */
import { BOOKING_OFFSET, BOOKING_TZ, getTzYmd } from '@/lib/booking-hours';

export const COWORKING_PERIODS = [
  { id: 'MORNING', label: 'Утро', start: '09:00', end: '13:00' },
  { id: 'DAY', label: 'День', start: '13:00', end: '17:00' },
  { id: 'EVENING', label: 'Вечер', start: '17:00', end: '21:00' },
] as const;

export type CoworkingPeriodId = (typeof COWORKING_PERIODS)[number]['id'];

export function isCoworkingSpace(space: { category?: string | null; bookingMode?: string | null; title?: string | null }) {
  const mode = (space.bookingMode || '').toUpperCase();
  if (mode === 'COWORKING' || mode === 'BOTH') return true;
  const cat = (space.category || '').toLowerCase();
  const title = (space.title || '').toLowerCase();
  return cat.includes('коворк') || title.includes('коворк');
}

export function periodBounds(dayKey: string, period: CoworkingPeriodId | string) {
  const def = COWORKING_PERIODS.find((p) => p.id === period) || COWORKING_PERIODS[1];
  const start = new Date(`${dayKey}T${def.start}:00${BOOKING_OFFSET}`);
  const end = new Date(`${dayKey}T${def.end}:00${BOOKING_OFFSET}`);
  return { start, end, period: def };
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
