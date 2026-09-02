import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { canBypassMaintenance, isMaintenanceBypassPath } from '@/lib/maintenance';
import { canAccessAdminPath, canUseScanner, isTechRole } from '@/lib/acl-shared';
import { moduleKeyForPath } from '@/lib/module-flags-edge';

// Public pages are ISR (root layout revalidate=60). A per-request script nonce
// cannot match cached HTML, and 'strict-dynamic' disables host allowlists —
// Chrome then blocks Next.js inline bootstraps and Yandex Metrika tag.js.
// Keep 'unsafe-inline' for Next RSC/bootstrap; allow Metrika by host.
function buildCsp(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://mc.yandex.ru https://mc.yandex.com https://yandex.ru https://*.yandex.ru https://yastatic.net",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https: http:",
    "font-src 'self' data:",
    "connect-src 'self' https://mc.yandex.ru https://*.yandex.ru wss: https:",
    "media-src 'self' blob: https://vk.com https://*.vk.com https://vk.ru https://*.vk.ru",
    "frame-src 'self' https://yandex.ru https://*.yandex.ru https://vk.com https://*.vk.com https://vk.ru https://*.vk.ru https://gosuslugi.ru https://*.gosuslugi.ru https://pos.gosuslugi.ru",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

type PublicStatusPayload = {
  maintenanceMode?: boolean;
  modules?: Record<string, boolean>;
  offModes?: Record<string, 'soon' | 'hide'>;
  publicEventsVisibility?: boolean;
  galleryPageEnabled?: boolean;
  galleryPublicEnabled?: boolean;
};

/** In-process TTL cache — proxy was self-fetching status 1–2× per request and burning the single core. */
const STATUS_TTL_MS = 30_000;
let statusCache: { at: number; data: PublicStatusPayload } | null = null;
let statusInflight: Promise<PublicStatusPayload> | null = null;

async function fetchPublicStatus(req: NextRequest): Promise<PublicStatusPayload> {
  const now = Date.now();
  if (statusCache && now - statusCache.at < STATUS_TTL_MS) {
    return statusCache.data;
  }
  if (statusInflight) return statusInflight;

  statusInflight = (async () => {
    const headers = { 'x-maintenance-check': '1' };
    const candidates = [
      'http://127.0.0.1:3000/api/public/status',
      process.env.INTERNAL_APP_URL
        ? new URL('/api/public/status', process.env.INTERNAL_APP_URL).toString()
        : '',
      new URL('/api/public/status', req.nextUrl.origin).toString(),
    ].filter(Boolean);

    let data: PublicStatusPayload = {};
    for (const statusUrl of candidates) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2000);
      try {
        const res = await fetch(statusUrl, {
          headers,
          cache: 'no-store',
          signal: ctrl.signal,
        });
        if (!res.ok) continue;
        data = await res.json();
        break;
      } catch {
        /* try next */
      } finally {
        clearTimeout(timer);
      }
    }
    statusCache = { at: Date.now(), data };
    statusInflight = null;
    return data;
  })().catch((err) => {
    statusInflight = null;
    throw err;
  });

  try {
    return await statusInflight;
  } catch {
    return statusCache?.data || {};
  }
}

