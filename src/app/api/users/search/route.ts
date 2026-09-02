import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { resolvePublicIdentity } from '@/lib/privacy-alias';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const me = session?.user?.id;
    if (!me) {
      return NextResponse.json({ message: 'Необходимо авторизоваться' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    if (q.length < 2) {
      return NextResponse.json({ users: [], message: 'Введите минимум 2 символа' });
    }
    if (q.length > 80) {
      return NextResponse.json({ message: 'Слишком длинный запрос' }, { status: 400 });
    }

    const limit = Math.min(20, Math.max(1, Number(searchParams.get('limit') || 12) || 12));

    // Friend ids (accepted) — can search them even if privacy is FRIENDS/PRIVATE
    const friendRows = await prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ requesterId: me }, { addresseeId: me }],
      },
      select: { requesterId: true, addresseeId: true },
    });
    const friendIds = friendRows.map((row) =>
      row.requesterId === me ? row.addresseeId : row.requesterId
    );

    const users = await prisma.user.findMany({
      where: {
        id: { not: me },
        deletedAt: null,
        blockedAt: null,
        name: { contains: q, mode: 'insensitive' },
        OR: [
          { profileVisibility: 'PUBLIC' },
          ...(friendIds.length ? [{ id: { in: friendIds } }] : []),
        ],
      },
      select: {
        id: true,
        name: true,
        image: true,
        city: true,
        profileVisibility: true,
      },
      take: limit,
      orderBy: { name: 'asc' },
    });

    const ids = users.map((u) => u.id);
    const friendships =
      ids.length === 0
        ? []
        : await prisma.friendship.findMany({
            where: {
              OR: [
                { requesterId: me, addresseeId: { in: ids } },
                { addresseeId: me, requesterId: { in: ids } },
              ],
            },
            select: {
              id: true,
              status: true,
              requesterId: true,
              addresseeId: true,
            },
          });

    const byUser = new Map<
      string,
      { friendshipId: string; status: string; direction: 'incoming' | 'outgoing' }
    >();
    for (const row of friendships) {
      const otherId = row.requesterId === me ? row.addresseeId : row.requesterId;
      byUser.set(otherId, {
        friendshipId: row.id,
        status: row.status,
        direction: row.requesterId === me ? 'outgoing' : 'incoming',
      });
    }

    return NextResponse.json({
      users: users.map((user) => {
        const fr = byUser.get(user.id) || null;
        const isFriend = fr?.status === 'ACCEPTED';
        const identity = resolvePublicIdentity({
          target: user,
          viewerId: me,
          isFriend,
        });
        return {
          id: user.id,
          name: identity.name,
          image: identity.image,
          city: !identity.aliased && user.profileVisibility === 'PUBLIC' ? user.city : null,
          aliased: identity.aliased,
          friendship: fr,
        };
      }),
    });
  } catch (error) {
    console.error('GET /api/users/search', error);
    return NextResponse.json({ message: 'Ошибка поиска' }, { status: 500 });
  }
}
