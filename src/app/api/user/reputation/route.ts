import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { listReputationHistory } from '@/lib/reputation-history';
import { parseCosmetics, parseEcoLoadout } from '@/lib/eco-points';
import { authorityLabel, socialLabel } from '@/lib/reputation';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Необходимо авторизоваться' }, { status: 401 });
    }

    const userId = session.user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        reliabilityScore: true,
        socialScore: true,
        ecoPoints: true,
        cosmeticsJson: true,
        ecoLoadoutJson: true,
        attendedCount: true,
        noShowCount: true,
      },
    });
    if (!user) {
      return NextResponse.json({ message: 'Пользователь не найден' }, { status: 404 });
    }

    const authority = user.reliabilityScore ?? 100;
    const social = user.socialScore ?? 50;
    const ecoPoints = user.ecoPoints ?? 0;

    const [authorityHistory, socialHistory, ecoHistory] = await Promise.all([
      listReputationHistory(userId, { kind: 'AUTHORITY', take: 30 }),
      listReputationHistory(userId, { kind: 'SOCIAL', take: 30 }),
      listReputationHistory(userId, { kind: 'ECO', take: 30 }),
    ]);

    return NextResponse.json({
      authority,
      social,
      ecoPoints,
      authorityLabel: authorityLabel(authority),
      socialLabel: socialLabel(social),
      attendedCount: user.attendedCount ?? 0,
      noShowCount: user.noShowCount ?? 0,
      cosmetics: parseCosmetics(user.cosmeticsJson),
      loadout: parseEcoLoadout(user.ecoLoadoutJson),
      history: {
        AUTHORITY: authorityHistory.map((e) => ({
          ...e,
          createdAt: e.createdAt.toISOString(),
        })),
        SOCIAL: socialHistory.map((e) => ({
          ...e,
          createdAt: e.createdAt.toISOString(),
        })),
        ECO: ecoHistory.map((e) => ({
          ...e,
          createdAt: e.createdAt.toISOString(),
        })),
      },
    });
  } catch (e) {
    console.error('GET /api/user/reputation', e);
    return NextResponse.json({ message: 'Ошибка сервера' }, { status: 500 });
  }
}
