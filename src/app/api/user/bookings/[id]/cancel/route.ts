import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AclError, aclJsonError, requireEndUser } from '@/lib/acl';
import { notifyBookingStatus } from '@/lib/notifications';

/**
 * User cancels own space booking (organizer request).
 * PENDING / APPROVED future → REJECTED. Past bookings cannot be cancelled.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireEndUser();
    const { id } = await params;
    const userId = session.user.id;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { space: true },
    });
    if (!booking) {
      return NextResponse.json({ message: 'Бронь не найдена' }, { status: 404 });
    }
    if (booking.userId !== userId) {
      return NextResponse.json({ message: 'Можно отменить только свою бронь' }, { status: 403 });
    }
    if (booking.status === 'REJECTED') {
      return NextResponse.json({ message: 'Бронь уже отменена', booking }, { status: 200 });
    }
    if (booking.endTime.getTime() < Date.now()) {
      return NextResponse.json({ message: 'Нельзя отменить прошедшую бронь' }, { status: 400 });
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: { status: 'REJECTED' },
      include: { space: true },
    });

    if (session.user.email) {
      void notifyBookingStatus({
        to: session.user.email,
        userId,
        bookingId: updated.id,
        title: updated.title,
        spaceTitle: updated.space?.title,
        spaceAddress: updated.space?.address,
        startTime: updated.startTime,
        endTime: updated.endTime,
        status: 'REJECTED',
        rejectReason: 'Отменено вами',
      }).catch(() => null);
    }

    return NextResponse.json(
      { message: 'Бронь отменена', booking: updated },
      { status: 200 }
    );
  } catch (e) {
    if (e instanceof AclError) return aclJsonError(e);
    console.error('cancel booking', e);
    return NextResponse.json({ message: 'Ошибка сервера' }, { status: 500 });
  }
}
