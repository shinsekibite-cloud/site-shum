/**
 * Hall occupancy week grid — derived from bookings + SpaceClosure + working hours (MSK).
 */
import {
  BOOKING_TZ,
  BOOKING_OFFSET,
  getTzYmd,
  minutesToTime,
  timeToMinutes,
} from '@/lib/booking-hours';

export type SlotStatus = 'free' | 'busy_event' | 'busy_booking' | 'service' | 'closed';

export type OccupancySlot = {
  start: string; // ISO
  end: string;
  startMin: number;
  endMin: number;
  dayKey: string;
  status: SlotStatus;
  label: string | null;
  bookingId: string | null;
  public: boolean;
};

export type DayGrid = {
  dayKey: string;
  label: string;
  slots: OccupancySlot[];
};

function mskDateFromYmd(dayKey: string, minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return new Date(`${dayKey}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00${BOOKING_OFFSET}`);
}

function addDaysYmd(dayKey: string, days: number) {
  const d = new Date(`${dayKey}T12:00:00${BOOKING_OFFSET}`);
  d.setTime(d.getTime() + days * 86400000);
  return getTzYmd(d, BOOKING_TZ);
}

function weekdayRu(dayKey: string) {
  const d = new Date(`${dayKey}T12:00:00${BOOKING_OFFSET}`);
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: BOOKING_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(d);
}

export function buildWeekDayKeys(from = new Date(), days = 7): string[] {
  const start = getTzYmd(from, BOOKING_TZ);
  return Array.from({ length: days }, (_, i) => addDaysYmd(start, i));
}

type Interval = {
  start: Date;
  end: Date;
  status: SlotStatus;
  label: string | null;
  bookingId: string | null;
  public: boolean;
};

export function buildOccupancyWeek(opts: {
  openMin: number;
  closeMin: number;
  stepMin: 30 | 60;
  dayKeys: string[];
  bookings: Array<{
    id: string;
    title: string;
    startTime: Date;
    endTime: Date;
    status: string;
    contactMode?: string | null;
  }>;
  closures: Array<{
    startTime: Date;
    endTime: Date;
    kind: string;
    note: string | null;
  }>;
}): DayGrid[] {
  const step = opts.stepMin === 30 ? 30 : 60;
  const open = Math.max(0, opts.openMin);
  const close = Math.min(24 * 60, Math.max(open + step, opts.closeMin));

  const intervals: Interval[] = [
    ...opts.closures.map((c) => ({
      start: c.startTime,
      end: c.endTime,
      status: (c.kind === 'CLOSED' ? 'closed' : 'service') as SlotStatus,
      label: c.note || (c.kind === 'CLOSED' ? 'Закрыто' : 'Служебное'),
      bookingId: null,
      public: true,
    })),
    ...opts.bookings
      .filter((b) => b.status === 'APPROVED' || b.status === 'PENDING')
      .map((b) => ({
        start: b.startTime,
        end: b.endTime,
        status: (b.status === 'APPROVED' ? 'busy_event' : 'busy_booking') as SlotStatus,
        label:
          b.contactMode === 'HIDDEN' || b.status === 'PENDING'
            ? 'Занято'
            : b.title || 'Занято',
        bookingId: b.id,
        public: b.status === 'APPROVED' && b.contactMode !== 'HIDDEN',
      })),
  ];

  return opts.dayKeys.map((dayKey) => {
    const slots: OccupancySlot[] = [];
    for (let t = open; t + step <= close; t += step) {
      const start = mskDateFromYmd(dayKey, t);
      const end = mskDateFromYmd(dayKey, t + step);
      const hit = intervals.find(
        (iv) => iv.start.getTime() < end.getTime() && iv.end.getTime() > start.getTime()
      );
      slots.push({
        start: start.toISOString(),
        end: end.toISOString(),
        startMin: t,
        endMin: t + step,
        dayKey,
        status: hit?.status || 'free',
        label: hit ? (hit.public ? hit.label : 'Занято') : null,
        bookingId: hit?.bookingId || null,
        public: hit?.public ?? true,
      });
    }
    return { dayKey, label: weekdayRu(dayKey), slots };
  });
}

export function nextFreeWindow(week: DayGrid[], after = new Date()): { dayKey: string; from: string; label: string } | null {
  for (const day of week) {
    for (const slot of day.slots) {
      if (slot.status !== 'free') continue;
      if (new Date(slot.start).getTime() < after.getTime()) continue;
      return {
        dayKey: day.dayKey,
        from: minutesToTime(slot.startMin),
        label: `свободно с ${minutesToTime(slot.startMin)}`,
      };
    }
  }
  return null;
}

export function parseOpenClose(
  spaceOpen: string | null | undefined,
  spaceClose: string | null | undefined,
  siteOpen: string | null | undefined,
  siteClose: string | null | undefined
) {
  return {
    openMin: timeToMinutes(spaceOpen || siteOpen || '09:00', 9 * 60),
    closeMin: timeToMinutes(spaceClose || siteClose || '21:00', 21 * 60),
  };
}

export function slotStatusLabel(status: SlotStatus) {
  switch (status) {
    case 'free':
      return 'Свободно';
    case 'busy_event':
      return 'Событие';
    case 'busy_booking':
      return 'Бронь';
    case 'service':
      return 'Служебное';
    case 'closed':
      return 'Закрыто';
    default:
      return status;
  }
}
