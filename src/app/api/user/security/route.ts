import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { recordLoginEvent, userAgentFromHeaders } from '@/lib/security';
import { touchTrustedDevice, TRUSTED_DEVICE_DAYS } from '@/lib/trusted-device';
import { processDueAccountDeletions, purgeExpiredArchives } from '@/lib/account-deletion';

/** Record session activity + browser fingerprint after login / on dashboard open */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const fingerprint = typeof body.fingerprint === 'string' ? body.fingerprint.slice(0, 128) : null;
  const kind =
    body.kind === 'LOGIN'
      ? 'LOGIN'
      : body.kind === 'LOGOUT'
        ? 'LOGOUT'
        : body.kind === 'PASSWORD'
          ? 'PASSWORD'
          : 'PING';

  if (kind === 'PING' && fingerprint) {
    const recent = await prisma.loginEvent.findFirst({
      where: {
        userId: session.user.id,
        fingerprint,
        kind: 'PING',
        createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (recent) {
      // Still refresh trust clock lightly
      const ua = await userAgentFromHeaders();
      const trust = fingerprint
        ? await touchTrustedDevice({ userId: session.user.id, fingerprint, userAgent: ua })
        : null;
      return NextResponse.json({ ok: true, throttled: true, trust });
    }
  }

  const ua = await userAgentFromHeaders();
  await recordLoginEvent({
    userId: session.user.id,
    fingerprint,
    kind,
    success: true,
  });

  const trust = fingerprint
    ? await touchTrustedDevice({ userId: session.user.id, fingerprint, userAgent: ua })
    : null;

  // Тяжёлое обслуживание — не на LOGOUT (блокировало выход / давало 502 при нагрузке)
  if (kind !== 'LOGOUT') {
    void processDueAccountDeletions(5).catch(() => null);
    void purgeExpiredArchives(10).catch(() => null);
  }

  return NextResponse.json({ ok: true, trust, trustDays: TRUSTED_DEVICE_DAYS });
}

/** Own login history + distinct IPs/devices + trust status */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const currentFp = url.searchParams.get('fp')?.slice(0, 128) || null;

  const [events, trustedRows, me] = await Promise.all([
    prisma.loginEvent.findMany({
      where: { userId: session.user.id, success: true },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: {
        id: true,
        ip: true,
        deviceLabel: true,
        fingerprint: true,
        kind: true,
        createdAt: true,
      },
    }),
    prisma.trustedDevice.findMany({
      where: { userId: session.user.id, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
      take: 20,
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        deletionRequestedAt: true,
        deletionEffectiveAt: true,
        deletedAt: true,
      },
    }),
  ]);

  const ips = new Map<string, Date>();
  for (const e of events) {
    if (e.ip && !ips.has(e.ip)) ips.set(e.ip, e.createdAt);
  }

  const now = new Date();
  const devices = trustedRows.map((d) => {
    const trusted = Boolean(d.trustedAt) || now.getTime() - d.firstSeenAt.getTime() >= TRUSTED_DEVICE_DAYS * 86400000;
    const daysLeft = trusted
      ? 0
      : Math.max(0, TRUSTED_DEVICE_DAYS - Math.floor((now.getTime() - d.firstSeenAt.getTime()) / 86400000));
    return {
      id: d.id,
      label: d.deviceLabel || 'Устройство',
      last: d.lastSeenAt,
      firstSeenAt: d.firstSeenAt,
      fp: d.fingerprint,
      trusted,
      daysLeft,
      current: currentFp ? d.fingerprint === currentFp : false,
    };
  });

  const currentDevice = devices.find((d) => d.current);
  const currentTrusted = currentDevice ? Boolean(currentDevice.trusted) : false;

  return NextResponse.json({
    events,
    activeIps: [...ips.entries()].map(([ip, lastSeen]) => ({ ip, lastSeen })),
    devices,
    trustDays: TRUSTED_DEVICE_DAYS,
    currentTrusted,
    currentFingerprint: currentFp,
    deletion: {
      requestedAt: me?.deletionRequestedAt || null,
      effectiveAt: me?.deletionEffectiveAt || null,
      deletedAt: me?.deletedAt || null,
    },
  });
}
