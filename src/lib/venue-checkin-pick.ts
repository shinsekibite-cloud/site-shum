/**
 * Выбор мероприятия для отметки по постоянному QR входа.
 *
 * Окна отметки (МСК):
 * 1. **during** — в любой момент от start до end (даже если пришёл в середине)
 * 2. **upcoming** — за EARLY до начала (открытие дверей)
 * 3. **late** — ещё TURNOVER (10 мин) после конца
 *
 * Стыковка: 10:00–11:00 → следующее с 11:10.
 * В зазоре 11:00–11:10: upcoming следующего важнее late предыдущего.
 * Пока событие идёт — оно всегда побеждает (можно отметиться весь слот).
 */
import { BOOKING_TURNOVER_MS, getTzYmd } from '@/lib/booking-hours';

/** Открытие дверей: за сколько до start можно отметиться */
export const VENUE_CHECKIN_EARLY_MS = 60 * 60 * 1000;
/** После конца — только зазор смены площадки (10 мин) */
export const VENUE_CHECKIN_LATE_MS = BOOKING_TURNOVER_MS;

export type VenuePickBooking = {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
};

export type VenuePickPhase = 'during' | 'upcoming' | 'late';

export type VenuePickResult<T extends VenuePickBooking> = {
  booking: T;
  phase: VenuePickPhase;
  /** Сколько ещё записей на сегодня (без выбранной), ещё без check-in */
  otherOpenCount: number;
};

/** Можно ли сейчас отметиться на это мероприятие (любая фаза). */
export function isVenueCheckInOpen(b: VenuePickBooking, now: Date): boolean {
  return phaseOf(b, now) !== null;
}

function phaseOf(b: VenuePickBooking, now: Date): VenuePickPhase | null {
  const t = now.getTime();
  const start = b.startTime.getTime();
  const end = b.endTime.getTime();
  // Весь интервал мероприятия — основная возможность отметиться
  if (t >= start && t <= end) return 'during';
  if (t < start && start - t <= VENUE_CHECKIN_EARLY_MS) return 'upcoming';
  if (t > end && t - end <= VENUE_CHECKIN_LATE_MS) return 'late';
  return null;
}

/** Удалённость: during = 0; иначе до start или после end */
function distanceMs(b: VenuePickBooking, now: Date, phase: VenuePickPhase): number {
  const t = now.getTime();
  if (phase === 'during') return 0;
  if (phase === 'upcoming') return b.startTime.getTime() - t;
  return t - b.endTime.getTime();
}

/** during всегда выше; в зазоре смены upcoming > late */
const PHASE_RANK: Record<VenuePickPhase, number> = {
  during: 0,
  upcoming: 1,
  late: 2,
};

/**
 * Среди записей пользователя на календарный день (МСК) выбирает мероприятие
 * для отметки: идущее сейчас (весь слот) → ближайшее по времени в early/late.
 */
export function pickNearestVenueBooking<T extends VenuePickBooking>(
  bookings: T[],
  now: Date,
  alreadyCheckedIds: Set<string>
): VenuePickResult<T> | null {
  const todayYmd = getTzYmd(now);
  const open = bookings.filter((b) => {
    if (alreadyCheckedIds.has(b.id)) return false;
    const startYmd = getTzYmd(b.startTime);
    const endYmd = getTzYmd(b.endTime);
    if (startYmd !== todayYmd && endYmd !== todayYmd) return false;
    return phaseOf(b, now) !== null;
  });

  if (!open.length) return null;

  const scored = open.map((booking) => {
    const phase = phaseOf(booking, now)!;
    return {
      booking,
      phase,
      rank: PHASE_RANK[phase],
      dist: distanceMs(booking, now, phase),
      start: booking.startTime.getTime(),
    };
  });

  scored.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.dist !== b.dist) return a.dist - b.dist;
    return a.start - b.start;
  });

  const best = scored[0];
  return {
    booking: best.booking,
    phase: best.phase,
    otherOpenCount: Math.max(0, scored.length - 1),
  };
}

export function venuePhaseMessage(phase: VenuePickPhase, title: string): string {
  switch (phase) {
    case 'during':
      return `Отмечены на «${title}». Можно пройти в любой момент, пока идёт мероприятие.`;
    case 'upcoming':
      return `Отмечены на «${title}» (ещё не началось — двери уже открыты).`;
    case 'late':
      return `Отмечены на «${title}» (небольшая задержка после окончания).`;
  }
}
