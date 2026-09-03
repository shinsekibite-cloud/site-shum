import { prisma } from '@/lib/prisma';
import { ONLINE_WINDOW_MS } from '@/lib/presence';

export type OnlineUsersQuery = {
  q?: string;
  role?: string;
  status?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  limit?: number;
};

export async function queryOnlineUsers(opts: OnlineUsersQuery = {}) {
  const q = (opts.q || '').trim();
  const role = (opts.role || '').trim().toUpperCase();
  const status = (opts.status || 'online').trim();
  const sort = (opts.sort || 'active').trim();
  const order = opts.order === 'asc' ? 'asc' : 'desc';
  const limit = Math.min(500, Math.max(10, opts.limit || 100));

  const now = Date.now();
  const onlineSince = new Date(now - ONLINE_WINDOW_MS);
  const recentSince = new Date(now - 24 * 60 * 60 * 1000);

  const where: Record<string, unknown> = { deletedAt: null };
  if (role && ['USER', 'PARTICIPANT', 'MODERATOR', 'ADMIN', 'SCANNER', 'TECH'].includes(role)) {
    where.role = role;
  }
  if (status === 'online') where.lastActiveAt = { gte: onlineSince };
  else if (status === 'recent') where.lastActiveAt = { gte: recentSince };
  if (q) {
    where.OR = [
      { email: { contains: q, mode: 'insensitive' } },
      { name: { contains: q, mode: 'insensitive' } },
      { nickname: { contains: q, mode: 'insensitive' } },
      { publicCode: { contains: q, mode: 'insensitive' } },
    ];
  }

  const orderBy =
    sort === 'name'
      ? { name: order }
      : sort === 'role'
        ? { role: order }
        : { lastActiveAt: order };

  const [users, onlineCount, recentCount, totalUsers] = await Promise.all([
    prisma.user.findMany({
      where,
      take: limit,
      orderBy: orderBy as any,
      select: {
        id: true,
        name: true,
        email: true,
        nickname: true,
        publicCode: true,
        role: true,
        lastActiveAt: true,
        onlineVisibility: true,
        image: true,
        city: true,
        createdAt: true,
        _count: {
          select: {
            loginEvents: true,
            actionLogs: true,
            bookings: true,
            applications: true,
          },
        },
      },
    }),
    prisma.user.count({ where: { deletedAt: null, lastActiveAt: { gte: onlineSince } } }),
    prisma.user.count({ where: { deletedAt: null, lastActiveAt: { gte: recentSince } } }),
    prisma.user.count({ where: { deletedAt: null } }),
  ]);

  const items = users.map((u) => {
    const idleMs = u.lastActiveAt ? now - u.lastActiveAt.getTime() : null;
    const online = Boolean(u.lastActiveAt && u.lastActiveAt >= onlineSince);
    const loadScore =
      (u._count.actionLogs || 0) * 2 +
      (u._count.loginEvents || 0) +
      (u._count.bookings || 0) * 3 +
      (u._count.applications || 0) * 2;
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      nickname: u.nickname,
      publicCode: u.publicCode,
      role: u.role,
      image: u.image,
      city: u.city,
      lastActiveAt: u.lastActiveAt?.toISOString() || null,
      onlineVisibility: u.onlineVisibility,
      online,
      idleSec: idleMs != null ? Math.max(0, Math.floor(idleMs / 1000)) : null,
      loadScore,
      activity: u._count,
      createdAt: u.createdAt.toISOString(),
    };
  });

  if (sort === 'requests' || sort === 'load') {
    items.sort((a, b) => (order === 'asc' ? a.loadScore - b.loadScore : b.loadScore - a.loadScore));
  }

  return {
    collectedAt: new Date().toISOString(),
    windowSec: Math.floor(ONLINE_WINDOW_MS / 1000),
    summary: { onlineCount, recentCount, totalUsers },
    items,
  };
}
