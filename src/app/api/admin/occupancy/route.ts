import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  buildOccupancyWeek,
  buildWeekDayKeys,
  parseOpenClose,
} from '@/lib/hall-occupancy';
import { getTzYmd, BOOKING_TZ } from '@/lib/booking-hours';
import { assertSameOrigin } from '@/lib/csrf-origin';

export const dynamic = 'force-dynamic';

function canManage(role?: string | null) {
  return role === 'ADMIN' || role === 'MODERATOR' || role === 'SCANNER';
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canManage(session.user.role)) {
    return NextResponse.json({ message: 'Недостаточно прав' }, { status: 403 });
  }

  const url = new URL(req.url);
  const dayKey = url.searchParams.get('day') || getTzYmd(new Date(), BOOKING_TZ);
  const spaces = await prisma.space.findMany({
    where: { status: 'ACTIVE', isDemoData: false },
    orderBy: { title: 'asc' },
    select: {
      id: true,
      title: true,
      category: true,
      capacity: true,
      openTime: true,
      closeTime: true,
      slotStepMin: true,
    },
  });
  const settings = await prisma.siteSettings.findUnique({
    where: { id: '1' },
    select: { bookingOpenTime: true, bookingCloseTime: true },
  });

  const rangeStart = new Date(`${dayKey}T00:00:00+03:00`);
  const rangeEnd = new Date(`${dayKey}T23:59:59+03:00`);
  const spaceIds = spaces.map((s) => s.id);

  const [bookings, closures] = await Promise.all([
    prisma.booking.findMany({
      where: {
        spaceId: { in: spaceIds },
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
        spaceId: { in: spaceIds },
        startTime: { lt: rangeEnd },
        endTime: { gt: rangeStart },
      },
      select: { spaceId: true, startTime: true, endTime: true, kind: true, note: true },
    }),
  ]);

  const halls = spaces.map((space) => {
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
      dayKeys: [dayKey],
      bookings: bookings.filter((b) => b.spaceId === space.id),
      closures: closures.filter((c) => c.spaceId === space.id),
    });
    const slots = week[0]?.slots || [];
    const busy = slots.filter((s) => s.status !== 'free').length;
    return {
      spaceId: space.id,
      title: space.title,
      category: space.category,
      capacity: space.capacity,
      loadPct: slots.length ? Math.round((busy / slots.length) * 100) : 0,
      slots,
    };
  });

  return NextResponse.json({ dayKey, halls });
}

export async function POST(req: Request) {
  const originBlock = assertSameOrigin(req);
  if (originBlock) return originBlock;

  const session = await getServerSession(authOptions);
  if (!session?.user || !canManage(session.user.role)) {
    return NextResponse.json({ message: 'Недостаточно прав' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const spaceId = String(body?.spaceId || '');
  const startTime = body?.startTime ? new Date(body.startTime) : null;
  const endTime = body?.endTime ? new Date(body.endTime) : null;
  const kind = body?.kind === 'CLOSED' ? 'CLOSED' : 'SERVICE';
  const note = String(body?.note || '').slice(0, 200) || null;

  if (!spaceId || !startTime || !endTime || Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    return NextResponse.json({ message: 'Нужны spaceId, startTime, endTime' }, { status: 400 });
  }
  if (endTime <= startTime) {
    return NextResponse.json({ message: 'Конец должен быть позже начала' }, { status: 400 });
  }

  const overlap = await prisma.booking.findFirst({
    where: {
      spaceId,
      status: { in: ['APPROVED', 'PENDING'] },
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
    select: { id: true, title: true },
  });
  if (overlap) {
    return NextResponse.json(
      { message: `Конфликт с бронью «${overlap.title}»`, bookingId: overlap.id },
      { status: 409 }
    );
  }

  const row = await prisma.spaceClosure.create({
    data: {
      spaceId,
      startTime,
      endTime,
      kind,
      note,
      actorId: session.user.id,
    },
  });

  return NextResponse.json({ ok: true, closure: row }, { status: 201 });
}
