import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createUserNotification, recordLoginEvent } from '@/lib/security';
import { assertTrustedDevice } from '@/lib/trusted-device';
import { newTokenKeepAlive } from '@/lib/content-moderation';
import { assertSameOrigin } from '@/lib/csrf-origin';

/** Invalidate other JWT sessions by bumping tokenVersion; current device keeps session via keepAlive nonce. */
export async function POST(req: Request) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const fingerprint = typeof body.fingerprint === 'string' ? body.fingerprint.slice(0, 128) : null;
  const trust = await assertTrustedDevice(session.user.id, fingerprint);
  if (!trust.ok) {
    return NextResponse.json({ message: trust.message, trust: trust.status }, { status: 403 });
  }

  const keepAlive = newTokenKeepAlive();
  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      tokenVersion: { increment: 1 },
      tokenKeepAlive: keepAlive,
    },
    select: { tokenVersion: true },
  });

  await recordLoginEvent({ userId: session.user.id, kind: 'REVOKE', success: true, fingerprint });
  await createUserNotification({
    userId: session.user.id,
    type: 'SECURITY',
    title: 'Сеансы завершены',
    body: 'Все другие устройства вышли из аккаунта. Этот сеанс остался активным.',
  });

  return NextResponse.json({
    ok: true,
    tokenVersion: updated.tokenVersion,
    keepAlive,
    message: 'Другие сеансы завершены. Это устройство остаётся в системе.',
    keepCurrent: true,
  });
}
