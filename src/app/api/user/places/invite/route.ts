import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createUserNotification } from '@/lib/security';
import { assertCleanText, ProfanityError } from '@/lib/censor';
import { placesRateLimiter, rateLimitJson } from '@/lib/rateLimit';
import { encodeRouteParam } from '@/lib/route-id';
import { conversationPairKey } from '@/lib/social';
import { evaluateAchievements } from '@/lib/award-achievements';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ message: 'Необходимо авторизоваться' }, { status: 401 });
    }

    if (!(await placesRateLimiter.checkAsync(`places:${userId}`))) {
      return NextResponse.json(rateLimitJson('Слишком много действий с местами. Лимит: 20 в час.'), {
        status: 429,
      });
    }

    const body = await req.json().catch(() => ({}));
    const placeId = String(body.placeId || '').trim();
    const friendId = String(body.friendId || body.toUserId || '').trim();
    const message = String(body.message || '').trim().slice(0, 280);

    if (!placeId || !friendId) {
      return NextResponse.json({ message: 'Укажите место и друга' }, { status: 400 });
    }
    if (friendId === userId) {
      return NextResponse.json({ message: 'Нельзя пригласить самого себя' }, { status: 400 });
    }

    if (message) {
      try {
        assertCleanText(message);
      } catch (e) {
        if (e instanceof ProfanityError) {
          return NextResponse.json({ message: e.message || 'Текст не прошёл проверку' }, { status: 400 });
        }
        throw e;
      }
    }

    const place = await prisma.place.findFirst({
      where: { id: placeId, status: 'PUBLISHED' },
      select: { id: true, title: true, slug: true },
    });
    if (!place) {
      return NextResponse.json({ message: 'Место не найдено' }, { status: 404 });
    }

    const friendship = await prisma.friendship.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterId: userId, addresseeId: friendId },
          { requesterId: friendId, addresseeId: userId },
        ],
      },
      select: { id: true },
    });
    if (!friendship) {
      return NextResponse.json({ message: 'Приглашать можно только друзей' }, { status: 403 });
    }

    const recent = await prisma.placeInvite.findFirst({
      where: {
        fromUserId: userId,
        toUserId: friendId,
        placeId,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (recent) {
      return NextResponse.json({ message: 'Вы уже приглашали этого друга сюда за последние сутки' }, { status: 429 });
    }

    const fromName = session.user?.name || 'Друг';
    const href = `/places/${encodeRouteParam(place.slug || place.id)}`;
    const cardBody = message
      ? `${fromName} зовёт в «${place.title}»: ${message}`
      : `${fromName} предлагает сходить в «${place.title}»`;

    const meta = {
      placeId: place.id,
      title: place.title,
      slug: place.slug,
      href,
      note: message || null,
    };

    const invite = await prisma.$transaction(async (tx) => {
      const created = await tx.placeInvite.create({
        data: {
          fromUserId: userId,
          toUserId: friendId,
          placeId,
          message: message || null,
        },
        select: { id: true },
      });

      const conversation = await tx.conversation.upsert({
        where: { pairKey: conversationPairKey(userId, friendId) },
        create: { pairKey: conversationPairKey(userId, friendId) },
        update: { updatedAt: new Date() },
      });

      await tx.directMessage.create({
        data: {
          conversationId: conversation.id,
          senderId: userId,
          body: cardBody,
          kind: 'PLACE_INVITE',
          metaJson: JSON.stringify({ ...meta, inviteId: created.id }),
        },
      });

      return created;
    });

    await createUserNotification({
      userId: friendId,
      type: 'SYSTEM',
      title: 'Приглашение сходить',
      body: cardBody.slice(0, 200),
      meta: { href: `/messages?with=${userId}`, placeId: place.id, inviteId: invite.id },
    });

    await evaluateAchievements(userId);

    return NextResponse.json({ ok: true, inviteId: invite.id });
  } catch (e) {
    console.error('POST /api/user/places/invite', e);
    return NextResponse.json({ message: 'Не удалось отправить приглашение' }, { status: 500 });
  }
}
