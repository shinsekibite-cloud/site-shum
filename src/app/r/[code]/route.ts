import { NextRequest, NextResponse } from 'next/server';
import { normalizeReferralCode, REF } from '@/lib/referrals';

export const dynamic = 'force-dynamic';

function publicOrigin(req: NextRequest) {
  const env = (process.env.NEXTAUTH_URL || '').replace(/\/$/, '');
  if (env && !/0\.0\.0\.0|127\.0\.0\.1|localhost/i.test(env)) return env;
  const xfProto = req.headers.get('x-forwarded-proto') || 'https';
  const xfHost = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'py.idivles.ru';
  return `${xfProto}://${xfHost}`.replace(/\/$/, '');
}

/** /r/CODE → /register?ref=CODE + cookie for attribution */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = normalizeReferralCode(decodeURIComponent(raw || ''));
  const url = new URL('/register', publicOrigin(req));
  if (code) url.searchParams.set('ref', code);

  const res = NextResponse.redirect(url);
  if (code) {
    res.cookies.set({
      name: REF.COOKIE,
      value: code,
      path: '/',
      maxAge: REF.COOKIE_DAYS * 24 * 3600,
      sameSite: 'lax',
      httpOnly: false,
      secure: url.protocol === 'https:',
    });
  }
  return res;
}
