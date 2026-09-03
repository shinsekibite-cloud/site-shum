import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createUserNotification } from '@/lib/security';
import { assertCleanText, ProfanityError } from '@/lib/censor';
import { hasEntityAccess, type EntityKind } from '@/lib/entity-access';
import { areFriends } from '@/lib/social';
import { placesRateLimiter, rateLimitJson } from '@/lib/rateLimit';
import { encodeRouteParam } from '@/lib/route-id';
import { bumpEcoPoints, ECO } from '@/lib/eco-points';
import { promoteToParticipant } from '@/lib/participant';

function parseKind(raw: unknown): EntityKind | null {
  const k = String(raw || '').toUpperCase();
  if (k === 'PROJECT' || k === 'CLUB') return k;
  return null;
}

function entityHref(kind: EntityKind, entityId: string) {
  const base = kind === 'PROJECT' ? '/projects' : '/clubs';
  return `${base}/${encodeRouteParam(entityId)}`;
}


export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ message: 'Необходимо авторизоваться' }, { status: 401 });
    }

    const url = new URL(req.url);
    const scope = String(url.searchParams.get('scope') || 'received').toLowerCase();

    if (scope === 'memberships') {
      const apps = await prisma.application.findMany({
        where: { userId, status: 'APPROVED' },
        select: {
          projectId: true,
          clubId: true,
          project: { select: { id: true, title: true, status: true } },
          club: { select: { id: true, title: true, status: true } },
        },
      });
      const items = [
        ...apps
          .filter((a) => a.project && a.project.status !== 'INACTIVE')
          .map((a) => ({ kind: 'PROJECT' as const, entityId: a.projectId!, title: a.project!.title })),
        ...apps
          .filter((a) => a.club && a.club.status !== 'INACTIVE')
          .map((a) => ({ kind: 'CLUB' as const, entityId: a.clubId!, title: a.club!.title })),
      ];
      return NextResponse.json({ items });
    }

    const invites = await prisma.entityInvite.findMany({
      where: { inviteeId: userId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        kind: true,
        message: true,
        createdAt: true,
        projectId: true,
        clubId: true,
        project: { select: { id: true, title: true } },
        club: { select: { id: true, title: true } },
        inviter: { select: { id: true, name: true, nickname: true, image: true } },
      },
    });
    return NextResponse.json({
      invites: invites.map((inv) => ({
        id: inv.id,
        kind: inv.kind,
        message: inv.message,
        createdAt: inv.createdAt,
        entityId: inv.kind === 'PROJECT' ? inv.projectId : inv.clubId,
        title: (inv.kind === 'PROJECT' ? inv.project?.title : inv.club?.title) || '',
        from: {
          id: inv.inviter.id,
          name: inv.inviter.nickname || inv.inviter.name,
          image: inv.inviter.image,
        },
      })),
    });
  } catch (e) {
    console.error('GET /api/entity-invites', e);
    return NextResponse.json({ message: 'Ошибка загрузки приглашений' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ message: 'Необходимо авторизоваться' }, { status: 401 });
    }

    if (!(await placesRateLimiter.checkAsync(`entity-inv:${userId}`))) {
      return NextResponse.json(rateLimitJson('Слишком много приглашений. Лимит: 20 в час.'), { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const kind = parseKind(body.kind);
    const entityId = String(body.entityId || '').trim();
    const friendId = String(body.friendId || '').trim();
    const message = String(body.message || '').trim().slice(0, 280);

    if (!kind || !entityId || !friendId) {
      return NextResponse.json({ message: 'Укажите тип, сущность и друга' }, { status: 400 });
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

    const allowed = await hasEntityAccess(userId, session.user?.role, kind, entityId);
    if (!allowed) {
      return NextResponse.json({ message: 'Приглашать могут только одобренные участники' }, { status: 403 });
    }

    const entity =
      kind === 'PROJECT'
        ? await prisma.project.findUnique({ where: { id: entityId }, select: { id: true, title: true, status: true } })
        : await prisma.club.findUnique({ where: { id: entityId }, select: { id: true, title: true, status: true } });

    if (!entity || entity.status === 'INACTIVE') {
      return NextResponse.json({ message: 'Не найдено' }, { status: 404 });
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

    const existingMember = await prisma.application.findFirst({
      where: {
        userId: friendId,
        status: 'APPROVED',
        ...(kind === 'PROJECT' ? { projectId: entityId } : { clubId: entityId }),
      },
      select: { id: true },
    });
    if (existingMember) {
      return NextResponse.json({ message: 'Друг уже участник' }, { status: 409 });
    }

    const pendingInvite = await prisma.entityInvite.findFirst({
      where: {
        inviteeId: friendId,
        status: 'PENDING',
        ...(kind === 'PROJECT' ? { projectId: entityId } : { clubId: entityId }),
      },
      select: { id: true },
    });
    if (pendingInvite) {
      return NextResponse.json({ message: 'У друга уже есть активное приглашение' }, { status: 409 });
    }

    const recent = await prisma.entityInvite.findFirst({
      where: {
        inviterId: userId,
        inviteeId: friendId,
        ...(kind === 'PROJECT' ? { projectId: entityId } : { clubId: entityId }),
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (recent) {
      return NextResponse.json({ message: 'Вы уже приглашали этого друга за последние сутки' }, { status: 429 });
    }

    const fromName = session.user?.name || 'Участник';
    const href = entityHref(kind, entityId);
    const cardBody = message
      ? `${fromName} зовёт в «${entity.title}»: ${message}`
      : `${fromName} приглашает в «${entity.title}»`;

    const invite = await prisma.entityInvite.create({
      data: {
        kind,
        projectId: kind === 'PROJECT' ? entityId : null,
        clubId: kind === 'CLUB' ? entityId : null,
        inviterId: userId,
        inviteeId: friendId,
        message: message || null,
        status: 'PENDING',
      },
      select: { id: true },
    });

    await createUserNotification({
      userId: friendId,
      type: 'ENTITY_INVITE',
      title: kind === 'PROJECT' ? 'Приглашение в проект' : 'Приглашение в клуб',
      body: cardBody.slice(0, 200),
      meta: { inviteId: invite.id, kind, entityId, href },
    });

    void import('@/lib/web-push')
      .then(({ pushForNotification }) =>
        pushForNotification({
          userId: friendId,
          type: 'ENTITY_INVITE',
          title: kind === 'PROJECT' ? 'Приглашение в проект' : 'Приглашение в клуб',
          body: cardBody.slice(0, 160),
          meta: { inviteId: invite.id, kind, entityId, href },
        })
      )
      .catch(() => null);

    // Mirror invite into DM so it appears in Messages
    try {
      const { conversationPairKey } = await import('@/lib/social');
      const pairKey = conversationPairKey(userId, friendId);
      const conversation = await prisma.conversation.upsert({
        where: { pairKey },
        create: { pairKey, kind: 'DM' },
        update: { updatedAt: new Date() },
        select: { id: true },
      });
      const meta = {
        inviteId: invite.id,
        entityKind: kind,
        entityId,
        title: entity.title,
        href,
        note: message || null,
      };
      await prisma.directMessage.create({
        data: {
          conversationId: conversation.id,
          senderId: userId,
          body: cardBody.slice(0, 500),
          kind: 'ENTITY_INVITE',
          metaJson: JSON.stringify(meta),
        },
      });
    } catch (dmErr) {
      console.warn('entity-invite DM card', dmErr);
    }

    return NextResponse.json({ ok: true, inviteId: invite.id });
  } catch (e) {
    console.error('POST /api/entity-invites', e);
    return NextResponse.json({ message: 'Не удалось отправить приглашение' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ message: 'Необходимо авторизоваться' }, { status: 401 });
    }

    if (!(await placesRateLimiter.checkAsync(`entity-inv-patch:${userId}`))) {
      return NextResponse.json(rateLimitJson('Слишком много действий с приглашениями. Лимит: 20 в час.'), {
        status: 429,
      });
    }

    const body = await req.json().catch(() => ({}));
    const inviteId = String(body.inviteId || '').trim();
    const action = String(body.action || '').toLowerCase();

    if (!inviteId || (action !== 'accept' && action !== 'decline')) {
      return NextResponse.json({ message: 'Укажите inviteId и action: accept | decline' }, { status: 400 });
    }

    const invite = await prisma.entityInvite.findUnique({
      where: { id: inviteId },
      include: {
        project: { select: { id: true, title: true, status: true } },
        club: { select: { id: true, title: true, status: true } },
      },
    });

    if (!invite || invite.inviteeId !== userId) {
      return NextResponse.json({ message: 'Приглашение не найдено' }, { status: 404 });
    }
    if (invite.status !== 'PENDING') {
      return NextResponse.json({ message: 'Приглашение уже обработано' }, { status: 409 });
    }

    const entity = invite.kind === 'PROJECT' ? invite.project : invite.club;
    if (!entity || entity.status === 'INACTIVE') {
      return NextResponse.json({ message: 'Сущность недоступна' }, { status: 404 });
    }

    if (action === 'decline') {
      await prisma.entityInvite.update({
        where: { id: inviteId },
        data: { status: 'DECLINED' },
      });
      return NextResponse.json({ ok: true, status: 'DECLINED' });
    }

    const entityId = invite.kind === 'PROJECT' ? invite.projectId! : invite.clubId!;

    await prisma.$transaction(async (tx) => {
      await tx.entityInvite.update({
        where: { id: inviteId },
        data: { status: 'ACCEPTED' },
      });

      if (invite.kind === 'PROJECT') {
        await tx.application.upsert({
          where: { userId_projectId: { userId, projectId: entityId } },
          create: { userId, projectId: entityId, status: 'APPROVED' },
          update: { status: 'APPROVED', rejectReason: null },
        });
      } else {
        await tx.application.upsert({
          where: { userId_clubId: { userId, clubId: entityId } },
          create: { userId, clubId: entityId, status: 'APPROVED' },
          update: { status: 'APPROVED', rejectReason: null },
        });
      }
    });

    await promoteToParticipant(userId);
    void bumpEcoPoints(userId, ECO.APPLICATION_APPROVED, 'entity_invite_accept', {
      kind: invite.kind,
      entityId,
      inviteId,
    }).catch(() => null);

    const href = entityHref(invite.kind as EntityKind, entityId);
    await createUserNotification({
      userId: invite.inviterId,
      type: 'SYSTEM',
      title: 'Приглашение принято',
      body: `${session.user?.name || 'Друг'} вступил(а) в «${entity.title}»`,
      meta: { href },
    });

    return NextResponse.json({ ok: true, status: 'ACCEPTED', href });
  } catch (e) {
    console.error('PATCH /api/entity-invites', e);
    return NextResponse.json({ message: 'Не удалось обработать приглашение' }, { status: 500 });
  }
}
