import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { computeTrustScore } from '@/lib/social';
import { evaluateAchievements } from '@/lib/award-achievements';
import { friendRequestHourLimiter, rateLimitJson } from '@/lib/rateLimit';
import { resolvePublicIdentity } from '@/lib/privacy-alias';
import { resolvePresenceForViewer } from '@/lib/presence';
import { assertSameOrigin } from '@/lib/csrf-origin';

const personSelect = {
  id: true,
  name: true,
  image: true,
  profileVisibility: true,
  lastActiveAt: true,
  onlineVisibility: true,
} as const;

function unauthorized() {
  return NextResponse.json({ message: 'Необходимо авторизоваться' }, { status: 401 });
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const me = session?.user?.id;
    if (!me) return unauthorized();

    const rows = await prisma.friendship.findMany({
      where: {
        OR: [{ requesterId: me }, { addresseeId: me }],
        status: { in: ['PENDING', 'ACCEPTED'] },
      },
      select: {
        id: true,
        requesterId: true,
        addresseeId: true,
        status: true,
        createdAt: true,
        requester: { select: personSelect },
        addressee: { select: personSelect },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const accepted = rows.filter((row) => row.status === 'ACCEPTED');
    const friends = await Promise.all(
      accepted.map(async (row) => {
        const user = row.requesterId === me ? row.addressee : row.requester;
        const { lastActiveAt, onlineVisibility, ...publicUser } = user;
        const [trust, presence] = await Promise.all([
          computeTrustScore(me, user.id),
          resolvePresenceForViewer({
            viewerId: me,
            targetId: user.id,
            targetLastActiveAt: lastActiveAt,
            targetOnlineVisibility: onlineVisibility,
            targetProfileVisibility: user.profileVisibility,
            isFriend: true,
          }),
        ]);
        return {
          friendshipId: row.id,
          ...publicUser,
          trust,
          presence,
        };
      })
    );

    const requestCard = (
      row: (typeof rows)[number],
      user: (typeof rows)[number]['requester']
    ) => {
      // Pending: not friends yet — hide real name/avatar for closed profiles
      const identity = resolvePublicIdentity({
        target: user,
        viewerId: me,
        isFriend: false,
      });
      return {
        friendshipId: row.id,
        id: identity.id,
        name: identity.name,
        image: identity.image,
        aliased: identity.aliased,
        createdAt: row.createdAt,
      };
    };

    const incoming = rows
      .filter((row) => row.status === 'PENDING' && row.addresseeId === me)
      .map((row) => requestCard(row, row.requester));
    const outgoing = rows
      .filter((row) => row.status === 'PENDING' && row.requesterId === me)
      .map((row) => requestCard(row, row.addressee));

    return NextResponse.json({ friends, incoming, outgoing });
  } catch (error) {
    console.error('GET /api/friends', error);
    return NextResponse.json({ message: 'Ошибка загрузки друзей' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const csrf = assertSameOrigin(req);
    if (csrf) return csrf;
    const session = await getServerSession(authOptions);
    const me = session?.user?.id;
    if (!me) return unauthorized();

    const { userFriendRequestLimitMultiplier, boostedMax } = await import('@/lib/activity-limits');
    const frMax = boostedMax(15, await userFriendRequestLimitMultiplier(me));

    if (!await friendRequestHourLimiter.checkAsync(`fr:${me}`, frMax)) {
      return NextResponse.json(
        rateLimitJson(`Слишком много заявок в друзья. Лимит: ${frMax} в час.`),
        { status: 429 }
      );
    }

    const payload = await req.json().catch(() => ({}));
    const userId = typeof payload.userId === 'string' ? payload.userId.trim() : '';
    const invite =
      typeof payload.invite === 'string'
        ? payload.invite.trim()
        : typeof payload.inviteToken === 'string'
          ? payload.inviteToken.trim()
          : '';
    if (!userId) {
      return NextResponse.json({ message: 'Укажите пользователя' }, { status: 400 });
    }
    if (userId === me) {
      return NextResponse.json({ message: 'Нельзя добавить себя в друзья' }, { status: 400 });
    }

    const [target, duplicate, requester] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          deletedAt: true,
          blockedAt: true,
          profileVisibility: true,
          friendInviteToken: true,
        },
      }),
      prisma.friendship.findFirst({
        where: {
          OR: [
            { requesterId: me, addresseeId: userId },
            { requesterId: userId, addresseeId: me },
          ],
        },
        select: { id: true, status: true },
      }),
      prisma.user.findUnique({
        where: { id: me },
        select: { name: true },
      }),
    ]);

    if (!target || target.deletedAt) {
      return NextResponse.json({ message: 'Пользователь не найден' }, { status: 404 });
    }
    if (target.blockedAt) {
      return NextResponse.json({ message: 'Пользователь недоступен' }, { status: 403 });
    }
    if (target.profileVisibility === 'PRIVATE') {
      const ok = Boolean(invite && target.friendInviteToken && invite === target.friendInviteToken);
      if (!ok) {
        return NextResponse.json(
          {
            message:
              'Профиль закрыт. Добавить в друзья можно только по персональной ссылке-приглашению.',
            inviteRequired: true,
          },
          { status: 403 }
        );
      }
    }
    if (duplicate) {
      return NextResponse.json(
        { message: 'Заявка или дружба уже существует', friendshipId: duplicate.id, status: duplicate.status },
        { status: 409 }
      );
    }

    const friendship = await prisma.$transaction(async (tx) => {
      const created = await tx.friendship.create({
        data: { requesterId: me, addresseeId: userId, status: 'PENDING' },
        select: { id: true, status: true, createdAt: true },
      });
      await tx.userNotification.create({
        data: {
          userId,
          type: 'FRIEND_REQUEST',
          title: 'Новая заявка в друзья',
          body: `${requester?.name || 'Пользователь'} хочет добавить вас в друзья`,
          meta: JSON.stringify({
            friendshipId: created.id,
            requesterId: me,
            href: '/friends',
          }),
        },
      });
      return created;
    });

    void import('@/lib/web-push')
      .then(({ pushForNotification }) =>
        pushForNotification({
          userId,
          type: 'FRIEND_REQUEST',
          title: 'Новая заявка в друзья',
          body: `${requester?.name || 'Пользователь'} хочет добавить вас в друзья`,
          meta: { friendshipId: friendship.id, requesterId: me, href: '/friends' },
        })
      )
      .catch(() => null);

    return NextResponse.json({ friendship }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ message: 'Заявка или дружба уже существует' }, { status: 409 });
    }
    console.error('POST /api/friends', error);
    return NextResponse.json({ message: 'Не удалось отправить заявку' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const csrf = assertSameOrigin(req);
    if (csrf) return csrf;
    const session = await getServerSession(authOptions);
    const me = session?.user?.id;
    if (!me) return unauthorized();

    const payload = await req.json().catch(() => ({}));
    const friendshipId =
      typeof payload.friendshipId === 'string' ? payload.friendshipId.trim() : '';
    const action =
      typeof payload.action === 'string' ? payload.action : '';

    if (!friendshipId || !['accept', 'decline', 'cancel', 'remove'].includes(action)) {
      return NextResponse.json({ message: 'Некорректное действие' }, { status: 400 });
    }

    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId },
      select: { id: true, requesterId: true, addresseeId: true, status: true },
    });
    if (!friendship) {
      return NextResponse.json({ message: 'Заявка не найдена' }, { status: 404 });
    }

    if (action === 'accept' || action === 'decline') {
      if (friendship.addresseeId !== me || friendship.status !== 'PENDING') {
        return NextResponse.json({ message: 'Действие недоступно' }, { status: 403 });
      }
      const status = action === 'accept' ? 'ACCEPTED' : 'DECLINED';
      await prisma.friendship.update({
        where: { id: friendshipId },
        data: { status },
      });
      if (status === 'ACCEPTED') {
        const { bumpSocialScore, SOCIAL } = await import('@/lib/reputation');
        const { bumpEcoPoints, ECO } = await import('@/lib/eco-points');
        await Promise.all([
          bumpSocialScore(me, SOCIAL.FRIEND_ACCEPT_DELTA, 'Приняли заявку в друзья'),
          bumpSocialScore(friendship.requesterId, SOCIAL.FRIEND_ACCEPT_DELTA, 'Дружба подтверждена'),
          bumpEcoPoints(me, ECO.FRIEND_ACCEPT, 'friend_accept'),
          bumpEcoPoints(friendship.requesterId, ECO.FRIEND_ACCEPT, 'friend_accept'),
        ]);
        const { onReferralFriendship } = await import('@/lib/referrals');
        void onReferralFriendship(me, friendship.requesterId).catch(() => null);
        await Promise.all([
          evaluateAchievements(me),
          evaluateAchievements(friendship.requesterId),
        ]);
      }
      return NextResponse.json({ ok: true, status });
    }

    if (action === 'cancel') {
      if (friendship.requesterId !== me || friendship.status !== 'PENDING') {
        return NextResponse.json({ message: 'Действие недоступно' }, { status: 403 });
      }
      await prisma.friendship.delete({ where: { id: friendshipId } });
      return NextResponse.json({ ok: true });
    }

    const participant = friendship.requesterId === me || friendship.addresseeId === me;
    if (!participant || friendship.status !== 'ACCEPTED') {
      return NextResponse.json({ message: 'Действие недоступно' }, { status: 403 });
    }
    await prisma.friendship.delete({ where: { id: friendshipId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PATCH /api/friends', error);
    return NextResponse.json({ message: 'Не удалось изменить заявку' }, { status: 500 });
  }
}
