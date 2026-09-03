import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/acl-shared';
import { createUserNotification } from '@/lib/security';
import { hashPortfolioContent, toPortfolioPayload } from '@/lib/portfolio';
import { parsePortfolioDiff, snapshotFromPayload } from '@/lib/portfolio-diff';

function unauthorized() {
  return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
}

function canManage(role?: string | null, permissions?: string | null) {
  if (role === 'ADMIN') return true;
  if (role === 'MODERATOR') {
    return hasPermission(role, permissions, "portfolios");
  }
  return false;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();
  if (!canManage(session.user.role, session.user.permissions as string)) return forbidden();

  const status = new URL(req.url).searchParams.get('status') || 'PENDING';
  const where =
    status === 'ALL'
      ? { status: { in: ['PENDING', 'APPROVED', 'REJECTED'] as Array<'PENDING' | 'APPROVED' | 'REJECTED'> } }
      : { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' };

  const items = await prisma.userPortfolio.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, image: true, nickname: true, publicCode: true } },
      _count: { select: { sections: true, certificates: true, achievementLinks: true } },
    },
    orderBy: [{ submittedAt: 'desc' }, { updatedAt: 'desc' }],
    take: 100,
  });

  return NextResponse.json({
    items: items.map((item) => ({
      ...item,
      pendingDiff: parsePortfolioDiff(item.pendingDiffJson),
    })),
  });
}

const reviewSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['APPROVED', 'REJECTED']),
  rejectReason: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();
  if (!canManage(session.user.role, session.user.permissions as string)) return forbidden();

  const data = reviewSchema.parse(await req.json());
  const portfolio = await prisma.userPortfolio.findUnique({
    where: { id: data.id },
    include: {
      sections: true,
      certificates: true,
      achievementLinks: true,
      user: {
        select: {
          id: true,
          name: true,
          nickname: true,
          city: true,
          image: true,
          publicCode: true,
        },
      },
    },
  });
  if (!portfolio) {
    return NextResponse.json({ message: 'Не найдено' }, { status: 404 });
  }

  const payload = toPortfolioPayload(portfolio);
  const contentHash = hashPortfolioContent(payload);
  const approvedSnapshot =
    data.status === 'APPROVED' ? JSON.stringify(snapshotFromPayload(payload)) : undefined;

  const updated = await prisma.userPortfolio.update({
    where: { id: data.id },
    data: {
      status: data.status,
      reviewedAt: new Date(),
      reviewedById: session.user.id,
      rejectReason: data.status === 'REJECTED' ? data.rejectReason || 'Отклонено' : null,
      publishedAt: data.status === 'APPROVED' ? new Date() : null,
      contentHash: data.status === 'APPROVED' ? contentHash : portfolio.contentHash,
      ...(approvedSnapshot
        ? { approvedSnapshot, pendingDiffJson: null }
        : {}),
    },
  });

  await createUserNotification({
    userId: portfolio.userId,
    type: 'PORTFOLIO',
    title: data.status === 'APPROVED' ? 'Портфолио одобрено' : 'Портфолио отклонено',
    body:
      data.status === 'APPROVED'
        ? 'Ваше портфолио опубликовано. Его можно скачать с подписью портала.'
        : data.rejectReason || 'Исправьте замечания и отправьте снова.',
    meta: {
      href: data.status === 'APPROVED' ? `/portfolio/${portfolio.userId}` : '/dashboard/portfolio',
      status: data.status,
      audience: 'user',
      actorId: session.user.id,
      actorName: session.user.name || 'Модератор',
      actorLabel: 'Администрация сайта',
      handled: true,
    },
  });

  return NextResponse.json({ portfolio: updated });
}
