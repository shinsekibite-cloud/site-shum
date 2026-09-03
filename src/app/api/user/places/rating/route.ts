import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { evaluateAchievements } from '@/lib/award-achievements';
import { placesRateLimiter, rateLimitJson } from '@/lib/rateLimit';

async function recalcPlaceRating(placeId: string) {
  const agg = await prisma.placeRating.aggregate({
    where: { placeId },
    _avg: { score: true },
    _count: { _all: true },
  });
  const ratingCount = agg._count._all;
  const ratingAvg = ratingCount ? Math.round((agg._avg.score || 0) * 10) / 10 : 0;
  await prisma.place.update({
    where: { id: placeId },
    data: { ratingAvg, ratingCount },
  });
  return { ratingAvg, ratingCount };
}

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
    const score = Number(body.score);
    if (!placeId) {
      return NextResponse.json({ message: 'Не указано место' }, { status: 400 });
    }
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      return NextResponse.json({ message: 'Оценка должна быть от 1 до 5' }, { status: 400 });
    }

    const place = await prisma.place.findFirst({
      where: { id: placeId, status: 'PUBLISHED' },
      select: { id: true },
    });
    if (!place) {
      return NextResponse.json({ message: 'Место не найдено' }, { status: 404 });
    }

    await prisma.placeRating.upsert({
      where: { userId_placeId: { userId, placeId } },
      create: { userId, placeId, score },
      update: { score },
    });

    const stats = await recalcPlaceRating(placeId);
    void evaluateAchievements(userId);

    return NextResponse.json({ score, ...stats });
  } catch (e) {
    console.error('POST /api/user/places/rating', e);
    return NextResponse.json({ message: 'Не удалось сохранить оценку' }, { status: 500 });
  }
}
