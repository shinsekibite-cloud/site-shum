import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { isGameId } from '@/lib/games';
import { createGamePlaySession } from '@/lib/game-session';
import { gamesPostRateLimiter, rateLimitJson } from '@/lib/rateLimit';

/** Start a signed play session — required before submitting a score. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (!(await gamesPostRateLimiter.checkAsync(`games-start:${session.user.id}`))) {
    return NextResponse.json(rateLimitJson('Слишком много запусков игр. Подождите немного.'), {
      status: 429,
    });
  }

  const body = await req.json().catch(() => ({}));
  const game = typeof body.game === 'string' ? body.game : '';
  if (!isGameId(game)) {
    return NextResponse.json({ message: 'Unknown game' }, { status: 400 });
  }

  try {
    const play = await createGamePlaySession(session.user.id, game);
    return NextResponse.json({ ok: true, ...play });
  } catch (e) {
    console.error('POST /api/user/games/start', e);
    return NextResponse.json(
      { message: 'Не удалось создать игровую сессию (проверьте NEXTAUTH_SECRET).' },
      { status: 500 }
    );
  }
}
