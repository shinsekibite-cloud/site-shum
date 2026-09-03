import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { conversationPairKey, otherUserIdFromPair } from '@/lib/social';
import { parseMessageMeta } from '@/lib/message-meta';
import { hasEntityAccess, type EntityKind } from '@/lib/entity-access';
import { encodeRouteParam } from '@/lib/route-id';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const me = session?.user?.id;
    if (!me) {
      return NextResponse.json({ message: 'Необходимо авторизоваться' }, { status: 401 });
    }

    const { conversationId } = await params;
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        pairKey: true,
        kind: true,
        projectId: true,
        clubId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!conversation) {
      return NextResponse.json({ message: 'Диалог не найден' }, { status: 404 });
    }

    const kind = (conversation.kind || 'DM').toUpperCase();

    if (kind === 'PROJECT' || kind === 'CLUB') {
      const entityId = kind === 'PROJECT' ? conversation.projectId : conversation.clubId;
      if (!entityId) {
        return NextResponse.json({ message: 'Диалог повреждён' }, { status: 404 });
      }
      const allowed = await hasEntityAccess(me, session.user?.role, kind as EntityKind, entityId);
      if (!allowed) {
        return NextResponse.json({ message: 'Нет доступа к диалогу' }, { status: 403 });
      }

      const entity =
        kind === 'PROJECT'
          ? await prisma.project.findUnique({
              where: { id: entityId },
              select: { id: true, title: true, image: true },
            })
          : await prisma.club.findUnique({
              where: { id: entityId },
              select: { id: true, title: true, image: true },
            });

      const [, messages] = await prisma.$transaction([
        prisma.directMessage.updateMany({
          where: { conversationId, senderId: { not: me }, readAt: null },
          data: { readAt: new Date() },
        }),
        prisma.directMessage.findMany({
          where: { conversationId },
          orderBy: { createdAt: 'desc' },
          take: 120,
          select: {
            id: true,
            senderId: true,
            body: true,
            kind: true,
            metaJson: true,
            flagged: true,
            readAt: true,
            createdAt: true,
            sender: { select: { name: true, nickname: true, image: true } },
          },
        }),
      ]);

      const state = await prisma.conversationUserState.findUnique({
        where: { userId_conversationId: { userId: me, conversationId } },
        select: { pinnedAt: true, archivedAt: true, mutedAt: true },
      });

      return NextResponse.json({
        conversation: {
          id: conversation.id,
          kind,
          entityId,
          title: entity?.title || (kind === 'CLUB' ? 'Клуб' : 'Проект'),
          image: entity?.image || null,
          href:
            kind === 'CLUB'
              ? `/clubs/${encodeRouteParam(entityId)}`
              : `/projects/${encodeRouteParam(entityId)}`,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          pinned: Boolean(state?.pinnedAt),
          archived: Boolean(state?.archivedAt),
          muted: Boolean(state?.mutedAt),
        },
        messages: messages.reverse().map((m) => ({
          id: m.id,
          senderId: m.senderId,
          senderName: m.sender.nickname || m.sender.name || 'Участник',
          senderImage: m.sender.image,
          body: m.body,
          kind: m.kind,
          metaJson: m.metaJson,
          meta: parseMessageMeta(m.kind, m.metaJson),
          flagged: m.flagged,
          readAt: m.readAt,
          createdAt: m.createdAt,
        })),
      });
    }

    const otherUserId = otherUserIdFromPair(conversation.pairKey, me);
    if (!otherUserId || conversationPairKey(me, otherUserId) !== conversation.pairKey) {
      return NextResponse.json({ message: 'Нет доступа к диалогу' }, { status: 403 });
    }

    const [, messages, user] = await prisma.$transaction([
      prisma.directMessage.updateMany({
        where: {
          conversationId,
          senderId: { not: me },
          readAt: null,
        },
        data: { readAt: new Date() },
      }),
      prisma.directMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
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
      }),
      prisma.user.findUnique({
        where: { id: otherUserId },
        select: { id: true, publicCode: true, nickname: true, name: true, image: true },
      }),
    ]);

    if (!user) {
      return NextResponse.json({ message: 'Собеседник не найден' }, { status: 404 });
    }

    const state = await prisma.conversationUserState.findUnique({
      where: { userId_conversationId: { userId: me, conversationId } },
      select: { pinnedAt: true, archivedAt: true, mutedAt: true },
    });

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        kind: 'DM',
        user: {
          id: user.id,
          publicCode: user.publicCode,
          name: user.nickname || user.name,
          image: user.image,
        },
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        pinned: Boolean(state?.pinnedAt),
        archived: Boolean(state?.archivedAt),
        muted: Boolean(state?.mutedAt),
      },
      messages: messages.reverse().map((m) => ({
        ...m,
        meta: parseMessageMeta(m.kind, m.metaJson),
      })),
    });
  } catch (error) {
    console.error('GET /api/messages/[conversationId]', error);
    return NextResponse.json({ message: 'Ошибка загрузки сообщений' }, { status: 500 });
  }
}
