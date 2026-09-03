import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isGameId, type GameId } from '@/lib/games';
import { unlockAchievement } from '@/lib/award-achievements';
import { mergeGameMeta, parseGameMeta, type CheckersDifficulty, CHECKERS_DIFFICULTIES } from '@/lib/game-meta';
import { gamesPostRateLimiter, rateLimitJson } from '@/lib/rateLimit';
import { GAME_SCORE_CAPS, verifyAndConsumeGameSession } from '@/lib/game-session';
import { bumpEcoPoints, ECO } from '@/lib/eco-points';
import { startOfMskDay, mskDayKey } from '@/lib/msk-day';

async function unlockIfLeader(userId: string, game: GameId) {
  if (game === 'checkers') {
    const rows = await prisma.gameScore.findMany({
      where: { game, score: { gt: 0 } },
      select: { userId: true, meta: true },
      take: 500,
    });
    let isLeader = false;
    for (const d of CHECKERS_DIFFICULTIES) {
      const ranked = rows
        .map((r) => {
          const t = parseGameMeta(r.meta).bestTimes?.[d.id as CheckersDifficulty];
          return t && t > 0 ? { userId: r.userId, t } : null;
        })
        .filter(Boolean) as { userId: string; t: number }[];
      ranked.sort((a, b) => a.t - b.t);
      if (ranked[0]?.userId === userId) isLeader = true;
    }
    if (isLeader) await unlockAchievement(userId, 'CHECKERS_LEADER');
    return;
  }

  const top = await prisma.gameScore.findFirst({
    where: { game, score: { gt: 0 } },
    orderBy: { score: 'desc' },
    select: { userId: true },
  });
  if (top?.userId === userId) {
    if (game === 'snake') await unlockAchievement(userId, 'SNAKE_LEADER');
    if (game === 'tetris') await unlockAchievement(userId, 'TETRIS_LEADER');
    if (game === 'breakout') await unlockAchievement(userId, 'BREAKOUT_LEADER');
    if (game === 'memory') await unlockAchievement(userId, 'MEMORY_LEADER');
    if (game === 'fifteen') await unlockAchievement(userId, 'FIFTEEN_LEADER');
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const scores = await prisma.gameScore.findMany({
    where: { userId: session.user.id },
    orderBy: { game: 'asc' },
  });

  return NextResponse.json({ scores });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (!(await gamesPostRateLimiter.checkAsync(`games:${session.user.id}`))) {
    return NextResponse.json(rateLimitJson('Слишком много запросов к играм. Подождите немного.'), {
      status: 429,
    });
  }

  const body = await req.json().catch(() => ({}));
  const game = typeof body.game === 'string' ? body.game : '';
  const event = typeof body.event === 'string' ? body.event : 'score';

  if (event === 'secret_menu') {
    return NextResponse.json({ ok: false, message: 'Ignored' }, { status: 400 });
  }

  if (!isGameId(game)) {
    return NextResponse.json({ message: 'Unknown game' }, { status: 400 });
  }

  const cap = GAME_SCORE_CAPS[game] ?? 50_000;
  const score = Math.max(0, Math.min(cap, Math.floor(Number(body.score) || 0)));
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  const token = typeof body.token === 'string' ? body.token : '';

  /** Score / win must present a one-shot signed play session. */
  const needsSession = event === 'score' || event === 'win' || (score > 0 && event !== 'play');
  let serverElapsedMs: number | null = null;

  if (needsSession) {
    const checked = await verifyAndConsumeGameSession({
      sessionId,
      token,
      userId: session.user.id,
      game,
      score,
      requireMinMs: game === 'checkers' && (body.meta?.won || event === 'win') ? 8_000 : undefined,
    });
    if (!checked.ok) {
      return NextResponse.json({ message: checked.message }, { status: checked.status });
    }
    serverElapsedMs = checked.elapsedMs;
  }

  const existing = await prisma.gameScore.findUnique({
    where: { userId_game: { userId: session.user.id, game } },
  });

  const best = Math.max(existing?.score ?? 0, score);
  const metaIncoming =
    body.meta && typeof body.meta === 'object' ? (body.meta as Record<string, unknown>) : null;
  if (metaIncoming && serverElapsedMs != null && typeof metaIncoming.durationMs !== 'number') {
    metaIncoming.durationMs = serverElapsedMs;
  }
  const metaStr = metaIncoming ? mergeGameMeta(existing?.meta, metaIncoming) : existing?.meta ?? null;

  const row = await prisma.gameScore.upsert({
    where: { userId_game: { userId: session.user.id, game } },
    create: {
      userId: session.user.id,
      game,
      score: best,
      meta: metaStr,
    },
    update: {
      score: best,
      ...(metaStr ? { meta: metaStr } : {}),
    },
  });

  if (game === 'snake') await unlockAchievement(session.user.id, 'SNAKE_PLAY');
  if (game === 'tetris') await unlockAchievement(session.user.id, 'TETRIS_PLAY');
  if (game === 'checkers') await unlockAchievement(session.user.id, 'CHECKERS_PLAY');
  if (game === 'breakout') await unlockAchievement(session.user.id, 'BREAKOUT_PLAY');
  if (game === 'memory') await unlockAchievement(session.user.id, 'MEMORY_PLAY');
  if (game === 'fifteen') await unlockAchievement(session.user.id, 'FIFTEEN_PLAY');

  if (game === 'snake' && best >= 50) await unlockAchievement(session.user.id, 'SNAKE_50');
  if (game === 'snake' && best >= 120) await unlockAchievement(session.user.id, 'SNAKE_120');
  if (game === 'tetris' && best >= 800) await unlockAchievement(session.user.id, 'TETRIS_800');
  if (game === 'tetris' && best >= 2500) await unlockAchievement(session.user.id, 'TETRIS_2500');
  if (game === 'breakout' && best >= 800) await unlockAchievement(session.user.id, 'BREAKOUT_800');
  if (game === 'memory' && best >= 500) await unlockAchievement(session.user.id, 'MEMORY_500');
  if (game === 'checkers' && (body.meta?.won || event === 'win')) {
    await unlockAchievement(session.user.id, 'CHECKERS_WIN');
  }
  if (game === 'fifteen' && (body.meta?.won || event === 'win')) {
    if (body.meta?.difficulty === 'hard') {
      await unlockAchievement(session.user.id, 'FIFTEEN_HARD');
    }
  }

  const all = await prisma.gameScore.findMany({
    where: { userId: session.user.id },
    select: { game: true },
  });
  if (new Set(all.map((s) => s.game)).size >= 3) {
    await unlockAchievement(session.user.id, 'GAME_TRIO');
  }

  await unlockIfLeader(session.user.id, game).catch(() => null);

  let ecoAwarded = 0;
  if (needsSession && (event === 'score' || event === 'win' || score > 0)) {
    const dayStart = startOfMskDay();
    const already = await prisma.reputationEvent.findFirst({
      where: {
        userId: session.user.id,
        kind: 'ECO',
        reason: 'game_daily',
        createdAt: { gte: dayStart },
      },
      select: { id: true },
    });
    if (!already) {
      const awarded = await bumpEcoPoints(session.user.id, ECO.GAME_DAILY, 'game_daily', {
        day: mskDayKey(),
        game,
      });
      if (awarded) ecoAwarded = ECO.GAME_DAILY;
    }
  }

  if (
    game === 'fifteen' &&
    needsSession &&
    (body.meta?.won || event === 'win')
  ) {
    const dayStart = startOfMskDay();
    const alreadyWin = await prisma.reputationEvent.findFirst({
      where: {
        userId: session.user.id,
        kind: 'ECO',
        reason: 'fifteen_win_daily',
        createdAt: { gte: dayStart },
      },
      select: { id: true },
    });
    if (!alreadyWin) {
      const awarded = await bumpEcoPoints(session.user.id, ECO.FIFTEEN_WIN, 'fifteen_win_daily', {
        day: mskDayKey(),
        game: 'fifteen',
        difficulty: body.meta?.difficulty,
      });
      if (awarded) ecoAwarded += ECO.FIFTEEN_WIN;
    }
  }

  return NextResponse.json({
    ok: true,
    score: row,
    ecoAwarded,
    ...(serverElapsedMs != null ? { elapsedMs: serverElapsedMs } : {}),
  });
}
