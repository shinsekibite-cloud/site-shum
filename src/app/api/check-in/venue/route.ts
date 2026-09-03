import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { parseVenueCode, parseOrgEntranceCode } from '@/lib/tickets';
import { recordAttendanceCheckIn } from '@/lib/reliability';
import { evaluateAchievements } from '@/lib/award-achievements';
import { createUserNotification, notifyStaffCheckIn } from '@/lib/security';
import { ECO } from '@/lib/eco-points';
import { getTzYmd } from '@/lib/booking-hours';
import {
  pickNearestVenueBooking,
  venuePhaseMessage,
  VENUE_CHECKIN_EARLY_MS,
  VENUE_CHECKIN_LATE_MS,
} from '@/lib/venue-checkin-pick';

/**
 * Self check-in via permanent venue QR or organization entrance QR.
 * Logged-in guest → nearest event today (MSK) among their registrations.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, status: 'AUTH', message: 'Войдите в аккаунт' }, { status: 401 });
    }

    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, email: true, phone: true, image: true, blockedAt: true, ecoPoints: true },
    });
    if (!me || me.blockedAt) {
      return NextResponse.json({ ok: false, status: 'BLOCKED', message: 'Аккаунт недоступен' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    const parsedVenue = parseVenueCode(code);
    const isOrgEntrance = !parsedVenue && parseOrgEntranceCode(code);

    if (!parsedVenue && !isOrgEntrance) {
      return NextResponse.json(
        { ok: false, status: 'INVALID', message: 'Неверный QR-код входа' },
        { status: 400 }
      );
    }

    let space: { id: string; title: string; address: string | null; status: string } | null = null;
    if (parsedVenue) {
      space = await prisma.space.findUnique({
        where: { id: parsedVenue.spaceId },
        select: { id: true, title: true, address: true, status: true },
      });
      if (!space || space.status === 'ARCHIVED') {
        return NextResponse.json(
          { ok: false, status: 'SPACE', message: 'Пространство не найдено' },
          { status: 404 }
        );
      }
    }

    const now = new Date();
    const todayYmd = getTzYmd(now);
    // Окно поиска: с раннего допуска до позднего (сутки ± окна)
    const rangeStart = new Date(now.getTime() - VENUE_CHECKIN_LATE_MS - 24 * 3600 * 1000);
    const rangeEnd = new Date(now.getTime() + VENUE_CHECKIN_EARLY_MS + 24 * 3600 * 1000);

    const bookings = await prisma.booking.findMany({
      where: {
        status: 'APPROVED',
        ...(parsedVenue ? { spaceId: parsedVenue.spaceId } : {}),
        startTime: { lte: rangeEnd },
        endTime: { gte: rangeStart },
        OR: [{ userId: me.id }, { participants: { some: { userId: me.id } } }],
      },
      include: {
        space: { select: { id: true, title: true, address: true } },
        checkIns: { where: { userId: me.id }, select: { id: true, bookingId: true, createdAt: true } },
      },
      orderBy: { startTime: 'asc' },
      take: 40,
    });

    // Только «сегодня» по МСК (старт или конец в этот день)
    const todayBookings = bookings.filter((b) => {
      const s = getTzYmd(b.startTime);
      const e = getTzYmd(b.endTime);
      return s === todayYmd || e === todayYmd;
    });

    const alreadyChecked = new Set(
      todayBookings.filter((b) => b.checkIns.length > 0).map((b) => b.id)
    );

    const picked = pickNearestVenueBooking(todayBookings, now, alreadyChecked);

    if (!picked) {
      const place = isOrgEntrance ? 'организации' : space?.title || 'пространстве';
      if (todayBookings.length > 0 && alreadyChecked.size === todayBookings.length) {
        const last = todayBookings
          .filter((b) => b.checkIns[0])
          .sort(
            (a, b) =>
              (b.checkIns[0]?.createdAt?.getTime() || 0) - (a.checkIns[0]?.createdAt?.getTime() || 0)
          )[0];
        const eventSpace = last?.space || space;
        return NextResponse.json({
          ok: true,
          status: 'ALREADY',
          ticketStatus: 'USED',
          message: 'Вы уже отмечены на все свои мероприятия сегодня',
          ecoEarned: 0,
          checkedAt: last?.checkIns[0]?.createdAt,
          event: last
            ? {
                id: last.id,
                title: last.title,
                startTime: last.startTime,
                endTime: last.endTime,
                space: eventSpace,
              }
            : undefined,
          guest: me,
          phase: 'already_all',
        });
      }

      return NextResponse.json(
        {
          ok: false,
          status: 'NO_BOOKING',
          message: `Нет подходящей записи в ${place} на сейчас. Отметиться можно: за 1 ч до начала, в течение всего мероприятия и ещё 10 мин после. Запишитесь в афише.`,
          space,
        },
        { status: 400 }
      );
    }

    const booking = picked.booking;
    const eventSpace = booking.space || space;

    const existing = booking.checkIns[0];
    if (existing) {
      return NextResponse.json({
        ok: true,
        status: 'ALREADY',
        ticketStatus: 'USED',
        message: 'Билет уже использован — вы отмечены на этом мероприятии',
        ecoEarned: 0,
        checkedAt: existing.createdAt,
        event: {
          id: booking.id,
          title: booking.title,
          startTime: booking.startTime,
          endTime: booking.endTime,
          space: eventSpace,
        },
        guest: me,
        phase: picked.phase,
      });
    }

    const checkIn = await prisma.ticketCheckIn.create({
      data: {
        bookingId: booking.id,
        userId: me.id,
        scannedById: me.id,
        method: isOrgEntrance ? 'ORG_SELF' : 'VENUE_SELF',
      },
    });

    await recordAttendanceCheckIn(booking.id, me.id);
    await evaluateAchievements(me.id).catch(() => null);

    const updatedUser = await prisma.user.findUnique({
      where: { id: me.id },
      select: { ecoPoints: true },
    });

    let message = venuePhaseMessage(picked.phase, booking.title);
    if (picked.otherOpenCount > 0) {
      message += ` Ещё записей сегодня: ${picked.otherOpenCount} — отсканируйте QR снова позже.`;
    }

    await createUserNotification({
      userId: me.id,
      type: 'CHECK_IN',
      title: 'Билет активирован',
      body: `«${booking.title}» · ${eventSpace?.title || 'Вход'}. +${ECO.CHECK_IN} мбаллов.`,
      meta: {
        bookingId: booking.id,
        spaceId: eventSpace?.id,
        checkInId: checkIn.id,
        phase: picked.phase,
        href: '/tickets',
      },
    });

    await notifyStaffCheckIn({
      guestName: me.name || me.phone || me.email || 'Участник',
      eventTitle: booking.title,
      spaceTitle: eventSpace?.title,
      bookingId: booking.id,
      guestId: me.id,
      checkInId: checkIn.id,
    });

    return NextResponse.json({
      ok: true,
      status: 'OK',
      ticketStatus: 'ACTIVATED',
      message,
      ecoEarned: ECO.CHECK_IN,
      ecoPoints: updatedUser?.ecoPoints ?? me.ecoPoints,
      checkedAt: checkIn.createdAt,
      phase: picked.phase,
      otherOpenCount: picked.otherOpenCount,
      event: {
        id: booking.id,
        title: booking.title,
        startTime: booking.startTime,
        endTime: booking.endTime,
        space: eventSpace,
      },
      guest: me,
    });
  } catch (e) {
    console.error('venue check-in', e);
    return NextResponse.json({ message: 'Ошибка сервера' }, { status: 500 });
  }
}
