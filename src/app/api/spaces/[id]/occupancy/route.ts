import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  buildOccupancyWeek,
  buildWeekDayKeys,
  nextFreeWindow,
  parseOpenClose,
} from '@/lib/hall-occupancy';
import { decodeRouteParam } from '@/lib/route-id';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const started = Date.now();
  try {
    const { id: raw } = await ctx.params;
    const id = decodeRouteParam(raw);
    const space = await prisma.space.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        openTime: true,
        closeTime: true,
        slotStepMin: true,
        capacity: true,
        category: true,
        bookingMode: true,
        status: true,
      },
    });
    if (!space || space.status !== 'ACTIVE') {
      return NextResponse.json({ message: 'Площадка не найдена' }, { status: 404 });
    }

    const settings = await prisma.siteSettings.findUnique({
      where: { id: '1' },
      select: { bookingOpenTime: true, bookingCloseTime: true },
    });
    const { openMin, closeMin } = parseOpenClose(
      space.openTime,
      space.closeTime,
      settings?.bookingOpenTime,
      settings?.bookingCloseTime
    );
    const dayKeys = buildWeekDayKeys(new Date(), 7);
    const rangeStart = new Date(`${dayKeys[0]}T00:00:00+03:00`);
    const rangeEnd = new Date(`${dayKeys[dayKeys.length - 1]}T23:59:59+03:00`);

    const [bookings, closures] = await Promise.all([
      prisma.booking.findMany({
        where: {
          spaceId: id,
          status: { in: ['APPROVED', 'PENDING'] },
          startTime: { lt: rangeEnd },
          endTime: { gt: rangeStart },
        },
        select: {
          id: true,
          title: true,
          startTime: true,
          endTime: true,
          status: true,
          contactMode: true,
        },
      }),
      prisma.spaceClosure.findMany({
        where: {
          spaceId: id,
          startTime: { lt: rangeEnd },
          endTime: { gt: rangeStart },
        },
        select: { startTime: true, endTime: true, kind: true, note: true },
      }),
    ]);

    const step = space.slotStepMin === 30 ? 30 : 60;
    const week = buildOccupancyWeek({
      openMin,
      closeMin,
      stepMin: step,
      dayKeys,
      bookings,
      closures,
    });
    const nextFree = nextFreeWindow(week);

    return NextResponse.json({
      spaceId: space.id,
      title: space.title,
      capacity: space.capacity,
      stepMin: step,
      openMin,
      closeMin,
      week,
      nextFree,
      ms: Date.now() - started,
    });
  } catch (e) {
    console.error('[occupancy]', e);
    return NextResponse.json({ message: 'Ошибка сетки занятости' }, { status: 500 });
  }
}
