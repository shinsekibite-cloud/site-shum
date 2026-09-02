import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { assertSameOrigin } from '@/lib/csrf-origin';
import {
  activeSignupStatuses,
  canCancelFree,
  COWORKING_PERIODS,
  isCoworkingSpace,
  occupiedSeatStatuses,
  periodBounds,
  todayKey,
} from '@/lib/coworking';
import { adjustScore, M_BALL } from '@/lib/score-scales';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mine = url.searchParams.get('mine') === '1';
  const spaceId = url.searchParams.get('spaceId') || undefined;
  const dayKey = url.searchParams.get('day') || todayKey();

  if (mine) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: 'Нужна авторизация' }, { status: 401 });
    }
    const rows = await prisma.coworkingSignup.findMany({
      where: {
        userId: session.user.id,
        status: { in: [...activeSignupStatuses(), 'ATTENDED'] },
        endTime: { gte: new Date(Date.now() - 2 * 86400000) },
      },
      orderBy: { startTime: 'asc' },
      include: { space: { select: { id: true, title: true, address: true, image: true, capacity: true } } },
      take: 40,
    });
    return NextResponse.json({ signups: rows });
  }

  const spaces = await prisma.space.findMany({
    where: {
      status: 'ACTIVE',
      isDemoData: false,
      ...(spaceId ? { id: spaceId } : {}),
    },
    orderBy: { title: 'asc' },
  });
  const coworking = spaces.filter((s) => isCoworkingSpace(s));

  const signups = await prisma.coworkingSignup.findMany({
    where: {
      spaceId: { in: coworking.map((s) => s.id) },
      dayKey,
      status: { in: [...occupiedSeatStatuses(), 'WAITLIST'] },
    },
    select: { spaceId: true, period: true, seats: true, status: true },
  });

  const occupied = new Set<string>(occupiedSeatStatuses());
  const availability = coworking.map((space) => {
    const periods = COWORKING_PERIODS.map((p) => {
      const used = signups
        .filter((s) => s.spaceId === space.id && s.period === p.id && occupied.has(s.status))
        .reduce((acc, s) => acc + s.seats, 0);
      const wait = signups
        .filter((s) => s.spaceId === space.id && s.period === p.id && s.status === 'WAITLIST')
        .reduce((acc, s) => acc + s.seats, 0);
      const left = Math.max(0, space.capacity - used);
      return { ...p, used, wait, left };
    });
    return {
      id: space.id,
      title: space.title,
      address: space.address,
      capacity: space.capacity,
      image: space.image,
      category: space.category,
      periods,
    };
  });

  return NextResponse.json({ dayKey, spaces: availability });
}

export async function POST(req: Request) {
  const originBlock = assertSameOrigin(req);
  if (originBlock) return originBlock;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: 'Нужна авторизация' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const spaceId = String(body?.spaceId || '');
  const dayKey = String(body?.dayKey || todayKey());
  const period = String(body?.period || 'DAY');
  const seats = Math.min(5, Math.max(1, Number(body?.seats) || 1));
  const purpose = body?.purpose ? String(body.purpose).slice(0, 80) : null;
  const waitlist = Boolean(body?.waitlist);

  if (!spaceId || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    return NextResponse.json({ message: 'Укажите площадку и дату' }, { status: 400 });
  }
  if (!COWORKING_PERIODS.some((p) => p.id === period)) {
    return NextResponse.json({ message: 'Неверный интервал' }, { status: 400 });
  }

  const space = await prisma.space.findUnique({ where: { id: spaceId } });
  if (!space || space.status !== 'ACTIVE' || !isCoworkingSpace(space)) {
    return NextResponse.json({ message: 'Коворкинг не найден' }, { status: 404 });
  }

  const { start, end } = periodBounds(dayKey, period);
  if (end.getTime() < Date.now()) {
    return NextResponse.json({ message: 'Этот интервал уже прошёл' }, { status: 400 });
  }

  const overlap = await prisma.coworkingSignup.findFirst({
    where: {
      userId: session.user.id,
      status: { in: [...activeSignupStatuses()] },
      startTime: { lt: end },
      endTime: { gt: start },
    },
  });
  if (overlap) {
    return NextResponse.json({ message: 'У вас уже есть запись на это время' }, { status: 409 });
  }

  const usedAgg = await prisma.coworkingSignup.findMany({
    where: {
      spaceId,
      dayKey,
      period,
      status: { in: [...occupiedSeatStatuses()] },
    },
    select: { seats: true },
  });
  const used = usedAgg.reduce((a, s) => a + s.seats, 0);
  const left = space.capacity - used;

  if (left < seats) {
    if (!waitlist && left <= 0) {
      return NextResponse.json(
        { message: 'Мест нет', left: 0, canWaitlist: true },
        { status: 409 }
      );
    }
    if (!waitlist) {
      return NextResponse.json({ message: `Осталось мест: ${Math.max(0, left)}`, left }, { status: 409 });
    }
  }

  const status = left < seats ? 'WAITLIST' : 'CONFIRMED';
  const row = await prisma.coworkingSignup.create({
    data: {
      spaceId,
      userId: session.user.id,
      dayKey,
      period,
      startTime: start,
      endTime: end,
      seats,
      purpose,
      status,
    },
    include: { space: { select: { id: true, title: true, address: true } } },
  });

  return NextResponse.json({ ok: true, signup: row }, { status: 201 });
}

export async function DELETE(req: Request) {
  const originBlock = assertSameOrigin(req);
  if (originBlock) return originBlock;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: 'Нужна авторизация' }, { status: 401 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get('id') || '';
  if (!id) return NextResponse.json({ message: 'Нет id' }, { status: 400 });

  const row = await prisma.coworkingSignup.findUnique({ where: { id } });
  if (!row || row.userId !== session.user.id) {
    return NextResponse.json({ message: 'Запись не найдена' }, { status: 404 });
  }
  if (!['PENDING', 'CONFIRMED', 'WAITLIST'].includes(row.status)) {
    return NextResponse.json({ message: 'Запись нельзя отменить' }, { status: 400 });
  }

  const free = canCancelFree(row.startTime);
  await prisma.coworkingSignup.update({
    where: { id },
    data: { status: free ? 'CANCELLED' : 'NO_SHOW' },
  });

  if (!free) {
    await adjustScore({
      userId: session.user.id,
      scale: 'M_BALL',
      delta: M_BALL.BOOKING_NO_SHOW,
      reason: 'Неявка / поздняя отмена коворкинга',
      meta: { coworkingSignupId: id },
    });
  }

  return NextResponse.json({ ok: true, late: !free });
}
