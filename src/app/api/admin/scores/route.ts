import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/csrf-origin';
import { adjustScore } from '@/lib/score-scales';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function canAdjust(role?: string | null) {
  return role === 'ADMIN' || role === 'MODERATOR';
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAdjust(session.user.role)) {
    return NextResponse.json({ message: 'Недостаточно прав' }, { status: 403 });
  }
  const url = new URL(req.url);
  const userId = url.searchParams.get('userId') || undefined;
  const rows = await prisma.reputationEvent.findMany({
    where: {
      kind: { in: ['M_BALL', 'ECO_BALL'] },
      ...(userId ? { userId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      userId: true,
      kind: true,
      delta: true,
      balanceAfter: true,
      reason: true,
      actorId: true,
      createdAt: true,
      user: { select: { name: true, publicCode: true, email: true } },
    },
  });
  return NextResponse.json({ rows });
}

export async function POST(req: Request) {
  const originBlock = assertSameOrigin(req);
  if (originBlock) return originBlock;

  const session = await getServerSession(authOptions);
  if (!session?.user || !canAdjust(session.user.role)) {
    return NextResponse.json({ message: 'Недостаточно прав' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const userId = String(body?.userId || '');
  const scale = body?.scale === 'ECO_BALL' ? 'ECO_BALL' : 'M_BALL';
  const delta = Number(body?.delta);
  const reason = String(body?.reason || 'Ручная корректировка').slice(0, 240);

  if (!userId || !Number.isFinite(delta) || delta === 0) {
    return NextResponse.json({ message: 'userId и ненулевой delta обязательны' }, { status: 400 });
  }

  const result = await adjustScore({
    userId,
    scale,
    delta: Math.trunc(delta),
    reason,
    actorId: session.user.id,
    meta: { manual: true },
  });

  return NextResponse.json({ ok: true, result });
}
