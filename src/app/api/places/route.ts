import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PLACE_CATEGORIES, normalizePlaceCategory } from '@/lib/places';
import { placesReadRateLimiter, rateLimitJson } from '@/lib/rateLimit';

export async function GET(req: Request) {
  try {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip')?.trim() ||
      '127.0.0.1';
    if (!(await placesReadRateLimiter.checkAsync(`places-r:${ip}`))) {
      return NextResponse.json(rateLimitJson('Слишком много запросов к каталогу мест.'), {
        status: 429,
      });
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    const categoryRaw = (searchParams.get('category') || '').trim();
    const category =
      categoryRaw && categoryRaw !== 'ALL' && (PLACE_CATEGORIES as readonly string[]).includes(categoryRaw.toUpperCase())
        ? normalizePlaceCategory(categoryRaw)
        : null;
    const district = (searchParams.get('district') || '').trim();

    const places = await prisma.place.findMany({
      where: {
        status: 'PUBLISHED',
        ...(category ? { category } : {}),
        ...(district && district !== 'ALL' ? { district: { contains: district } } : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q } },
                { summary: { contains: q } },
                { description: { contains: q } },
                { address: { contains: q } },
                { district: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { ratingAvg: 'desc' }, { title: 'asc' }],
      select: {
        id: true,
        title: true,
        slug: true,
        summary: true,
        category: true,
        address: true,
        district: true,
        image: true,
        lat: true,
        lng: true,
        ratingAvg: true,
        ratingCount: true,
        favoritesCount: true,
        bestSeason: true,
        visitTime: true,
        priceHint: true,
        sortOrder: true,
      },
    });

    return NextResponse.json({ places });
  } catch (e) {
    console.error('GET /api/places', e);
    return NextResponse.json({ message: 'Не удалось загрузить места' }, { status: 500 });
  }
}