async function checkMaintenance(req: NextRequest, role?: string | null) {
  const pathname = req.nextUrl.pathname;
  if (isMaintenanceBypassPath(pathname)) return null;
  if (canBypassMaintenance(role)) return null;

  const data = await fetchPublicStatus(req);
  if (data.maintenanceMode && pathname !== '/maintenance') {
    return NextResponse.redirect(new URL('/maintenance', req.url));
  }
  return null;
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-pathname', pathname);

  const csp = buildCsp();
  requestHeaders.set('Content-Security-Policy', csp);
  const withCsp = (res: NextResponse) => {
    res.headers.set('Content-Security-Policy', csp);
    const ref = (req.nextUrl.searchParams.get('ref') || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '')
      .slice(0, 24);
    if (ref) {
      res.cookies.set({
        name: 'yp_ref',
        value: ref,
        path: '/',
        maxAge: 30 * 24 * 3600,
        sameSite: 'lax',
        httpOnly: false,
        secure: req.nextUrl.protocol === 'https:',
      });
    }
    return res;
  };

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });
  const role = token?.role as string | undefined;
  const permissions = (token?.permissions as string) || '';
  const mustChangePassword = Boolean((token as { mustChangePassword?: boolean } | null)?.mustChangePassword);

  // CSRF defense-in-depth for cookie-auth mutating APIs (skip webhooks / NextAuth / public / cron).
  const method = req.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const skipCsrf =
      pathname.startsWith('/api/auth') ||
      pathname.startsWith('/api/integrations/') ||
      pathname.startsWith('/api/public/') ||
      pathname === '/api/health' ||
      pathname === '/api/vk-sync' ||
      pathname.startsWith('/api/cron') ||
      pathname.startsWith('/api/captcha');
    const needsCsrf =
      !skipCsrf &&
      (pathname.startsWith('/api/admin') ||
        pathname.startsWith('/api/ops') ||
        pathname.startsWith('/api/upload') ||
        pathname.startsWith('/api/user') ||
        pathname.startsWith('/api/applications') ||
        pathname.startsWith('/api/bookings') ||
        pathname.startsWith('/api/group-chat') ||
        pathname.startsWith('/api/messages') ||
        pathname.startsWith('/api/friends') ||
        pathname.startsWith('/api/vacancies') ||
        pathname.startsWith('/api/employers') ||
        pathname.startsWith('/api/contests') ||
        pathname.startsWith('/api/scanner') ||
        pathname.startsWith('/api/entity-invites') ||
        pathname.startsWith('/api/check-in'));
    if (needsCsrf) {
      const { assertSameOrigin } = await import('@/lib/csrf-origin');
      const denied = assertSameOrigin(req);
      if (denied) return denied;
    }
  }

  // Staff first-login: must set own password before using the site
  if (
    token &&
    mustChangePassword &&
    !pathname.startsWith('/change-password') &&
    !pathname.startsWith('/api/auth') &&
    !pathname.startsWith('/_next') &&
    pathname !== '/login' &&
    pathname !== '/forgot-password' &&
    pathname !== '/reset-password'
  ) {
    return NextResponse.redirect(new URL('/change-password', req.url));
  }

  const maintenanceRedirect = await checkMaintenance(req, role);
  if (maintenanceRedirect) return maintenanceRedirect;

  // Guest-only visibility for afisha / gallery (page HTML is ISR; gate here).
  if (!token) {
    const vis = await fetchPublicStatus(req);
    if (
      (pathname === '/events' || pathname.startsWith('/events/')) &&
      vis.publicEventsVisibility === false
    ) {
      return NextResponse.redirect(new URL('/login?callbackUrl=/events', req.url));
    }
    if (pathname === '/gallery' || pathname.startsWith('/gallery/')) {
      if (vis.galleryPublicEnabled === false && vis.galleryPageEnabled !== false) {
        return NextResponse.redirect(new URL('/login?callbackUrl=/gallery', req.url));
      }
    }
  }

  if (!isTechRole(role) && !pathname.startsWith('/unavailable')) {
    const key = moduleKeyForPath(pathname);
    // ADMIN always keeps system/bots consoles even if publicKill flags are off
    const adminBypass =
      role === 'ADMIN' && (key === 'server_status' || key === 'bots');
    if (key && key !== 'maintenance' && !adminBypass) {
      const data = await fetchPublicStatus(req);
      if (data.modules && data.modules[key] === false) {
        const mode = data.offModes?.[key] === 'soon' ? 'soon' : 'hide';
        if (pathname.startsWith('/api/')) {
          return NextResponse.json(
            {
              message:
                mode === 'soon'
                  ? 'Раздел в разработке'
                  : 'Модуль временно отключён',
              code: mode === 'soon' ? 'MODULE_SOON' : 'MODULE_DISABLED',
              module: key,
              mode,
            },
            { status: 503 }
          );
        }
        const q = new URLSearchParams({ m: key, mode });
        return NextResponse.redirect(new URL(`/unavailable?${q.toString()}`, req.url));
      }
    }
  }

  if ((pathname === '/login' || pathname === '/register') && token) {
    const callbackUrl = req.nextUrl.searchParams.get('callbackUrl');
    if (
      callbackUrl &&
      callbackUrl.startsWith('/') &&
      !callbackUrl.startsWith('//') &&
      !callbackUrl.startsWith('/login') &&
      !callbackUrl.startsWith('/register')
    ) {
      return NextResponse.redirect(new URL(callbackUrl, req.url));
    }
    if (role === 'SCANNER') {
      return NextResponse.redirect(new URL('/scanner', req.url));
    }
    if (isTechRole(role)) {
      return NextResponse.redirect(new URL('/ops', req.url));
    }
    if (role === 'ADMIN' || role === 'MODERATOR') {
      return NextResponse.redirect(new URL('/admin', req.url));
    }
    if (pathname === '/login') {
      const data = await fetchPublicStatus(req);
      if (data.maintenanceMode) {
        return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
      }
    }
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  if (pathname.startsWith('/ops')) {
    if (!token || !isTechRole(role)) {
      return NextResponse.redirect(new URL('/', req.url));
    }
  }

  if (pathname.startsWith('/scanner') || pathname.startsWith('/scan')) {
    if (!token) {
      return NextResponse.redirect(
        new URL(`/login?callbackUrl=${encodeURIComponent(pathname)}&staff=1`, req.url)
      );
    }
    if (!canUseScanner(role, permissions)) {
      return NextResponse.redirect(
        new URL(role === 'USER' || role === 'PARTICIPANT' ? '/dashboard' : '/admin', req.url)
      );
    }
  }

  if (pathname.startsWith('/admin')) {
    if (!token) {
      return NextResponse.redirect(new URL('/login?callbackUrl=/admin&staff=1', req.url));
    }
    if (role === 'SCANNER') {
      return NextResponse.redirect(new URL('/scanner', req.url));
    }
    if (isTechRole(role)) {
      return NextResponse.redirect(new URL('/ops', req.url));
    }
    if (role !== 'ADMIN' && role !== 'MODERATOR') {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
    if (!canAccessAdminPath(role, permissions, pathname)) {
      return NextResponse.redirect(new URL('/admin?denied=1', req.url));
    }
  }

  if (pathname.startsWith('/presentation') || pathname.startsWith('/downloads/youngportal-presentation')) {
    if (!token) {
      return NextResponse.redirect(
        new URL(`/login?callbackUrl=${encodeURIComponent(pathname)}&staff=1`, req.url)
      );
    }
    if (role !== 'ADMIN' && role !== 'MODERATOR' && !isTechRole(role)) {
      return NextResponse.redirect(new URL('/dashboard?denied=presentation', req.url));
    }
  }

  if (
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/friends') ||
    pathname.startsWith('/messages') ||
    pathname.startsWith('/tickets') ||
    pathname.startsWith('/contests') ||
    pathname.startsWith('/vacancies') ||
    Boolean(pathname.match(/^\/spaces\/[^/]+\/book$/))
  ) {
    if (!token) {
      const cb = `${pathname}${req.nextUrl.search || ''}`;
      return NextResponse.redirect(new URL(`/login?callbackUrl=${encodeURIComponent(cb)}`, req.url));
    }
    if (role === 'SCANNER') {
      return NextResponse.redirect(new URL('/scanner', req.url));
    }
    if (isTechRole(role)) {
      return NextResponse.redirect(new URL('/ops', req.url));
    }
  }

  return withCsp(
    NextResponse.next({
      request: { headers: requestHeaders },
    })
  );
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|xml)$).*)',
  ],
};
