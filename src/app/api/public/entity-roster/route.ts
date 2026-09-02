import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { userHasFullAchievements } from '@/lib/achievement-gate';
import { areFriends } from '@/lib/social';
import { resolvePublicIdentity } from '@/lib/privacy-alias';

export const dynamic = 'force-dynamic';

type Kind = 'project' | 'club';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get('kind') as Kind | null;
  const id = (url.searchParams.get('id') || '').trim();
  if ((kind !== 'project' && kind !== 'club') || !id) {
    return NextResponse.json({ message: 'Некорректный запрос' }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  const viewerId = session?.user?.id || null;
  const isStaff = session?.user?.role === 'ADMIN' || session?.user?.role === 'MODERATOR';

  const entity =
    kind === 'project'
      ? await prisma.project.findUnique({
          where: { id },
          select: {
            id: true,
            applications: {
              where: { status: 'APPROVED' },
              orderBy: { updatedAt: 'desc' },
              take: 48,
              select: {
                id: true,
                user: {
                  select: { id: true, name: true, image: true, profileVisibility: true },
                },
              },
            },
            _count: { select: { applications: { where: { status: 'APPROVED' } } } },
          },
        })
      : await prisma.club.findUnique({
          where: { id },
          select: {
            id: true,
            curatorContact: true,
            curatorContactPublic: true,
            applications: {
              where: { status: 'APPROVED' },
              orderBy: { updatedAt: 'desc' },
              take: 48,
              select: {
                id: true,
                user: {
                  select: { id: true, name: true, image: true, profileVisibility: true },
                },
              },
            },
            _count: { select: { applications: { where: { status: 'APPROVED' } } } },
          },
        });

  if (!entity) return NextResponse.json({ message: 'Не найдено' }, { status: 404 });

  let applicationStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED' = 'NONE';
  if (viewerId) {
    const app = await prisma.application.findFirst({
      where:
        kind === 'project'
          ? { userId: viewerId, projectId: id }
          : { userId: viewerId, clubId: id },
      select: { status: true },
      orderBy: { createdAt: 'desc' },
    });
    if (app?.status === 'PENDING' || app?.status === 'APPROVED' || app?.status === 'REJECTED') {
      applicationStatus = app.status;
    }
  }

  const isMember = applicationStatus === 'APPROVED';
  const canRevealMembers = Boolean(isStaff) || (viewerId ? await userHasFullAchievements(viewerId) : false);

  let members: Array<{
    key: string;
    name: string;
    image: string | null;
    href: string | null;
    aliased: boolean;
  }> = [];

  if (canRevealMembers && entity.applications.length > 0) {
    const friendFlags = await Promise.all(
      entity.applications.map(async (m) => {
        if (!viewerId || viewerId === m.user.id) return true;
        return areFriends(viewerId, m.user.id);
      })
    );
    members = entity.applications.map((m, idx) => {
      const identity = resolvePublicIdentity({
        target: m.user,
        viewerId,
        isFriend: friendFlags[idx],
        isStaff,
      });
      return {
        key: m.id,
        name: identity.name || 'Участник',
        image: identity.image,
        href: identity.aliased ? null : `/u/${m.user.id}`,
        aliased: identity.aliased,
      };
    });
  }

  const clubRow = kind === 'club' ? (entity as { curatorContact?: string | null; curatorContactPublic?: boolean | null }) : null;
  const curatorPublic = clubRow ? clubRow.curatorContactPublic !== false : true;
  const showCuratorContact = Boolean(
    clubRow?.curatorContact && (curatorPublic || isMember || isStaff)
  );

  return NextResponse.json({
    memberCount: entity._count.applications,
    applicationStatus,
    isMember,
    isStaff,
    canRevealMembers,
    members,
    showCuratorContact,
    curatorContact: showCuratorContact ? clubRow?.curatorContact || null : null,
  });
}
