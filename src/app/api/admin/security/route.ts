import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/acl-shared';
import { usersSharingIp } from '@/lib/registration-guard';
import { excludeTechWhere, omitTechUsers } from '@/lib/tech-visibility';

async function requireSecurityAccess() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const role = session.user.role;
  const perms = session.user.permissions || '';
  if (role === 'ADMIN' || role === 'TECH') return session;
  if (role === 'MODERATOR' && hasPermission(role, perms, 'moderation')) return session;
  return null;
}

export async function GET(req: Request) {
  const session = await requireSecurityAccess();
  if (!session) return NextResponse.json({ message: 'Нет доступа' }, { status: 403 });

  const url = new URL(req.url);
  const ip = (url.searchParams.get('ip') || '').trim();
  const minAccounts = Math.max(1, Number(url.searchParams.get('minAccounts') || 2));
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days') || 14)));
  const since = new Date(Date.now() - days * 86400000);

  if (ip) {
    const [users, regAttempts, recentLogins] = await Promise.all([
      usersSharingIp(ip, 50),
      prisma.registrationAttempt.findMany({
        where: { ip, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.loginEvent.findMany({
        where: {
          ip,
          createdAt: { gte: since },
          user: excludeTechWhere(),
        },
        orderBy: { createdAt: 'desc' },
        take: 40,
        include: {
          user: { select: { id: true, name: true, email: true, publicCode: true, role: true } },
        },
      }),
    ]);
    return NextResponse.json({
      ip,
      users: omitTechUsers(users),
      regAttempts,
      recentLogins: recentLogins.filter((r) => r.user?.role !== 'TECH'),
    });
  }

  // Aggregate IPs with multiple distinct users (TECH excluded)
  const loginRows = await prisma.loginEvent.findMany({
    where: {
      createdAt: { gte: since },
      ip: { not: null },
      user: excludeTechWhere(),
    },
    select: { ip: true, userId: true },
    take: 5000,
  });
  const ipMap = new Map<string, Set<string>>();
  for (const row of loginRows) {
    if (!row.ip) continue;
    if (!ipMap.has(row.ip)) ipMap.set(row.ip, new Set());
    ipMap.get(row.ip)!.add(row.userId);
  }
  const hotIps = [...ipMap.entries()]
    .map(([addr, users]) => ({ ip: addr, accounts: users.size }))
    .filter((r) => r.accounts >= minAccounts)
    .sort((a, b) => b.accounts - a.accounts)
    .slice(0, 40);

  const [suspiciousUsers, recentBlockedRegs, openProfileFlags] = await Promise.all([
    prisma.user.findMany({
      where: {
        OR: [{ suspiciousFlag: true }, { blockedAt: { not: null } }],
        deletedAt: null,
        ...excludeTechWhere(),
      },
      orderBy: [{ suspiciousFlag: 'desc' }, { blockedAt: 'desc' }],
      take: 40,
      select: {
        id: true,
        name: true,
        email: true,
        publicCode: true,
        role: true,
        suspiciousFlag: true,
        blockedAt: true,
        blockedReason: true,
        createdAt: true,
        warnCount: true,
      },
    }),
    prisma.registrationAttempt.findMany({
      where: { createdAt: { gte: since }, OR: [{ blocked: true }, { success: false }] },
      orderBy: { createdAt: 'desc' },
      take: 40,
    }),
    prisma.contentFlag.count({
      where: { status: 'OPEN', sourceType: { in: ['PROFILE_TEXT', 'GALLERY_IMAGE', 'AVATAR_IMAGE'] } },
    }),
  ]);

  return NextResponse.json({
    days,
    minAccounts,
    hotIps,
    suspiciousUsers,
    recentBlockedRegs,
    openProfileFlags,
  });
}
