import { NextResponse } from 'next/server';
import { geocodeAddress } from '@/lib/geocode';
import { yandexMapsDirectionsUrl, type YandexRouteMode } from '@/lib/yandex-maps';
import { mapsRateLimiter } from '@/lib/rateLimit';

const MODES = new Set(['auto', 'mt', 'pd', 'bc']);

export async function GET(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
  if (!(await mapsRateLimiter.checkAsync(`maps:${ip}`))) {
    return NextResponse.json({ message: 'Слишком много запросов к картам' }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();
  const modeRaw = (searchParams.get('mode') || 'auto').trim();
  const mode = (MODES.has(modeRaw) ? modeRaw : 'auto') as YandexRouteMode;

  if (!q) {
    return NextResponse.redirect(new URL('https://yandex.ru/maps/', req.url));
  }

  const point = await geocodeAddress(q);
  const target =
    yandexMapsDirectionsUrl(q, mode, point) ||
    `https://yandex.ru/maps/?${new URLSearchParams({ text: q, mode: 'search' }).toString()}`;

  // If geocode failed, directions helper returns our own API URL again — avoid loop
  const href = target.startsWith('/api/')
    ? `https://yandex.ru/maps/?${new URLSearchParams({ text: q, mode: 'search' }).toString()}`
    : target;

  return NextResponse.redirect(href, 302);
}
