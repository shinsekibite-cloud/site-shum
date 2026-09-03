import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { RateLimiter } from '@/lib/rateLimit';
import {
  clientIpFromHeaders,
  isContentViewType,
  recordContentView,
  viewCookieHeader,
} from '@/lib/page-views';
import { headers } from 'next/headers';

const viewsRateLimiter = new RateLimiter(60 * 1000, 120, 'views');

export async function POST(req: Request) {
  try {
    const ip = (await clientIpFromHeaders()) || '0.0.0.0';
    if (!(await viewsRateLimiter.checkAsync(`views:${ip}`))) {
      // Soft: do not 429 guest beacons — skip count, keep page working
      return NextResponse.json({ ok: true, counted: false, viewCount: null, skipped: 'rate' });
    }

    const h = await headers();
    const purpose = `${h.get('sec-purpose') || ''} ${h.get('purpose') || ''}`.toLowerCase();
    const isPrefetch = purpose.includes('prefetch');

    const body = await req.json().catch(() => ({}));
    const typeRaw = String(body.type || body.contentType || '').toUpperCase();
    const id = String(body.id || body.contentId || '').trim();
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';

    if (!isContentViewType(typeRaw) || !id) {
      return NextResponse.json({ message: 'Укажите type и id' }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const result = await recordContentView({
      type: typeRaw,
      id,
      userId: session?.user?.id || null,
      clientDeviceId: deviceId,
      ip,
      userAgent: h.get('user-agent'),
      isPrefetch,
    });

    const res = NextResponse.json({
      ok: true,
      counted: result.counted,
      viewCount: result.viewCount,
      ecoAwarded: result.ecoAwarded ?? 0,
    });
    if (result.setCookieVid) {
      res.headers.append('Set-Cookie', viewCookieHeader(result.setCookieVid));
    }
    return res;
  } catch (e) {
    console.error('POST /api/views', e);
    return NextResponse.json({ message: 'Ошибка учёта просмотра' }, { status: 500 });
  }
}
