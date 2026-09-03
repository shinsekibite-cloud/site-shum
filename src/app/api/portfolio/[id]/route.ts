import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canViewFullProfile, type ProfileVisibility } from '@/lib/social';
import { toPortfolioPayload } from '@/lib/portfolio';
import { looksLikePublicCode, publicCodeLookupVariants } from '@/lib/public-id';

async function findUser(idOrCode: string) {
  const byId = await prisma.user.findUnique({
    where: { id: idOrCode },
    select: {
      id: true,
      name: true,
      nickname: true,
      image: true,
      city: true,
      publicCode: true,
      profileVisibility: true,
      deletedAt: true,
      blockedAt: true,
    },
  });
  if (byId) return byId;
  if (looksLikePublicCode(idOrCode) || idOrCode.toUpperCase().startsWith('YM-')) {
    for (const code of publicCodeLookupVariants(idOrCode)) {
      const u = await prisma.user.findUnique({
        where: { publicCode: code },
        select: {
          id: true,
          name: true,
          nickname: true,
          image: true,
          city: true,
          publicCode: true,
          profileVisibility: true,
          deletedAt: true,
          blockedAt: true,
        },
      });
      if (u) return u;
    }
  }
  return prisma.user.findFirst({
    where: { nickname: { equals: idOrCode, mode: 'insensitive' } },
    select: {
      id: true,
      name: true,
      nickname: true,
      image: true,
      city: true,
      publicCode: true,
      profileVisibility: true,
      deletedAt: true,
      blockedAt: true,
    },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const me = session?.user?.id;
  if (!me) {
    return NextResponse.json(
      {
        message: 'Войдите, чтобы открыть портфолио. Гостям персональные данные недоступны.',
        requiresAuth: true,
      },
      { status: 401 }
    );
  }

  const user = await findUser(decodeURIComponent(id));
  if (!user || user.deletedAt || user.blockedAt) {
    return NextResponse.json({ message: 'Не найдено' }, { status: 404 });
  }

  const isSelf = me === user.id;
  const isStaff = session?.user?.role === 'ADMIN' || session?.user?.role === 'MODERATOR';

  let isFriend = false;
  if (me && !isSelf) {
    const row = await prisma.friendship.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterId: me, addresseeId: user.id },
          { requesterId: user.id, addresseeId: me },
        ],
      },
      select: { id: true },
    });
    isFriend = Boolean(row);
  }

  const full =
    isStaff ||
    canViewFullProfile({
      visibility: (user.profileVisibility || 'FRIENDS') as ProfileVisibility,
      isSelf,
      isFriend,
      authenticated: true,
    });

  if (!full && !isSelf) {
    return NextResponse.json({ message: 'Портфолио скрыто настройками профиля' }, { status: 403 });
  }

  const portfolio = await prisma.userPortfolio.findUnique({
    where: { userId: user.id },
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
        },
      },
    },
  });

  if (!portfolio) {
    return NextResponse.json({ message: 'Портфолио ещё не создано' }, { status: 404 });
  }

  const visible = portfolio.status === 'APPROVED' || isSelf || isStaff;
  if (!visible) {
    return NextResponse.json({ message: 'Портфолио ещё не опубликовано' }, { status: 404 });
  }

  return NextResponse.json({
    portfolio,
    payload: toPortfolioPayload(portfolio),
    canDownload: portfolio.status === 'APPROVED',
    isSelf,
  });
}
