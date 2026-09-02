import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { assertCleanText, ProfanityError } from '@/lib/censor';
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
    const text = String(body.body || '').trim();
    if (!placeId) {
      return NextResponse.json({ message: 'Не указано место' }, { status: 400 });
    }
    if (text.length < 10) {
      return NextResponse.json({ message: 'Отзыв слишком короткий (минимум 10 символов)' }, { status: 400 });
    }
    if (text.length > 2000) {
      return NextResponse.json({ message: 'Отзыв слишком длинный (максимум 2000 символов)' }, { status: 400 });
    }

    try {
      assertCleanText(text);
    } catch (e) {
      if (e instanceof ProfanityError) {
        return NextResponse.json({ message: e.message || 'Текст не прошёл проверку' }, { status: 400 });
      }
      throw e;
    }

    const place = await prisma.place.findFirst({
      where: { id: placeId, status: 'PUBLISHED' },
      select: { id: true },
    });
    if (!place) {
      return NextResponse.json({ message: 'Место не найдено' }, { status: 404 });
    }

    const review = await prisma.placeReview.create({
      data: {
        userId,
        placeId,
        body: text,
        status: 'PENDING',
      },
      select: { id: true, status: true, createdAt: true },
    });

    return NextResponse.json({
      review,
      message: 'Отзыв отправлен на модерацию',
    });
  } catch (e) {
    console.error('POST /api/user/places/review', e);
    return NextResponse.json({ message: 'Не удалось отправить отзыв' }, { status: 500 });
  }
}
