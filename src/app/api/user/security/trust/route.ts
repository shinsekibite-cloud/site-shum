import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { recordLoginEvent, userAgentFromHeaders } from '@/lib/security';
import { touchTrustedDevice, TRUSTED_DEVICE_DAYS } from '@/lib/trusted-device';

const schema = z.object({
  password: z.string().min(1, 'Введите пароль'),
  fingerprint: z.string().min(8).max(128),
});

/**
 * Confirm "this is my device" with account password → mark trusted immediately.
 * Solves false "new device" when the browser fingerprint drifted.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message || 'Некорректные данные' },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { password: true, deletedAt: true, blockedAt: true },
  });
  if (!user?.password || user.deletedAt || user.blockedAt) {
    return NextResponse.json({ message: 'Аккаунт недоступен' }, { status: 403 });
  }

  const ok = await bcrypt.compare(parsed.data.password, user.password);
  if (!ok) {
    return NextResponse.json({ message: 'Неверный пароль' }, { status: 400 });
  }

  const ua = await userAgentFromHeaders();
  // Ensure row exists
  await touchTrustedDevice({
    userId: session.user.id,
    fingerprint: parsed.data.fingerprint,
    userAgent: ua,
  });

  const now = new Date();
  const row = await prisma.trustedDevice.update({
    where: {
      userId_fingerprint: {
        userId: session.user.id,
        fingerprint: parsed.data.fingerprint.slice(0, 128),
      },
    },
    data: {
      trustedAt: now,
      revokedAt: null,
      lastSeenAt: now,
    },
  });

  await recordLoginEvent({
    userId: session.user.id,
    kind: 'TRUST_DEVICE',
    success: true,
    fingerprint: parsed.data.fingerprint,
  });

  return NextResponse.json({
    ok: true,
    message: 'Устройство подтверждено и помечено как доверенное.',
    trust: {
      fingerprint: row.fingerprint,
      trusted: true,
      daysLeft: 0,
      isNew: false,
      trustDays: TRUSTED_DEVICE_DAYS,
    },
  });
}
