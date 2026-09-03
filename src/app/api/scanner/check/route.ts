import { rejectIfModuleDisabled } from '@/lib/require-module';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { parseTicketCode } from '@/lib/tickets';
import { canUseScanner } from '@/lib/acl';
import { recordAttendanceCheckIn } from '@/lib/reliability';
import { evaluateAchievements } from '@/lib/award-achievements';

export async function POST(req: Request) {
  {
    const blocked = await rejectIfModuleDisabled('tickets_scan');
    if (blocked) return blocked;
  }
  try {
    const session = await getServerSession(authOptions);
    const role = session?.user?.role;
    if (!session?.user?.id || !canUseScanner(role, session.user.permissions)) {
      return NextResponse.json({ message: 'Доступ только для сервисного сканера' }, { status: 403 });
    }

    const body = await req.json();
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    const method = body.method === 'MANUAL' ? 'MANUAL' : 'QR';
    const expectedBookingId =
      typeof body.bookingId === 'string' && body.bookingId.trim() ? body.bookingId.trim() : null;

    const parsed = parseTicketCode(code);
    if (!parsed) {
      return NextResponse.json({
        ok: false,
        status: 'INVALID',
        message: 'Неверный формат QR. Ожидается билет участника.',
      }, { status: 400 });
    }

    const { bookingId, userId } = parsed;

    if (expectedBookingId && expectedBookingId !== bookingId) {
      return NextResponse.json({
        ok: false,
        status: 'WRONG_EVENT',
        message: 'Билет от другого мероприятия',
      }, { status: 400 });
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        space: { select: { id: true, title: true, address: true } },
        user: { select: { id: true, name: true } },
        participants: { where: { userId }, select: { id: true } },
      },
    });

    if (!booking) {
      return NextResponse.json({
        ok: false,
        status: 'NOT_FOUND',
        message: 'Мероприятие не найдено',
      }, { status: 404 });
    }

    if (booking.status !== 'APPROVED') {
      return NextResponse.json({
        ok: false,
        status: 'NOT_APPROVED',
        message: 'Мероприятие ещё не подтверждено',
        event: { title: booking.title, space: booking.space?.title },
      }, { status: 400 });
    }

    const holder = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, phone: true, image: true },
    });

    if (!holder) {
      return NextResponse.json({
        ok: false,
        status: 'USER_NOT_FOUND',
        message: 'Участник не найден',
      }, { status: 404 });
    }

    const isOrganizer = booking.userId === userId;
    const isParticipant = booking.participants.length > 0;
    if (!isOrganizer && !isParticipant) {
      return NextResponse.json({
        ok: false,
        status: 'NOT_REGISTERED',
        message: 'Гость не записан на это мероприятие',
        event: { title: booking.title, space: booking.space?.title },
        guest: { name: holder.name, phone: holder.phone },
      }, { status: 400 });
    }

    const existing = await prisma.ticketCheckIn.findUnique({
      where: { bookingId_userId: { bookingId, userId } },
    });

    if (existing) {
      return NextResponse.json({
        ok: false,
        status: 'ALREADY_CHECKED',
        message: 'Билет уже был проверен ранее',
        checkedAt: existing.createdAt,
        event: {
          id: booking.id,
          title: booking.title,
          startTime: booking.startTime,
          endTime: booking.endTime,
          space: booking.space,
        },
        guest: holder,
      }, { status: 409 });
    }

    const checkIn = await prisma.ticketCheckIn.create({
      data: {
        bookingId,
        userId,
        scannedById: session.user.id,
        method,
      },
    });

    await recordAttendanceCheckIn(bookingId, userId);
    await evaluateAchievements(userId).catch(() => null);

    const checkedCount = await prisma.ticketCheckIn.count({ where: { bookingId } });
    const registeredCount =
      (await prisma.bookingParticipant.count({ where: { bookingId } })) + 1; // + organizer

    const { notifyStaffCheckIn } = await import('@/lib/security');
    await notifyStaffCheckIn({
      guestName: holder.name || holder.phone || holder.email || 'Участник',
      eventTitle: booking.title,
      spaceTitle: booking.space?.title,
      bookingId,
      guestId: userId,
      checkInId: checkIn.id,
    }).catch(() => null);

    return NextResponse.json({
      ok: true,
      status: 'OK',
      message: 'Проход разрешён',
      checkInId: checkIn.id,
      checkedAt: checkIn.createdAt,
      event: {
        id: booking.id,
        title: booking.title,
        startTime: booking.startTime,
        endTime: booking.endTime,
        space: booking.space,
      },
      guest: holder,
      stats: { checkedCount, registeredCount },
    });
  } catch (e) {
    console.error('scanner check error', e);
    return NextResponse.json({ message: 'Ошибка сервера' }, { status: 500 });
  }
}

/** Live session stats for scanner UI */
export async function GET(req: Request) {
  {
    const blocked = await rejectIfModuleDisabled('tickets_scan');
    if (blocked) return blocked;
  }
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !canUseScanner(session.user.role, session.user.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const bookingId = searchParams.get('bookingId');
    const since = new Date(Date.now() - 12 * 60 * 60 * 1000);

    const recent = await prisma.ticketCheckIn.findMany({
      where: {
        createdAt: { gte: since },
        ...(bookingId ? { bookingId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
      include: {
        user: { select: { name: true, phone: true } },
        booking: { select: { id: true, title: true, space: { select: { title: true } } } },
      },
    });

    const todayCount = await prisma.ticketCheckIn.count({
      where: {
        createdAt: { gte: since },
        ...(bookingId ? { bookingId } : {}),
      },
    });

    const byMethod = await prisma.ticketCheckIn.groupBy({
      by: ['method'],
      where: {
        createdAt: { gte: since },
        ...(bookingId ? { bookingId } : {}),
      },
      _count: { _all: true },
    });

    let eventStats: { checkedCount: number; registeredCount: number } | null = null;
    if (bookingId) {
      const checkedCount = await prisma.ticketCheckIn.count({ where: { bookingId } });
      const registeredCount =
        (await prisma.bookingParticipant.count({ where: { bookingId } })) + 1;
      eventStats = { checkedCount, registeredCount };
    }

    return NextResponse.json({
      todayCount,
      recent: recent.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        method: r.method,
        scannedById: r.scannedById,
        user: r.user,
        booking: r.booking,
      })),
      byMethod: Object.fromEntries(byMethod.map((m) => [m.method, m._count._all])),
      eventStats,
      serverTime: new Date().toISOString(),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ message: 'Ошибка' }, { status: 500 });
  }
}
