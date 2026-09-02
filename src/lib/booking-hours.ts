/** Working-hours helpers in Europe/Moscow (portal timezone for Sochi). */

export const BOOKING_TZ = 'Europe/Moscow';
/** Fixed offset for Sochi/MSK wall-clock ISO (no DST). */
export const BOOKING_OFFSET = '+03:00';

/**
 * Минимальный зазор между мероприятиями на одной площадке.
 * Пример: 10:00–11:00 → следующее не раньше 11:10.
 */
export const BOOKING_TURNOVER_MINUTES = 10;
export const BOOKING_TURNOVER_MS = BOOKING_TURNOVER_MINUTES * 60 * 1000;

/** True if [aStart,aEnd) conflicts with [bStart,bEnd) including turnover gap. */
export function bookingsConflictWithTurnover(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
  turnoverMs = BOOKING_TURNOVER_MS
): boolean {
  // Expand each interval by turnover on the end side: next may start only at end+gap
  return aStart.getTime() < bEnd.getTime() + turnoverMs && aEnd.getTime() + turnoverMs > bStart.getTime();
}

/** Parse "HH:MM" into minutes from midnight. */
export function timeToMinutes(value: string | null | undefined, fallback: number): number {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value.trim())) return fallback;
  const [h, m] = value.trim().split(':').map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return fallback;
  return h * 60 + m;
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Minutes from midnight in a given IANA timezone. */
export function getTzMinutes(date: Date, timeZone = BOOKING_TZ): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  // en-GB can still yield "24" in some engines for midnight — normalize
  const h = hour === 24 ? 0 : hour;
  return h * 60 + minute;
}

/** Calendar Y-M-D in timezone for same-day checks. */
export function getTzYmd(date: Date, timeZone = BOOKING_TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Build a Date from calendar Y/M/D (month 0-indexed like Date) and HH:MM
 * interpreted as Sochi/Moscow wall clock (+03:00), not the browser/VPS local zone.
 */
export function moscowWallDate(
  year: number,
  monthIndex: number,
  day: number,
  hhmm: string
): Date {
  const y = String(year).padStart(4, '0');
  const mo = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  const time = /^\d{1,2}:\d{2}$/.test(hhmm.trim()) ? hhmm.trim() : '09:00';
  const [hh, mm] = time.split(':');
  return new Date(`${y}-${mo}-${d}T${String(hh).padStart(2, '0')}:${mm}:00${BOOKING_OFFSET}`);
}

export function isWithinWorkingHours(
  start: Date,
  end: Date,
  openTime = '09:00',
  closeTime = '21:00',
  timeZone = BOOKING_TZ
): { ok: boolean; message?: string } {
  const open = timeToMinutes(openTime, 9 * 60);
  const close = timeToMinutes(closeTime, 21 * 60);
  if (close <= open) {
    return { ok: false, message: 'Некорректный интервал рабочего времени в настройках' };
  }

  if (getTzYmd(start, timeZone) !== getTzYmd(end, timeZone)) {
    return { ok: false, message: 'Бронирование должно быть в пределах одного дня' };
  }

  const startMins = getTzMinutes(start, timeZone);
  const endMins = getTzMinutes(end, timeZone);
  if (startMins < open || endMins > close) {
    return {
      ok: false,
      message: `Бронирование доступно только в рабочее время: ${minutesToTime(open)}–${minutesToTime(close)} (время Сочи)`,
    };
  }
  return { ok: true };
}

/** Build <option> values for time selects within working hours (10-min steps). */
export function workingHourOptions(openTime = '09:00', closeTime = '21:00'): string[] {
  const open = timeToMinutes(openTime, 9 * 60);
  const close = timeToMinutes(closeTime, 21 * 60);
  const out: string[] = [];
  for (let t = open; t <= close; t += BOOKING_TURNOVER_MINUTES) out.push(minutesToTime(t));
  return out;
}

function asDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Time only in Moscow (e.g. «14:30»). */
export function formatMskTime(value: Date | string | number): string {
  return asDate(value).toLocaleTimeString('ru-RU', {
    timeZone: BOOKING_TZ,
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Short date in Moscow (e.g. «5 августа»). */
export function formatMskDate(
  value: Date | string | number,
  opts?: { day?: 'numeric' | '2-digit'; month?: 'numeric' | '2-digit' | 'long' | 'short'; year?: 'numeric' | '2-digit' }
): string {
  return asDate(value).toLocaleDateString('ru-RU', {
    timeZone: BOOKING_TZ,
    day: opts?.day ?? 'numeric',
    month: opts?.month ?? 'long',
    ...(opts?.year ? { year: opts.year } : {}),
  });
}

/** Date + time in Moscow for bookings / emails. */
export function formatMskDateTime(
  value: Date | string | number,
  opts?: { withYear?: boolean; month?: 'numeric' | '2-digit' | 'long' | 'short' }
): string {
  return asDate(value).toLocaleString('ru-RU', {
    timeZone: BOOKING_TZ,
    day: 'numeric',
    month: opts?.month ?? 'long',
    ...(opts?.withYear ? { year: 'numeric' as const } : {}),
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** «14:30 – 16:00» in Moscow. */
export function formatMskTimeRange(
  start: Date | string | number,
  end: Date | string | number
): string {
  return `${formatMskTime(start)} – ${formatMskTime(end)}`;
}

/** True if both instants fall on the same calendar day in Moscow. */
export function sameMskDay(a: Date | string | number, b: Date | string | number): boolean {
  return getTzYmd(asDate(a)) === getTzYmd(asDate(b));
}

/** Y-M-D for a naive calendar cell (year, monthIndex, day) as used by the booking grid. */
export function calendarCellYmd(year: number, monthIndex: number, day: number): string {
  const y = String(year).padStart(4, '0');
  const mo = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}
