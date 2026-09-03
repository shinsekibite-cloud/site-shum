/**
 * Organization working hours / days from SiteSettings (contacts + booking window).
 * Used for silent notification delivery outside office time.
 */
import { BOOKING_TZ, getTzMinutes, timeToMinutes } from '@/lib/booking-hours';
import { moscowNowParts } from '@/lib/vk-sync-schedule';

export type OrgWorkSchedule = {
  openTime: string;
  closeTime: string;
  /** 0=Sun … 6=Sat (same as VK schedule helpers) */
  weekdays: number[];
  /** Human label from settings */
  label: string;
};

const DAY_ALIASES: Record<string, number> = {
  вс: 0,
  воскресенье: 0,
  sun: 0,
  пн: 1,
  понедельник: 1,
  mon: 1,
  вт: 2,
  вторник: 2,
  tue: 2,
  ср: 3,
  среда: 3,
  wed: 3,
  чт: 4,
  четверг: 4,
  thu: 4,
  пт: 5,
  пятница: 5,
  fri: 5,
  сб: 6,
  суббота: 6,
  sat: 6,
};

const MON_FRI = [1, 2, 3, 4, 5];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function normDash(s: string) {
  return s.replace(/[–—−]/g, '-').replace(/\s+/g, ' ').trim();
}

function dayToken(raw: string): number | null {
  const k = raw.toLowerCase().replace(/ё/g, 'е').replace(/\./g, '').trim();
  if (k in DAY_ALIASES) return DAY_ALIASES[k];
  return null;
}

/** Expand «пн-пт» / «пн,ср,пт» fragments into weekday numbers. */
export function parseWorkWeekdays(raw: string | null | undefined): number[] {
  const text = normDash(String(raw || '').toLowerCase().replace(/ё/g, 'е'));
  if (!text) return [...MON_FRI];

  if (/ежеднев|круглосут|без\s*выходн|7\s*\/\s*7|24\s*\/\s*7/.test(text)) {
    return [...ALL_DAYS];
  }
  if (/пн\s*-\s*вс|пн\s*-\s*воскрес/.test(text)) {
    return [...ALL_DAYS];
  }

  // Weekend line says closed / by events → office days are Mon–Fri
  if (/сб\s*-\s*вс\s*[:].*(выходн|закрыт|по\s*расписанию|мероприят)/.test(text)) {
    return [...MON_FRI];
  }
  if (/выходн/.test(text) && /пн\s*-\s*пт/.test(text)) {
    return [...MON_FRI];
  }

  const found = new Set<number>();

  const rangeRe =
    /(пн|вт|ср|чт|пт|сб|вс|понедельник|вторник|среда|четверг|пятница|суббота|воскресенье)\s*-\s*(пн|вт|ср|чт|пт|сб|вс|понедельник|вторник|среда|четверг|пятница|суббота|воскресенье)/gi;
  let m: RegExpExecArray | null;
  while ((m = rangeRe.exec(text))) {
    const a = dayToken(m[1]);
    const b = dayToken(m[2]);
    if (a == null || b == null) continue;
    if (a <= b) {
      for (let d = a; d <= b; d++) found.add(d);
    } else {
      // wrap (rare): пт-пн
      for (let d = a; d <= 6; d++) found.add(d);
      for (let d = 0; d <= b; d++) found.add(d);
    }
  }

  // Standalone day tokens (avoid matching inside longer words)
  const singleRe =
    /(?:^|[\s,;:/])(пн|вт|ср|чт|пт|сб|вс|понедельник|вторник|среда|четверг|пятница|суббота|воскресенье)(?=[\s,;:/.]|$)/gi;
  while ((m = singleRe.exec(text))) {
    const d = dayToken(m[1]);
    if (d != null) found.add(d);
  }

  if (found.size) return [...found].sort((a, b) => a - b);
  return [...MON_FRI];
}

export function scheduleFromSettings(row: {
  workHours?: string | null;
  bookingOpenTime?: string | null;
  bookingCloseTime?: string | null;
} | null): OrgWorkSchedule {
  const openTime = /^\d{1,2}:\d{2}$/.test(String(row?.bookingOpenTime || '').trim())
    ? String(row!.bookingOpenTime).trim()
    : '09:00';
  const closeTime = /^\d{1,2}:\d{2}$/.test(String(row?.bookingCloseTime || '').trim())
    ? String(row!.bookingCloseTime).trim()
    : '18:00';
  const label = (row?.workHours || '').trim() || `пн–пт, ${openTime}–${closeTime} (МСК)`;
  // Day rules: prefer full text (may include «Сб–Вс: выходной»); for simple
  // «пн–пт, 09:00–18:00 (МСК)» the fragment before comma is enough.
  const hasWeekendNote = /сб|вс|выходн|ежеднев/i.test(label);
  const daySource =
    !hasWeekendNote && label.includes(',') ? label.split(',')[0] : label;
  const weekdays = parseWorkWeekdays(daySource.length >= 2 ? daySource : label);
  return { openTime, closeTime, weekdays, label };
}

export function describeOrgWorkSchedule(s: OrgWorkSchedule): string {
  const names = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const days =
    s.weekdays.length === 7
      ? 'ежедневно'
      : s.weekdays.length === 5 && s.weekdays.join(',') === '1,2,3,4,5'
        ? 'пн–пт'
        : s.weekdays.map((d) => names[d]).join(', ');
  return `${days}, ${s.openTime}–${s.closeTime} (МСК)`;
}

/** True if `date` falls on a working weekday and inside [open, close) Moscow. */
export function isWithinOrgWorkSchedule(s: OrgWorkSchedule, date = new Date()): boolean {
  const { weekday } = moscowNowParts(date);
  if (!s.weekdays.includes(weekday)) return false;

  const open = timeToMinutes(s.openTime, 9 * 60);
  const close = timeToMinutes(s.closeTime, 18 * 60);
  if (close <= open) return false;

  const mins = getTzMinutes(date, BOOKING_TZ);
  return mins >= open && mins < close;
}

export async function getOrgWorkSchedule(): Promise<OrgWorkSchedule> {
  const { prisma } = await import('@/lib/prisma');
  const row = await prisma.siteSettings.findUnique({
    where: { id: '1' },
    select: { workHours: true, bookingOpenTime: true, bookingCloseTime: true },
  });
  return scheduleFromSettings(row);
}

export async function isOrgWorkingNow(date = new Date()): Promise<boolean> {
  return isWithinOrgWorkSchedule(await getOrgWorkSchedule(), date);
}

/**
 * Outside working days/hours → deliver in-app + bots, but without sound / OS push / messenger ping.
 */
export async function shouldDeliverSilently(date = new Date()): Promise<boolean> {
  return !(await isOrgWorkingNow(date));
}
