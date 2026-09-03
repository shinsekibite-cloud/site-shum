/**
 * Space IDs with a free hall slot remaining today (MSK).
 * Shared by home «Сейчас свободно» CTA → /spaces?filter=free_today.
 */
import { prisma } from '@/lib/prisma';
import { getTzYmd } from '@/lib/booking-hours';
import {
  buildOccupancyWeek,
  buildWeekDayKeys,
  nextFreeWindow,
  parseOpenClose,
} from '@/lib/hall-occupancy';
import { isNextBuildPhase } from '@/lib/build-phase';

export async function getFreeTodaySpaceIds(limit = 80): Promise<string[]> {
  if (isNextBuildPhase()) return [];

  const now = new Date();
  const todayKey = getTzYmd(now);
  const spaces = await prisma.space.findMany({
    where: { status: 'ACTIVE', isDemoData: false },
    orderBy: { updatedAt: 'desc' },
    take: Math.max(limit * 2, 24),
    select: {
      id: true,
      openTime: true,
      closeTime: true,
      slotStepMin: true,
    },
  });
  if (!spaces.length) return [];

  const settings = await prisma.siteSettings.findUnique({
    where: { id: '1' },
    select: { bookingOpenTime: true, bookingCloseTime: true },
  });
  const dayKeys = buildWeekDayKeys(now, 1);
  const rangeStart = new Date(`${dayKeys[0]}T00:00:00+03:00`);
  const rangeEnd = new Date(`${dayKeys[dayKeys.length - 1]}T23:59:59+03:00`);
  const ids = spaces.map((s) => s.id);

  const [bookings, closures] = await Promise.all([
    prisma.booking.findMany({
      where: {
        spaceId: { in: ids },
        status: { in: ['APPROVED', 'PENDING'] },
        startTime: { lt: rangeEnd },
        endTime: { gt: rangeStart },
      },
      select: {
        id: true,
        spaceId: true,
        title: true,
        startTime: true,
        endTime: true,
        status: true,
        contactMode: true,
      },
    }),
    prisma.spaceClosure.findMany({
      where: {
        spaceId: { in: ids },
        startTime: { lt: rangeEnd },
        endTime: { gt: rangeStart },
      },
      select: { spaceId: true, startTime: true, endTime: true, kind: true, note: true },
    }),
  ]);

  const free: string[] = [];
  for (const space of spaces) {
    const { openMin, closeMin } = parseOpenClose(
      space.openTime,
      space.closeTime,
      settings?.bookingOpenTime,
      settings?.bookingCloseTime
    );
    const week = buildOccupancyWeek({
      openMin,
      closeMin,
      stepMin: space.slotStepMin === 30 ? 30 : 60,
      dayKeys,
      bookings: bookings.filter((b) => b.spaceId === space.id),
      closures: closures.filter((c) => c.spaceId === space.id),
    });
    const next = nextFreeWindow(week, now);
    if (next && next.dayKey === todayKey) {
      free.push(space.id);
      if (free.length >= limit) break;
    }
  }
  return free;
}
