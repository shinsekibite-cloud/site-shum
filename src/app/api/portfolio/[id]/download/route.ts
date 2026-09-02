import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  buildPortfolioHtml,
  hashPortfolioContent,
  toPortfolioPayload,
} from '@/lib/portfolio';
import { canViewFullProfile, type ProfileVisibility } from '@/lib/social';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const url = new URL(req.url);
  const rawMode = (url.searchParams.get('mode') || '').toLowerCase();
  const mode =
    rawMode === 'print' || rawMode === 'download' ? rawMode : ('view' as const);

  const portfolio = await prisma.userPortfolio.findFirst({
    where: {
      OR: [{ userId: id }, { publicSlug: id }, { user: { publicCode: id } }],
      status: 'APPROVED',
    },
    include: {
      sections: { orderBy: { sortOrder: 'asc' } },
      certificates: { orderBy: { sortOrder: 'asc' } },
      achievementLinks: { orderBy: { sortOrder: 'asc' } },
      user: {
        select: {
          id: true,
          name: true,
          nickname: true,
          city: true,
          image: true,
          publicCode: true,
          profileVisibility: true,
          deletedAt: true,
        },
      },
    },
  });

  if (!portfolio || portfolio.user.deletedAt) {
    return NextResponse.json({ message: 'Портфолио не найдено' }, { status: 404 });
  }

  const me = session?.user?.id;
  if (!me) {
    return NextResponse.json(
      { message: 'Войдите, чтобы скачать портфолио', requiresAuth: true },
      { status: 401 }
    );
  }

  const isSelf = me === portfolio.userId;
  const isStaff = session?.user?.role === 'ADMIN' || session?.user?.role === 'MODERATOR';
  let isFriend = false;
  if (!isSelf) {
    const row = await prisma.friendship.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterId: me, addresseeId: portfolio.userId },
          { requesterId: portfolio.userId, addresseeId: me },
        ],
      },
      select: { id: true },
    });
    isFriend = Boolean(row);
  }

  const allowed =
    isSelf ||
    isStaff ||
    canViewFullProfile({
      visibility: (portfolio.user.profileVisibility || 'FRIENDS') as ProfileVisibility,
      isSelf,
      isFriend,
      authenticated: true,
    });
  if (!allowed) {
    return NextResponse.json({ message: 'Нет доступа' }, { status: 403 });
  }

  const payload = toPortfolioPayload(portfolio);
  const contentHash = portfolio.contentHash || hashPortfolioContent(payload);
  const html = await buildPortfolioHtml({
    payload,
    contentHash,
    userId: portfolio.userId,
    issuedAt: (portfolio.publishedAt || new Date()).toISOString(),
    mode,
  });

  const fileBase = `portfolio-${portfolio.user.publicCode || portfolio.userId}`;
  // Always inline so the page can rasterize PDF certs; download happens via JS blob.
  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `inline; filename="${fileBase}.html"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
