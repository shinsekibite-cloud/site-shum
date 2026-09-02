import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { resolvePublicIdentity } from '@/lib/privacy-alias';

export async function GET(req: Request) {
  try {
    const settings = await prisma.siteSettings.findUnique({
      where: { id: '1' },
      select: { publicEventsVisibility: true },
    });

    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    const isStaff =
      session?.user?.role === 'ADMIN' ||
      session?.user?.role === 'MODERATOR' ||
      session?.user?.role === 'SCANNER';

    if (!settings?.publicEventsVisibility && !session?.user && !isStaff) {
      return NextResponse.json({ message: 'Афиша доступна только авторизованным' }, { status: 401 });
    }

    const url = new URL(req.url);
    const fromParam = url.searchParams.get('from');
    const toParam = url.searchParams.get('to');
    const now = new Date();
    const from = fromParam ? new Date(fromParam) : new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    const to = toParam ? new Date(toParam) : new Date(now.getTime() + 120 * 24 * 3600 * 1000);
    const rangeStart = Number.isFinite(from.getTime()) ? from : new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    const rangeEnd = Number.isFinite(to.getTime()) ? to : new Date(now.getTime() + 120 * 24 * 3600 * 1000);

    const bookings = await prisma.booking.findMany({
      where: {
        status: 'APPROVED',
        startTime: { gte: rangeStart, lte: rangeEnd },
      },
      include: {
        user: { select: { id: true, name: true, image: true, profileVisibility: true } },
        space: {
          select: { id: true, title: true, address: true, capacity: true },
        },
        _count: { select: { participants: true } },
        ...(userId
          ? {
              participants: {
                where: { userId },
                select: { id: true },
              },
            }
          : {}),
      },
      orderBy: { startTime: 'asc' },
      take: 500,
    });

    const friendIds = new Set<string>();
    if (userId) {
      const friendships = await prisma.friendship.findMany({
        where: {
          status: 'ACCEPTED',
          OR: [{ requesterId: userId }, { addresseeId: userId }],
        },
        select: { requesterId: true, addresseeId: true },
      });
      for (const f of friendships) {
        friendIds.add(f.requesterId === userId ? f.addresseeId : f.requesterId);
      }
    }

    const payload = bookings.map((b) => {
      const identity = resolvePublicIdentity({
        target: b.user,
        viewerId: userId,
        isFriend: b.user?.id ? friendIds.has(b.user.id) : false,
        isStaff,
      });
      return {
        id: b.id,
        title: b.title,
        description: b.description,
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
        space: b.space,
        user: { name: identity.name },
        organizerName: identity.name,
        participantsCount: b._count.participants,
        joinedByMe: Boolean(userId && Array.isArray(b.participants) && b.participants.length > 0),
      };
    });

    return NextResponse.json(payload);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}
