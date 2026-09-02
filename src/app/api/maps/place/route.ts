import { NextResponse } from 'next/server';
import { geocodeAddress } from '@/lib/geocode';
import { yandexMapsPlaceUrl } from '@/lib/yandex-maps';
import { mapsRateLimiter } from '@/lib/rateLimit';

export async function GET(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
  if (!(await mapsRateLimiter.checkAsync(`maps:${ip}`))) {
    return NextResponse.json({ message: 'Слишком много запросов к картам' }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();

  if (!q) {
    return NextResponse.redirect(new URL('https://yandex.ru/maps/', req.url));
  }

  const point = await geocodeAddress(q);
  const target =
    yandexMapsPlaceUrl(q, point) ||
    `https://yandex.ru/maps/?${new URLSearchParams({ text: q, mode: 'search' }).toString()}`;

  const href = target.startsWith('/api/')
    ? `https://yandex.ru/maps/?${new URLSearchParams({ text: q, mode: 'search' }).toString()}`
    : target;

  return NextResponse.redirect(href, 302);
}
