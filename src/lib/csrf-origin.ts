/**
 * Same-origin guard for mutating API routes (CSRF defense-in-depth).
 * Allows missing Origin on same-site navigations that send only Referer.
 */
import { NextResponse } from 'next/server';

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

export function assertSameOrigin(req: Request): NextResponse | null {
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  if (!host) return null;

  const allowed = new Set(
    [host, process.env.NEXTAUTH_URL ? hostOf(process.env.NEXTAUTH_URL) : null].filter(Boolean) as string[]
  );

  const check = (raw: string | null) => {
    const h = hostOf(raw);
    return !h || allowed.has(h);
  };

  if (!origin && !referer) {
    /* Some WebViews omit Origin/Referer but still send Sec-Fetch-Site. */
    const site = (req.headers.get('sec-fetch-site') || '').toLowerCase();
    if (site === 'same-origin' || site === 'same-site' || site === 'none') return null;
    return NextResponse.json(
      { message: 'Origin required', code: 'CSRF_ORIGIN' },
      { status: 403 }
    );
  }
  if (origin && !check(origin)) {
    return NextResponse.json({ message: 'Origin denied', code: 'CSRF_ORIGIN' }, { status: 403 });
  }
  if (!origin && referer && !check(referer)) {
    return NextResponse.json({ message: 'Referer denied', code: 'CSRF_REFERER' }, { status: 403 });
  }
  return null;
}
