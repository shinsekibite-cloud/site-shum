import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSiteIdentity, isLocalOrigin, normalizeOrigin } from '@/lib/site-identity';

async function resolvePublicOrigin(req: Request) {
  const identity = await getSiteIdentity();
  if (identity.publicOrigin && !isLocalOrigin(identity.publicOrigin)) return identity.publicOrigin;
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (host && !/0\.0\.0\.0|127\.0\.0\.1/i.test(host)) {
    return normalizeOrigin(`${proto}://${host}`) || identity.publicOrigin;
  }
  return identity.publicOrigin;
}

/** Resolve friend-invite token → redirect to public profile with invite query. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const clean = (token || '').trim();
    const origin = await resolvePublicOrigin(req);
    if (!clean || clean.length > 64) {
      return NextResponse.redirect(`${origin}/friends`);
    }

    const user = await prisma.user.findFirst({
      where: {
        friendInviteToken: clean,
        deletedAt: null,
        profileVisibility: 'PRIVATE',
      },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.redirect(`${origin}/friends?invite=invalid`);
    }

    return NextResponse.redirect(
      `${origin}/u/${user.id}?invite=${encodeURIComponent(clean)}`
    );
  } catch (error) {
    console.error('GET /api/invite/[token]', error);
    const origin = await resolvePublicOrigin(req).catch(() => 'https://py.idivles.ru');
    return NextResponse.redirect(`${origin}/friends`);
  }
}
