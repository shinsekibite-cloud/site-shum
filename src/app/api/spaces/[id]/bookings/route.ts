import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { resolvePublicIdentity } from '@/lib/privacy-alias';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    const isStaff =
      session?.user?.role === 'ADMIN' ||
      session?.user?.role === 'MODERATOR' ||
      session?.user?.role === 'SCANNER';

    const bookings = await prisma.booking.findMany({
      where: {
        spaceId: resolvedParams.id,
        status: {
          in: ['PENDING', 'APPROVED'],
        },
        endTime: {
          gte: new Date(),
        },
      },
      select: {
        id: true,
        title: true,
        description: true,
        startTime: true,
        endTime: true,
        status: true,
        user: { select: { id: true, name: true, image: true, profileVisibility: true } },
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
        isFriend: friendIds.has(b.user.id),
        isStaff,
      });
      return {
        id: b.id,
        title: b.title,
        description: b.description,
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
        user: { name: identity.name },
        participantsCount: b._count?.participants ?? 0,
        joinedByMe: Boolean(userId && Array.isArray(b.participants) && b.participants.length > 0),
      };
    });

    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    console.error('Ошибка при получении бронирований:', error);
    return NextResponse.json({ message: 'Ошибка сервера' }, { status: 500 });
  }
}
