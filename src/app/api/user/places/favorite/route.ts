import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { evaluateAchievements } from '@/lib/award-achievements';
import { placesRateLimiter, rateLimitJson } from '@/lib/rateLimit';

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
    if (!placeId) {
      return NextResponse.json({ message: 'Не указано место' }, { status: 400 });
    }

    const place = await prisma.place.findFirst({
      where: { id: placeId, status: 'PUBLISHED' },
      select: { id: true },
    });
    if (!place) {
      return NextResponse.json({ message: 'Место не найдено' }, { status: 404 });
    }

    const existing = await prisma.placeFavorite.findUnique({
      where: { userId_placeId: { userId, placeId } },
    });

    let favorited: boolean;
    if (existing) {
      await prisma.$transaction([
        prisma.placeFavorite.delete({ where: { id: existing.id } }),
        prisma.place.update({
          where: { id: placeId },
          data: { favoritesCount: { decrement: 1 } },
        }),
      ]);
      favorited = false;
    } else {
      await prisma.$transaction([
        prisma.placeFavorite.create({ data: { userId, placeId } }),
        prisma.place.update({
          where: { id: placeId },
          data: { favoritesCount: { increment: 1 } },
        }),
      ]);
      favorited = true;
    }

    const updated = await prisma.place.findUnique({
      where: { id: placeId },
      select: { favoritesCount: true },
    });
    if (updated && updated.favoritesCount < 0) {
      await prisma.place.update({ where: { id: placeId }, data: { favoritesCount: 0 } });
    }

    void evaluateAchievements(userId);

    return NextResponse.json({
      favorited,
      favoritesCount: Math.max(0, updated?.favoritesCount ?? 0),
    });
  } catch (e) {
    console.error('POST /api/user/places/favorite', e);
    return NextResponse.json({ message: 'Не удалось обновить избранное' }, { status: 500 });
  }
}
