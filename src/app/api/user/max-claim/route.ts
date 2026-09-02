import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { consumeMaxClaimToken } from '@/lib/messenger-link';
import { bindMaxUserIdToAccount } from '@/lib/messenger-bind-max';
import { getSharedRedis } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function sameOriginOk(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!origin) return true; // same-origin navigational form POST often omits Origin
  try {
    return new URL(origin).host === req.nextUrl.host;
  } catch {
    return false;
  }
}

async function rateLimit(key: string, max = 8, windowSec = 600) {
  const redis = getSharedRedis();
  if (!redis) return true;
  const k = `yp:max-claim-rl:${key}`;
  const n = await redis.incr(k);
  if (n === 1) await redis.expire(k, windowSec);
  return n <= max;
}

/** Confirm one-time MAX claim bind (authenticated POST from /bind/max). */
export async function POST(req: NextRequest) {
  if (!sameOriginOk(req)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '0';
  if (!(await rateLimit(`u:${session.user.id}`)) || !(await rateLimit(`ip:${ip}`))) {
    return NextResponse.redirect(
      new URL('/dashboard/settings?section=messengers&bound=error&reason=rate', req.url)
    );
  }

  let token = '';
  const ctype = req.headers.get('content-type') || '';
  if (ctype.includes('application/json')) {
    const body = await req.json().catch(() => ({}));
    token = String(body.t || body.token || '').trim();
  } else {
    const form = await req.formData().catch(() => null);
    token = String(form?.get('t') || '').trim();
  }

  if (!token) {
    return NextResponse.redirect(new URL('/bind/max', req.url));
  }

  const consumed = await consumeMaxClaimToken(token);
  if (!consumed.ok) {
    const q =
      consumed.reason === 'expired'
        ? 'expired'
        : consumed.reason === 'used'
          ? 'used'
          : 'invalid';
    return NextResponse.redirect(
      new URL(`/dashboard/settings?section=messengers&bound=error&reason=${q}`, req.url)
    );
  }

  const result = await bindMaxUserIdToAccount({
    userId: session.user.id,
    maxUserId: consumed.maxUserId,
  });

  if (!result.ok) {
    return NextResponse.redirect(
      new URL(
        `/dashboard/settings?section=messengers&bound=error&reason=${encodeURIComponent(result.message)}`,
        req.url
      )
    );
  }

  return NextResponse.redirect(
    new URL('/dashboard/settings?section=messengers&bound=max', req.url)
  );
}
