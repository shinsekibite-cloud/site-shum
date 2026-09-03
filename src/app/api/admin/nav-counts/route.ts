import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canAccessAdminPath, parsePermissions } from '@/lib/acl-shared';

function unauthorized() {
  return NextResponse.json({ message: 'Нет доступа' }, { status: 403 });
}

/**
 * Lightweight pending counts for admin nav badges.
 * Only returns counters the caller can access.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return unauthorized();
    const role = session.user.role || '';
    if (role !== 'ADMIN' && role !== 'MODERATOR') return unauthorized();

    const perms = parsePermissions(session.user.permissions);
    const can = (path: string) => canAccessAdminPath(role, session.user.permissions, path);
    const isAdmin = role === 'ADMIN';

    const [moderation, applications, bookings, portfolios] = await Promise.all([
      can('/admin/moderation')
        ? prisma.contentFlag.count({ where: { status: 'OPEN' } })
        : Promise.resolve(0),
      can('/admin/applications')
        ? prisma.application.count({ where: { status: 'PENDING' } })
        : Promise.resolve(0),
      can('/admin/bookings')
        ? prisma.booking.count({
            where: { status: 'PENDING', endTime: { gte: new Date() } },
          })
        : Promise.resolve(0),
      can('/admin/portfolios')
        ? prisma.userPortfolio.count({ where: { status: 'PENDING' } })
        : Promise.resolve(0),
    ]);

    return NextResponse.json({
      counts: {
        '/admin/moderation': moderation,
        '/admin/applications': applications,
        '/admin/bookings': bookings,
        '/admin/portfolios': portfolios,
      },
      // Convenience aliases
      moderation,
      applications,
      bookings,
      portfolios,
      total:
        (can('/admin/moderation') ? moderation : 0) +
        (can('/admin/applications') ? applications : 0) +
        (can('/admin/bookings') ? bookings : 0) +
        (can('/admin/portfolios') ? portfolios : 0),
      permissions: isAdmin ? ['*'] : perms,
    });
  } catch (e) {
    console.error('GET /api/admin/nav-counts', e);
    return NextResponse.json({ message: 'Ошибка' }, { status: 500 });
  }
}
