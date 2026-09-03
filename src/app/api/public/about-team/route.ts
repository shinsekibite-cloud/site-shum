import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { resolvePublicIdentity } from '@/lib/privacy-alias';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  const viewerId = session?.user?.id || null;
  if (!viewerId) {
    return NextResponse.json({ message: 'Нужна авторизация' }, { status: 401 });
  }
  const isStaff = session?.user?.role === 'ADMIN' || session?.user?.role === 'MODERATOR';
  const team = await prisma.aboutFeaturedUser.findMany({
    where: { isVisible: true },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          nickname: true,
          image: true,
          publicCode: true,
          city: true,
          deletedAt: true,
          profileVisibility: true,
          blockedAt: true,
        },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });
  const members = team
    .filter((t) => !t.user.deletedAt && !t.user.blockedAt)
    .map((t) => {
      const identity = resolvePublicIdentity({
        target: {
          id: t.user.id,
          name: t.user.nickname || t.user.name,
          image: t.user.image,
          profileVisibility: t.user.profileVisibility,
        },
        viewerId,
        isStaff,
      });
      return {
        id: t.id,
        roleTitle: t.roleTitle,
        user: {
          id: t.user.id,
          name: identity.name,
          nickname: identity.aliased ? null : t.user.nickname,
          image: identity.image,
          publicCode: identity.aliased ? null : t.user.publicCode,
          city: identity.aliased ? null : t.user.city,
        },
      };
    });
  return NextResponse.json({ members });
}
