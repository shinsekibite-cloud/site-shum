import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/csrf-origin';
import { prisma } from '@/lib/prisma';
import { maskDisplayName, resolvePresenceToken } from '@/lib/presence-qr';
import { awardCheckInScores, isEcoTagged } from '@/lib/score-scales';
import { todayKey, occupiedSeatStatuses } from '@/lib/coworking';
import { getTzYmd, BOOKING_TZ } from '@/lib/booking-hours';
import { canUseScanner } from '@/lib/acl';

export const dynamic = 'force-dynamic';

function staffOk(role?: string | null, permissions?: string | null) {
  return canUseScanner(role, permissions);
}

export async function POST(req: Request) {
  const originBlock = assertSameOrigin(req);
  if (originBlock) return originBlock;

  const session = await getServerSession(authOptions);
  if (!session?.user || !staffOk(session.user.role, session.user.permissions)) {
    return NextResponse.json({ message: 'Нужны права сканера' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const raw = String(body?.token || body?.code || '');
  const spaceId = body?.spaceId ? String(body.spaceId) : null;
  const walkIn = Boolean(body?.walkIn);

  const resolved = await resolvePresenceToken(raw);
  if (!resolved.ok) {
    return NextResponse.json(
      { ok: false, code: resolved.code, message: resolved.message },
      { status: resolved.code === 'EXPIRED' ? 410 : 400 }
    );
  }

  const user = resolved.user;
  const dayKey = todayKey();

  const coworking = await prisma.coworkingSignup.findFirst({
    where: {
      userId: user.id,
      dayKey,
      status: { in: [...occupiedSeatStatuses()] },
      ...(spaceId ? { spaceId } : {}),
      startTime: { lte: new Date(Date.now() + 30 * 60000) },
      endTime: { gte: new Date(Date.now() - 30 * 60000) },
    },
    include: { space: { select: { id: true, title: true } } },
    orderBy: { startTime: 'asc' },
  });

  const bookingPart = await prisma.bookingParticipant.findFirst({
    where: {
      userId: user.id,
      attendanceStatus: { in: ['PENDING', 'CHECKED_IN'] },
      booking: {
        status: 'APPROVED',
        startTime: { lte: new Date(Date.now() + 2 * 3600000) },
        endTime: { gte: new Date(Date.now() - 30 * 60000) },
        ...(spaceId ? { spaceId } : {}),
      },
    },
    include: {
      booking: {
        select: {
          id: true,
          title: true,
          category: true,
          spaceId: true,
          space: { select: { id: true, title: true } },
        },
      },
    },
  });

  if (!coworking && !bookingPart && !walkIn) {
    return NextResponse.json({
      ok: false,
      code: 'NO_RESERVATION',
      message: 'Нет записи на сегодня. Можно оформить walk-in, если есть места.',
      user: {
        id: user.id,
        displayName: maskDisplayName(user.name),
        publicCode: user.publicCode,
        image: user.image,
        mBall: user.mBall,
        ecoBall: user.ecoBall,
      },
      canWalkIn: Boolean(spaceId),
    }, { status: 409 });
  }

  const slotKey = coworking
    ? `cw:${coworking.id}`
    : bookingPart
      ? `bk:${bookingPart.bookingId}`
      : `wi:${spaceId || 'any'}:${dayKey}`;

  const existing = await prisma.presenceCheckIn.findUnique({
    where: {
      userId_dayKey_slotKey: { userId: user.id, dayKey, slotKey },
    },
  });
  if (existing) {
    return NextResponse.json({
      ok: true,
      already: true,
      message: 'Уже отмечен',
      user: {
        id: user.id,
        displayName: maskDisplayName(user.name),
        publicCode: user.publicCode,
        image: user.image,
      },
      checkInId: existing.id,
    });
  }

  let ecoTagged = false;
  if (bookingPart?.booking) {
    ecoTagged = isEcoTagged(null, bookingPart.booking.category);
  }

  const scores = await awardCheckInScores({
    userId: user.id,
    bookingId: bookingPart?.bookingId,
    ecoTagged,
    source: coworking ? 'coworking' : bookingPart ? 'booking' : 'walk-in',
  });

  const checkIn = await prisma.presenceCheckIn.create({
    data: {
      userId: user.id,
      scannedById: session.user.id,
      spaceId: coworking?.spaceId || bookingPart?.booking.spaceId || spaceId,
      coworkingSignupId: coworking?.id,
      bookingId: bookingPart?.bookingId,
      dayKey,
      slotKey,
      mBallDelta: scores.mBall?.delta ?? 0,
      ecoBallDelta: scores.ecoBall?.delta ?? 0,
      metaJson: JSON.stringify({ walkIn }),
    },
  });

  if (coworking) {
    await prisma.coworkingSignup.update({
      where: { id: coworking.id },
      data: { status: 'ATTENDED' },
    });
  }
  if (bookingPart && bookingPart.attendanceStatus !== 'CHECKED_IN') {
    await prisma.bookingParticipant.update({
      where: { id: bookingPart.id },
      data: { attendanceStatus: 'CHECKED_IN', attendanceSettledAt: new Date() },
    });
  }

  return NextResponse.json({
    ok: true,
    already: false,
    message: 'Чек-ин принят',
    checkInId: checkIn.id,
    scores: {
      mBall: scores.mBall?.delta ?? 0,
      ecoBall: scores.ecoBall?.delta ?? 0,
    },
    context: {
      coworking: coworking
        ? { id: coworking.id, space: coworking.space.title, period: coworking.period }
        : null,
      booking: bookingPart
        ? { id: bookingPart.bookingId, title: bookingPart.booking.title, space: bookingPart.booking.space.title }
        : null,
      walkIn,
    },
    user: {
      id: user.id,
      displayName: maskDisplayName(user.name),
      publicCode: user.publicCode,
      image: user.image,
      mBall: (user.mBall || 0) + (scores.mBall?.delta ?? 0),
      ecoBall: (user.ecoBall || 0) + (scores.ecoBall?.delta ?? 0),
    },
    dayKey: getTzYmd(new Date(), BOOKING_TZ),
  });
}
