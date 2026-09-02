import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AclError, aclJsonError, requireEndUser } from '@/lib/acl';
import {
  notifyEventJoined,
  notifyWaitlisted,
  promoteFromWaitlist,
} from '@/lib/notifications';
import { promoteToParticipant } from '@/lib/participant';
import { recordJoinActivity } from '@/lib/reliability';
import { evaluateAchievements } from '@/lib/award-achievements';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  try {
    const session = await requireEndUser();
    const bookingId = resolvedParams.id;
    const userId = session.user.id;
    const body = await req.json().catch(() => ({}));
    const wantWaitlist = Boolean(body?.waitlist);

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.bookingParticipant.findUnique({
        where: { bookingId_userId: { bookingId, userId } },
      });

      if (existing) {
        await tx.bookingParticipant.delete({ where: { id: existing.id } });
        return { action: 'left' as const };
      }

      const waitExisting = await tx.bookingWaitlist.findUnique({
        where: { bookingId_userId: { bookingId, userId } },
      });
      if (waitExisting && !wantWaitlist) {
        await tx.bookingWaitlist.delete({ where: { id: waitExisting.id } });
        return { action: 'waitlist_left' as const };
      }

      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          space: true,
          _count: { select: { participants: true } },
        },
      });

      if (!booking) throw new Error('NOT_FOUND');
      if (booking.status !== 'APPROVED') throw new Error('NOT_APPROVED');
      if (booking.endTime.getTime() < Date.now()) throw new Error('ENDED');
      if (booking.space?.status === 'INACTIVE' || booking.space?.status === 'COMPLETED') {
        throw new Error('SPACE_UNAVAILABLE');
      }
      if (booking.userId === userId) throw new Error('ORGANIZER');

      const capacity = booking.space?.capacity || 0;
      const taken = booking._count.participants;

      if (taken >= capacity) {
        if (waitExisting) {
          return { action: 'waitlisted' as const, booking };
        }
        if (wantWaitlist) {
          await tx.bookingWaitlist.create({
            data: { bookingId, userId },
          });
          return { action: 'waitlisted' as const, booking };
        }
        throw new Error('FULL');
      }

      if (waitExisting) {
        await tx.bookingWaitlist.delete({ where: { id: waitExisting.id } });
      }

      await tx.bookingParticipant.create({
        data: { bookingId, userId },
      });
      return { action: 'joined' as const, booking };
    });

    if (result.action === 'left') {
      // Waitlist promotion + email must not block the UI response
      void promoteFromWaitlist(bookingId).catch(() => null);
      return NextResponse.json({ message: 'Вы отменили участие', joined: false }, { status: 200 });
    }

    if (result.action === 'waitlist_left') {
      return NextResponse.json({ message: 'Вы покинули лист ожидания', joined: false, waitlisted: false }, { status: 200 });
    }

    if (result.action === 'waitlisted') {
      if (session.user.email && result.booking) {
        void notifyWaitlisted({
          to: session.user.email,
          title: result.booking.title,
          startTime: result.booking.startTime,
        }).catch(() => null);
      }
      return NextResponse.json(
        { message: 'Мест нет — вы добавлены в лист ожидания', joined: false, waitlisted: true },
        { status: 200 }
      );
    }

    // Respond immediately — email / achievements often take several seconds on SMTP
    const booking = result.booking;
    void (async () => {
      try {
        await prisma.bookingInvite.updateMany({
          where: { bookingId, toUserId: userId, status: 'SENT' },
          data: { status: 'JOINED' },
        });
        await promoteToParticipant(userId);
        await recordJoinActivity(userId).catch(() => null);
        {
          const { bumpEcoPoints, ECO } = await import('@/lib/eco-points');
          await bumpEcoPoints(userId, ECO.JOIN_EVENT, 'join_event', { bookingId }).catch(() => null);
        }
        await evaluateAchievements(userId).catch(() => null);
        if (booking) {
          await notifyEventJoined({
            to: session.user.email || '',
            userId,
            organizerId: booking.userId,
            joinerName: session.user.name || session.user.email || 'Участник',
            bookingId,
            title: booking.title,
            spaceTitle: booking.space?.title,
            spaceAddress: booking.space?.address,
            startTime: booking.startTime,
            endTime: booking.endTime,
          }).catch(() => null);
        }
      } catch (e) {
        console.error('[join] background side-effects', e);
      }
    })();

    return NextResponse.json({ message: 'Вы успешно присоединились', joined: true, waitlisted: false }, { status: 200 });
  } catch (error: any) {
    if (error instanceof AclError) return aclJsonError(error);
    const map: Record<string, [number, string]> = {
      NOT_FOUND: [404, 'Мероприятие не найдено'],
      NOT_APPROVED: [400, 'Мероприятие ещё не подтверждено'],
      ENDED: [400, 'Мероприятие уже завершено'],
      SPACE_UNAVAILABLE: [400, 'Площадка недоступна'],
      ORGANIZER: [400, 'Вы организатор этого мероприятия'],
      FULL: [400, 'К сожалению, все места уже заняты'],
    };
    if (error?.message && map[error.message]) {
      const [status, message] = map[error.message];
      return NextResponse.json({ message, full: error.message === 'FULL' }, { status });
    }
    // Unique constraint race
    if (String(error?.code) === 'P2002') {
      return NextResponse.json({ message: 'Вы уже записаны', joined: true }, { status: 200 });
    }
    console.error('Ошибка присоединения к мероприятию:', error);
    return NextResponse.json({ message: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
