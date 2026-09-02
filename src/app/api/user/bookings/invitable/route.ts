import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** Upcoming events the current user can invite friends to (organizer or participant). */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ message: 'Необходимо авторизоваться' }, { status: 401 });
    }

    const now = new Date();
    const [organized, participating] = await Promise.all([
      prisma.booking.findMany({
        where: {
          userId,
          status: 'APPROVED',
          endTime: { gt: now },
        },
        select: {
          id: true,
          title: true,
          startTime: true,
          endTime: true,
          space: { select: { title: true } },
        },
        orderBy: { startTime: 'asc' },
        take: 30,
      }),
      prisma.bookingParticipant.findMany({
        where: {
          userId,
          booking: { status: 'APPROVED', endTime: { gt: now } },
        },
        select: {
          booking: {
            select: {
              id: true,
              title: true,
              startTime: true,
              endTime: true,
              space: { select: { title: true } },
            },
          },
        },
        take: 30,
      }),
    ]);

    const byId = new Map<
      string,
      { id: string; title: string; startTime: Date; endTime: Date; spaceTitle: string | null }
    >();
    for (const b of organized) {
      byId.set(b.id, {
        id: b.id,
        title: b.title,
        startTime: b.startTime,
        endTime: b.endTime,
        spaceTitle: b.space?.title || null,
      });
    }
    for (const p of participating) {
      const b = p.booking;
      if (!byId.has(b.id)) {
        byId.set(b.id, {
          id: b.id,
          title: b.title,
          startTime: b.startTime,
          endTime: b.endTime,
          spaceTitle: b.space?.title || null,
        });
      }
    }

    const items = [...byId.values()]
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
      .map((b) => ({
        id: b.id,
        title: b.title,
        startTime: b.startTime.toISOString(),
        endTime: b.endTime.toISOString(),
        spaceTitle: b.spaceTitle,
      }));

    return NextResponse.json({ items });
  } catch (e) {
    console.error('GET /api/user/bookings/invitable', e);
    return NextResponse.json({ message: 'Не удалось загрузить мероприятия' }, { status: 500 });
  }
}
