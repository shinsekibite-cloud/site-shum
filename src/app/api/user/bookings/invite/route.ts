import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { assertCleanText, ProfanityError } from '@/lib/censor';
import { conversationPairKey } from '@/lib/social';
import { evaluateAchievements } from '@/lib/award-achievements';
import {
  messagePerHourLimiter,
  messagePerMinuteLimiter,
  rateLimitJson,
} from '@/lib/rateLimit';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ message: 'Необходимо авторизоваться' }, { status: 401 });
    }

    const { getUserCapabilities, AUTHORITY } = await import('@/lib/reputation');
    const caps = await getUserCapabilities(userId);
    if (!caps.canInviteToEvents) {
      return NextResponse.json(
        {
          message: `Авторитет слишком низкий для приглашений (нужно ≥ ${AUTHORITY.INVITE_MIN}%, сейчас ${caps.authority}%).`,
        },
        { status: 403 }
      );
    }

    if (
      !(await messagePerMinuteLimiter.checkAsync(`msg-m:${userId}`, 20)) ||
      !(await messagePerHourLimiter.checkAsync(`inv-h:${userId}`, 40))
    ) {
      return NextResponse.json(rateLimitJson('Слишком много приглашений. Подождите немного.'), {
        status: 429,
      });
    }

    const body = await req.json().catch(() => ({}));
    const bookingId = String(body.bookingId || '').trim();
    const friendId = String(body.friendId || body.toUserId || '').trim();
    const note = String(body.message || '').trim().slice(0, 280);

    if (!bookingId || !friendId) {
      return NextResponse.json({ message: 'Укажите мероприятие и друга' }, { status: 400 });
    }
    if (friendId === userId) {
      return NextResponse.json({ message: 'Нельзя пригласить самого себя' }, { status: 400 });
    }

    if (note) {
      try {
        assertCleanText(note);
      } catch (e) {
        if (e instanceof ProfanityError) {
          return NextResponse.json({ message: e.message || 'Текст не прошёл проверку' }, { status: 400 });
        }
        throw e;
      }
    }

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, status: 'APPROVED', endTime: { gt: new Date() } },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        userId: true,
        space: { select: { title: true } },
        participants: { where: { userId }, select: { id: true }, take: 1 },
      },
    });
    if (!booking) {
      return NextResponse.json({ message: 'Мероприятие не найдено или уже прошло' }, { status: 404 });
    }

    const canInvite = booking.userId === userId || booking.participants.length > 0;
    if (!canInvite) {
      return NextResponse.json(
        { message: 'Приглашать можно, если вы организатор или участник мероприятия' },
        { status: 403 }
      );
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

    const recent = await prisma.bookingInvite.findFirst({
      where: {
        fromUserId: userId,
        toUserId: friendId,
        bookingId,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (recent) {
      return NextResponse.json(
        { message: 'Вы уже приглашали этого друга на это мероприятие за последние сутки' },
        { status: 429 }
      );
    }

    const href = `/events#event-${booking.id}`;
    const fromName = session.user?.name || 'Друг';
    const cardBody = note
      ? `${fromName} зовёт на «${booking.title}»: ${note}`
      : `${fromName} приглашает на «${booking.title}»`;

    const meta = {
      bookingId: booking.id,
      title: booking.title,
      startTime: booking.startTime.toISOString(),
      endTime: booking.endTime.toISOString(),
      spaceTitle: booking.space?.title || null,
      href,
      note: note || null,
    };

    const result = await prisma.$transaction(async (tx) => {
      const invite = await tx.bookingInvite.create({
        data: {
          fromUserId: userId,
          toUserId: friendId,
          bookingId: booking.id,
          message: note || null,
          status: 'SENT',
        },
      });

      const conversation = await tx.conversation.upsert({
        where: { pairKey: conversationPairKey(userId, friendId) },
        create: { pairKey: conversationPairKey(userId, friendId) },
        update: { updatedAt: new Date() },
      });

      const message = await tx.directMessage.create({
        data: {
          conversationId: conversation.id,
          senderId: userId,
          body: cardBody,
          kind: 'EVENT_INVITE',
          metaJson: JSON.stringify({ ...meta, inviteId: invite.id }),
        },
        select: {
          id: true,
          senderId: true,
          body: true,
          kind: true,
          metaJson: true,
          flagged: true,
          readAt: true,
          createdAt: true,
        },
      });

      await tx.bookingInvite.update({
        where: { id: invite.id },
        data: { messageId: message.id },
      });

      await tx.userNotification.create({
        data: {
          userId: friendId,
          type: 'SYSTEM',
          title: 'Приглашение на мероприятие',
          body: cardBody.slice(0, 200),
          meta: JSON.stringify({
            href: `/messages?with=${userId}`,
            bookingId: booking.id,
            inviteId: invite.id,
          }),
        },
      });

      return { inviteId: invite.id, conversationId: conversation.id, message };
    });

    await evaluateAchievements(userId);

    void import('@/lib/web-push')
      .then(({ pushForNotification }) =>
        pushForNotification({
          userId: friendId,
          type: 'SYSTEM',
          title: 'Приглашение на мероприятие',
          body: cardBody.slice(0, 160),
          meta: { href: `/messages?with=${userId}`, bookingId: booking.id },
        })
      )
      .catch(() => null);

    return NextResponse.json({
      ok: true,
      inviteId: result.inviteId,
      conversationId: result.conversationId,
      message: {
        ...result.message,
        meta: { ...meta, inviteId: result.inviteId },
      },
    });
  } catch (e) {
    console.error('POST /api/user/bookings/invite', e);
    return NextResponse.json({ message: 'Не удалось отправить приглашение' }, { status: 500 });
  }
}
