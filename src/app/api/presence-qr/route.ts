import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/csrf-origin';
import { issuePresenceQr } from '@/lib/presence-qr';
import { levelForScore } from '@/lib/score-scales';
import { prisma } from '@/lib/prisma';
import { listReputationHistory } from '@/lib/reputation-history';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: 'Нужна авторизация' }, { status: 401 });
  }

  const issued = await issuePresenceQr(session.user.id);
  if (!issued) {
    return NextResponse.json({ message: 'Пользователь не найден' }, { status: 404 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      mBall: true,
      ecoBall: true,
      ecoBallPublic: true,
      ecoPoints: true,
      name: true,
      publicCode: true,
    },
  });

  const history = await listReputationHistory(session.user.id, { take: 30 });
  const scoreHistory = history.filter((h) => h.kind === 'M_BALL' || h.kind === 'ECO_BALL');

  return NextResponse.json({
    qr: {
      token: issued.token,
      url: issued.url,
      expiresAt: issued.expiresAt.toISOString(),
    },
    scores: {
      mBall: user?.mBall ?? 0,
      ecoBall: user?.ecoBall ?? 0,
      ecoPoints: user?.ecoPoints ?? 0,
      ecoBallPublic: user?.ecoBallPublic ?? false,
      mLevel: levelForScore(user?.mBall ?? 0),
      ecoLevel: levelForScore(user?.ecoBall ?? 0),
    },
    history: scoreHistory,
  });
}

export async function POST(req: Request) {
  const originBlock = assertSameOrigin(req);
  if (originBlock) return originBlock;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: 'Нужна авторизация' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  if (body?.action === 'toggleEcoPublic') {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { ecoBallPublic: true },
    });
    const next = !(user?.ecoBallPublic ?? false);
    await prisma.user.update({
      where: { id: session.user.id },
      data: { ecoBallPublic: next },
    });
    return NextResponse.json({ ok: true, ecoBallPublic: next });
  }

  const issued = await issuePresenceQr(session.user.id, { force: true });
  return NextResponse.json({
    ok: true,
    qr: {
      token: issued?.token,
      url: issued?.url,
      expiresAt: issued?.expiresAt?.toISOString(),
    },
  });
}
