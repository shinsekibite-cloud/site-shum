import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { conversationPairKey, otherUserIdFromPair } from '@/lib/social';
import { hasEntityAccess, type EntityKind } from '@/lib/entity-access';
import { placesRateLimiter, rateLimitJson } from '@/lib/rateLimit';

async function canAccessConversation(userId: string, role: string | null | undefined, conversationId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, pairKey: true, kind: true, projectId: true, clubId: true },
  });
  if (!conversation) return null;

  const kind = (conversation.kind || 'DM').toUpperCase();
  if (kind === 'DM') {
    const otherId = otherUserIdFromPair(conversation.pairKey, userId);
    if (!otherId || conversationPairKey(userId, otherId) !== conversation.pairKey) {
      return null;
    }
    return conversation;
  }

  if (kind === 'PROJECT' || kind === 'CLUB') {
    const entityId = kind === 'PROJECT' ? conversation.projectId : conversation.clubId;
    if (!entityId) return null;
    const ok = await hasEntityAccess(userId, role, kind as EntityKind, entityId);
    return ok ? conversation : null;
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const me = session?.user?.id;
    if (!me) {
      return NextResponse.json({ message: 'Необходимо авторизоваться' }, { status: 401 });
    }

    if (!(await placesRateLimiter.checkAsync(`msg-state:${me}`))) {
      return NextResponse.json(rateLimitJson('Слишком много действий. Подождите минуту.'), { status: 429 });
    }

    const payload = await req.json().catch(() => ({}));
    const conversationId = typeof payload.conversationId === 'string' ? payload.conversationId.trim() : '';
    if (!conversationId) {
      return NextResponse.json({ message: 'Укажите conversationId' }, { status: 400 });
    }

    const conversation = await canAccessConversation(me, session.user?.role, conversationId);
    if (!conversation) {
      return NextResponse.json({ message: 'Нет доступа к диалогу' }, { status: 403 });
    }

    const data: { pinnedAt?: Date | null; archivedAt?: Date | null; mutedAt?: Date | null } = {};
    if (typeof payload.pinned === 'boolean') {
      data.pinnedAt = payload.pinned ? new Date() : null;
    }
    if (typeof payload.archived === 'boolean') {
      data.archivedAt = payload.archived ? new Date() : null;
      if (payload.archived) data.pinnedAt = null;
    }
    if (typeof payload.muted === 'boolean') {
      data.mutedAt = payload.muted ? new Date() : null;
    }

    if (!('pinnedAt' in data) && !('archivedAt' in data) && !('mutedAt' in data)) {
      return NextResponse.json({ message: 'Укажите pinned, archived и/или muted' }, { status: 400 });
    }

    const state = await prisma.conversationUserState.upsert({
      where: { userId_conversationId: { userId: me, conversationId } },
      create: {
        userId: me,
        conversationId,
        pinnedAt: data.pinnedAt ?? null,
        archivedAt: data.archivedAt ?? null,
        mutedAt: data.mutedAt ?? null,
      },
      update: data,
      select: { pinnedAt: true, archivedAt: true, mutedAt: true },
    });

    return NextResponse.json({
      ok: true,
      pinned: Boolean(state.pinnedAt),
      archived: Boolean(state.archivedAt),
      muted: Boolean(state.mutedAt),
    });
  } catch (error) {
    console.error('POST /api/messages/state', error);
    return NextResponse.json({ message: 'Не удалось обновить состояние диалога' }, { status: 500 });
  }
}
