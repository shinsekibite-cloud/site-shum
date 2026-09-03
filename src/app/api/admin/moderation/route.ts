import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canAccessAdminPath } from '@/lib/acl-shared';
import { safetyCategoryLabel } from '@/lib/censor';
import { createUserNotification } from '@/lib/security';
import {
  buildModerationDecisionBody,
} from '@/lib/moderation-config';
import { getModerationConfig } from '@/lib/moderation-settings';

function unauthorized() {
  return NextResponse.json({ message: 'Нет доступа' }, { status: 403 });
}

async function requireModerationAccess() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  if (
    !canAccessAdminPath(
      session.user.role,
      session.user.permissions,
      '/admin/moderation'
    )
  ) {
    return null;
  }
  return session;
}

export async function GET(req: Request) {
  try {
    const session = await requireModerationAccess();
    if (!session?.user?.id) return unauthorized();

    const url = new URL(req.url);
    const status = url.searchParams.get('status') || 'OPEN';
    const format = url.searchParams.get('format');
    const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days') || 30)));
    const since = new Date(Date.now() - days * 86400000);
    const source = (url.searchParams.get('source') || 'all').toLowerCase();
    const category = (url.searchParams.get('category') || '').trim();
    const q = (url.searchParams.get('q') || '').trim();

    const where: Record<string, unknown> = {
      createdAt: { gte: since },
    };
    if (status !== 'ALL') where.status = status;
    if (category) where.category = category;
    if (source === 'chat' || source === 'messages') {
      where.sourceType = { in: ['DIRECT_MESSAGE', 'MESSAGE', 'GROUP_CHAT'] };
    } else if (source === 'photo' || source === 'images') {
      where.sourceType = { in: ['GALLERY_IMAGE', 'AVATAR_IMAGE'] };
    } else if (source === 'profile') {
      where.sourceType = 'PROFILE_TEXT';
    }
    if (q) {
      where.OR = [
        { originalText: { contains: q, mode: 'insensitive' } },
        { maskedText: { contains: q, mode: 'insensitive' } },
        { actor: { name: { contains: q, mode: 'insensitive' } } },
        { actor: { email: { contains: q, mode: 'insensitive' } } },
        { actor: { publicCode: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [flags, openCount, openChatCount, openPhotoCount, totalPeriod, byCategory, topActors, byReviewer] =
      await Promise.all([
        prisma.contentFlag.findMany({
          where: where as any,
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: {
            actor: {
              select: {
                id: true,
                name: true,
                email: true,
                publicCode: true,
                warnCount: true,
                reliabilityScore: true,
              },
            },
          },
        }),
        prisma.contentFlag.count({ where: { status: 'OPEN' } }),
        prisma.contentFlag.count({
          where: {
            status: 'OPEN',
            sourceType: { in: ['DIRECT_MESSAGE', 'MESSAGE', 'GROUP_CHAT'] },
          },
        }),
        prisma.contentFlag.count({
          where: {
            status: 'OPEN',
            sourceType: { in: ['GALLERY_IMAGE', 'AVATAR_IMAGE'] },
          },
        }),
        prisma.contentFlag.count({ where: { createdAt: { gte: since } } }),
        prisma.contentFlag.groupBy({
          by: ['category'],
          where: { createdAt: { gte: since } },
          _count: { _all: true },
          orderBy: { _count: { category: 'desc' } },
        }),
        prisma.contentFlag.groupBy({
          by: ['actorUserId'],
          where: { createdAt: { gte: since } },
          _count: { _all: true },
          orderBy: { _count: { actorUserId: 'desc' } },
          take: 8,
        }),
        prisma.contentFlag.groupBy({
          by: ['reviewedById'],
          where: {
            createdAt: { gte: since },
            reviewedById: { not: null },
            status: { in: ['REVIEWED', 'ACTIONED', 'DISMISSED'] },
          },
          _count: { _all: true },
          orderBy: { _count: { reviewedById: 'desc' } },
          take: 12,
        }),
      ]);

    const actorIds = topActors.map((a) => a.actorUserId);
    const reviewerIds = byReviewer
      .map((r) => r.reviewedById)
      .filter((id): id is string => Boolean(id));
    const users = await prisma.user.findMany({
      where: {
        id: { in: [...new Set([...actorIds, ...reviewerIds])] },
        role: { not: 'TECH' },
      },
      select: {
        id: true,
        name: true,
        nickname: true,
        publicCode: true,
        warnCount: true,
        image: true,
        role: true,
      },
    });
    const usersById = new Map(users.map((a) => [a.id, a]));

    const actionedByReviewer = await prisma.contentFlag.groupBy({
      by: ['reviewedById'],
      where: {
        createdAt: { gte: since },
        reviewedById: { in: reviewerIds },
        status: 'ACTIONED',
      },
      _count: { _all: true },
    });
    const dismissedByReviewer = await prisma.contentFlag.groupBy({
      by: ['reviewedById'],
      where: {
        createdAt: { gte: since },
        reviewedById: { in: reviewerIds },
        status: 'DISMISSED',
      },
      _count: { _all: true },
    });
    const actionedMap = new Map(
      actionedByReviewer.map((r) => [r.reviewedById, r._count._all])
    );
    const dismissedMap = new Map(
      dismissedByReviewer.map((r) => [r.reviewedById, r._count._all])
    );

    const stats = {
      openCount,
      openChatCount,
      openPhotoCount,
      totalPeriod,
      days,
      byCategory: byCategory.map((c) => ({
        category: c.category,
        label: safetyCategoryLabel(c.category),
        count: c._count._all,
      })),
      topActors: topActors.map((a) => ({
        userId: a.actorUserId,
        count: a._count._all,
        name: usersById.get(a.actorUserId)?.name || '—',
        publicCode: usersById.get(a.actorUserId)?.publicCode || null,
        warnCount: usersById.get(a.actorUserId)?.warnCount ?? 0,
      })),
      hallOfFame: byReviewer.map((r, idx) => {
        const id = r.reviewedById!;
        const u = usersById.get(id);
        const total = r._count._all;
        const actioned = actionedMap.get(id) || 0;
        const dismissed = dismissedMap.get(id) || 0;
        return {
          userId: id,
          rank: idx + 1,
          name: u?.nickname || u?.name || 'Модератор',
          publicCode: u?.publicCode || null,
          image: u?.image || null,
          role: u?.role || null,
          total,
          actioned,
          dismissed,
          reviewed: Math.max(0, total - actioned - dismissed),
        };
      }),
    };

    if (format === 'csv') {
      const header = [
        'id',
        'createdAt',
        'status',
        'category',
        'severity',
        'actorId',
        'actorName',
        'actorEmail',
        'reliabilityDelta',
        'matches',
        'maskedText',
        'reviewedById',
        'reviewNote',
      ].join(',');
      const rows = flags.map((f) =>
        [
          f.id,
          f.createdAt.toISOString(),
          f.status,
          f.category,
          f.severity,
          f.actorUserId,
          JSON.stringify(f.actor.name || ''),
          JSON.stringify(f.actor.email || ''),
          f.reliabilityDelta,
          JSON.stringify(f.matches || ''),
          JSON.stringify(f.maskedText.slice(0, 200)),
          f.reviewedById || '',
          JSON.stringify(f.reviewNote || ''),
        ].join(',')
      );
      const csv = [header, ...rows].join('\n');
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="moderation-${days}d.csv"`,
        },
      });
    }

    if (format === 'reviewers-csv') {
      const header = ['rank', 'userId', 'name', 'publicCode', 'total', 'actioned', 'dismissed', 'reviewed'].join(',');
      const rows = stats.hallOfFame.map((r) =>
        [
          r.rank,
          r.userId,
          JSON.stringify(r.name),
          r.publicCode || '',
          r.total,
          r.actioned,
          r.dismissed,
          r.reviewed,
        ].join(',')
      );
      const csv = [header, ...rows].join('\n');
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="moderators-${days}d.csv"`,
        },
      });
    }

    return NextResponse.json({
      stats,
      config: await getModerationConfig(),
      flags: flags.map((f) => ({
        id: f.id,
        category: f.category,
        categories: (() => {
          try {
            return JSON.parse(f.categories || '[]');
          } catch {
            return [f.category];
          }
        })(),
        severity: f.severity,
        status: f.status,
        sourceType: f.sourceType,
        sourceId: f.sourceId,
        conversationId: f.conversationId,
        originalText: f.originalText,
        maskedText: f.maskedText,
        matches: (() => {
          try {
            return JSON.parse(f.matches || '[]');
          } catch {
            return [];
          }
        })(),
        reliabilityDelta: f.reliabilityDelta,
        reviewNote: f.reviewNote,
        reviewedAt: f.reviewedAt,
        reviewedById: f.reviewedById,
        createdAt: f.createdAt,
        actor: f.actor,
      })),
    });
  } catch (e) {
    console.error('GET /api/admin/moderation', e);
    return NextResponse.json({ message: 'Ошибка загрузки' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireModerationAccess();
    if (!session?.user?.id) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const id = typeof body.id === 'string' ? body.id : '';
    const action = typeof body.action === 'string' ? body.action : '';
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : null;
    if (!id || !['REVIEWED', 'DISMISSED', 'ACTIONED'].includes(action)) {
      return NextResponse.json({ message: 'Некорректный запрос' }, { status: 400 });
    }

    const flag = await prisma.contentFlag.findUnique({ where: { id } });
    if (!flag) return NextResponse.json({ message: 'Не найдено' }, { status: 404 });

    const updated = await prisma.contentFlag.update({
      where: { id },
      data: {
        status: action,
        reviewedAt: new Date(),
        reviewedById: session.user.id,
        reviewNote: note,
      },
    });

    // Apply gallery/avatar decisions for image review flags
    try {
      const { applyImageModerationDecision } = await import('@/lib/image-moderation');
      await applyImageModerationDecision({ flagId: id, action: action as 'ACTIONED' | 'DISMISSED' | 'REVIEWED' });
    } catch (imgErr) {
      console.error('image moderation apply', imgErr);
    }

    const cfg = await getModerationConfig();
    const categoryLabel = safetyCategoryLabel(flag.category);
    const snippet = flag.maskedText || flag.originalText || '';

    if (action === 'ACTIONED' && cfg.notifyOnActioned) {
      await createUserNotification({
        userId: flag.actorUserId,
        type: 'MODERATION',
        title: 'Решение модерации',
        body: buildModerationDecisionBody({
          action: 'ACTIONED',
          categoryLabel,
          snippet,
          note,
        }),
        meta: {
          href: '/dashboard',
          flagId: id,
          conversationId: flag.conversationId,
          category: flag.category,
          action,
          audience: 'user',
          actorId: session.user.id,
          actorName: session.user.name || 'Модератор',
          actorLabel: 'Администрация сайта',
          handled: true,
        },
      });
    }

    if (action === 'DISMISSED' && cfg.notifyOnDismissed) {
      await createUserNotification({
        userId: flag.actorUserId,
        type: 'MODERATION',
        title: 'Модерация: замечание снято',
        body: buildModerationDecisionBody({
          action: 'DISMISSED',
          categoryLabel,
          snippet,
          note,
        }),
        meta: {
          href: '/dashboard',
          flagId: id,
          conversationId: flag.conversationId,
          category: flag.category,
          action,
          audience: 'user',
          actorId: session.user.id,
          actorName: session.user.name || 'Модератор',
          actorLabel: 'Администрация сайта',
          handled: true,
        },
      });
    }

    // Staff trail: who closed the case
    if (action === 'ACTIONED' || action === 'DISMISSED') {
      const { notifyStaffModerationDecision } = await import('@/lib/content-moderation');
      await notifyStaffModerationDecision({
        flagId: id,
        action,
        categoryLabel,
        reviewerId: session.user.id,
        reviewerName: session.user.name || 'Модератор',
        excludeUserId: session.user.id,
      }).catch(() => null);
    }

    return NextResponse.json({ ok: true, flag: updated });
  } catch (e) {
    console.error('PATCH /api/admin/moderation', e);
    return NextResponse.json({ message: 'Ошибка' }, { status: 500 });
  }
}
