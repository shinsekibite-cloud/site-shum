import { prisma } from '@/lib/prisma';

/** Рейтинг надёжности: 100% старт, − за no-show, + за приход и активность */
export const RELIABILITY = {
  MIN: 0,
  MAX: 100,
  NO_SHOW_DELTA: -10,
  ATTEND_DELTA: 4,
  JOIN_DELTA: 1,
  /** Часов после endTime, прежде чем считать пропуском */
  NO_SHOW_GRACE_HOURS: 2,
} as const;

function clamp(n: number) {
  return Math.max(RELIABILITY.MIN, Math.min(RELIABILITY.MAX, Math.round(n)));
}

/**
 * Display + API reliability from attendance.
 * 0 visits → null (do not show 100%).
 * Otherwise: round(attended / (attended + noShow) * 100).
 */
export function reliabilityFromAttendance(
  attended: number | null | undefined,
  noShow: number | null | undefined
): number | null {
  const a = Math.max(0, Number(attended) || 0);
  const n = Math.max(0, Number(noShow) || 0);
  const total = a + n;
  if (total <= 0) return null;
  return clamp((a / total) * 100);
}

/** Gate value (referrals, vacancies): 0 visits → 100 so new users are not blocked. */
export function reliabilityScoreForGates(
  attended: number | null | undefined,
  noShow: number | null | undefined
): number {
  return reliabilityFromAttendance(attended, noShow) ?? 100;
}

export function reliabilityDetail(
  attended: number | null | undefined,
  noShow: number | null | undefined
): { percent: number | null; label: string; attended: number; noShow: number; total: number } {
  const a = Math.max(0, Number(attended) || 0);
  const n = Math.max(0, Number(noShow) || 0);
  const percent = reliabilityFromAttendance(a, n);
  const total = a + n;
  const label =
    percent == null ? 'Пока нет посещений' : `${percent}% · ${a} из ${total}`;
  return { percent, label, attended: a, noShow: n, total };
}

export async function bumpReliability(
  userId: string,
  delta: number,
  counters?: { attended?: number; noShow?: number }
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { reliabilityScore: true, attendedCount: true, noShowCount: true },
  });
  if (!user) return null;
  const attended = Math.max(0, (user.attendedCount ?? 0) + (counters?.attended ?? 0));
  const noShow = Math.max(0, (user.noShowCount ?? 0) + (counters?.noShow ?? 0));
  const fromAttendance = reliabilityFromAttendance(attended, noShow);
  const next =
    fromAttendance != null
      ? fromAttendance
      : clamp((user.reliabilityScore ?? 100) + delta);
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      reliabilityScore: next,
      ...(counters?.attended !== undefined || counters?.noShow !== undefined
        ? { attendedCount: attended, noShowCount: noShow }
        : {}),
    },
    select: { id: true, reliabilityScore: true, attendedCount: true, noShowCount: true },
  });
  if (delta) {
    const { logReputationEvent } = await import('@/lib/reputation-history');
    await logReputationEvent({
      userId,
      kind: 'AUTHORITY',
      delta,
      balanceAfter: next,
      reason:
        delta > 0
          ? counters?.attended
            ? 'Присутствие на мероприятии'
            : 'Активность / участие'
          : counters?.noShow
            ? 'Пропуск мероприятия'
            : 'Снижение авторитета',
      meta: counters,
    });
  }
  return updated;
}

/** После успешного QR/ручного check-in */
export async function recordAttendanceCheckIn(bookingId: string, userId: string) {
  const participant = await prisma.bookingParticipant.findUnique({
    where: { bookingId_userId: { bookingId, userId } },
  });

  if (participant && participant.attendanceStatus !== 'CHECKED_IN') {
    const wasPending = participant.attendanceStatus === 'PENDING';
    await prisma.bookingParticipant.update({
      where: { id: participant.id },
      data: {
        attendanceStatus: 'CHECKED_IN',
        attendanceSettledAt: new Date(),
      },
    });
    if (wasPending || participant.attendanceStatus === 'NO_SHOW') {
      // Если уже был NO_SHOW и потом пришёл — мягко компенсируем
      const delta =
        participant.attendanceStatus === 'NO_SHOW'
          ? Math.abs(RELIABILITY.NO_SHOW_DELTA) + RELIABILITY.ATTEND_DELTA
          : RELIABILITY.ATTEND_DELTA;
      await bumpReliability(userId, delta, {
        attended: 1,
        noShow: participant.attendanceStatus === 'NO_SHOW' ? -1 : undefined,
      });
      const { bumpEcoPoints, ECO } = await import('@/lib/eco-points');
      void bumpEcoPoints(userId, ECO.CHECK_IN, 'event_check_in', { bookingId }).catch(() => null);
      const { onReferralCheckIn } = await import('@/lib/referrals');
      void onReferralCheckIn(userId, bookingId).catch(() => null);
    }
    return;
  }

  // Организатор без строки участника — всё равно поощряем приход
  if (!participant) {
    await bumpReliability(userId, RELIABILITY.ATTEND_DELTA, { attended: 1 });
    const { bumpEcoPoints, ECO } = await import('@/lib/eco-points');
    void bumpEcoPoints(userId, ECO.CHECK_IN, 'event_check_in', { bookingId }).catch(() => null);
    const { onReferralCheckIn } = await import('@/lib/referrals');
    void onReferralCheckIn(userId, bookingId).catch(() => null);
  }
}

/** Небольшой бонус за активность (запись на мероприятие) */
export async function recordJoinActivity(userId: string) {
  return bumpReliability(userId, RELIABILITY.JOIN_DELTA);
}

/**
 * После окончания мероприятия + grace: участники без check-in → NO_SHOW.
 * Вызывается из cron.
 */
export async function settleNoShows(limit = 80) {
  const cutoff = new Date(Date.now() - RELIABILITY.NO_SHOW_GRACE_HOURS * 3600 * 1000);

  const pending = await prisma.bookingParticipant.findMany({
    where: {
      attendanceStatus: 'PENDING',
      attendanceSettledAt: null,
      booking: {
        status: 'APPROVED',
        endTime: { lte: cutoff },
      },
    },
    select: {
      id: true,
      userId: true,
      bookingId: true,
    },
    take: limit,
  });

  let settled = 0;
  for (const row of pending) {
    const checked = await prisma.ticketCheckIn.findUnique({
      where: {
        bookingId_userId: { bookingId: row.bookingId, userId: row.userId },
      },
      select: { id: true },
    });

    if (checked) {
      await prisma.bookingParticipant.update({
        where: { id: row.id },
        data: { attendanceStatus: 'CHECKED_IN', attendanceSettledAt: new Date() },
      });
      await bumpReliability(row.userId, RELIABILITY.ATTEND_DELTA, { attended: 1 });
      settled += 1;
      continue;
    }

    await prisma.bookingParticipant.update({
      where: { id: row.id },
      data: { attendanceStatus: 'NO_SHOW', attendanceSettledAt: new Date() },
    });
    await bumpReliability(row.userId, RELIABILITY.NO_SHOW_DELTA, { noShow: 1 });
    settled += 1;
  }

  return { examined: pending.length, settled };
}
