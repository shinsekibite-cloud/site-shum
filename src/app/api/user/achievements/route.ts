import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ACHIEVEMENTS, achievementProgress } from '@/lib/achievements';
import { evaluateAchievements } from '@/lib/award-achievements';
import { buildStatsFromUser, computeItemProgress } from '@/lib/achievement-progress';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const lite = new URL(req.url).searchParams.get('lite') === '1';

  // Fast path for avatar showcase pins — skip evaluate + heavy counters
  if (lite) {
    const unlocked = await prisma.userAchievement.findMany({
      where: { userId: session.user.id },
      select: { code: true, unlockedAt: true },
    });
    const unlockedMap = new Map(unlocked.map((u) => [u.code, u.unlockedAt]));
    const items = ACHIEVEMENTS.map((a) => ({
      ...a,
      unlocked: unlockedMap.has(a.code),
      unlockedAt: unlockedMap.get(a.code) || null,
    }));
    return NextResponse.json({
      lite: true,
      unlockedCount: unlocked.length,
      total: ACHIEVEMENTS.length,
      legend: unlockedMap.has('LEGEND'),
      items,
    });
  }

  await evaluateAchievements(session.user.id);

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      reliabilityScore: true,
      attendedCount: true,
      noShowCount: true,
      privacyAcceptedAt: true,
      rulesAcceptedAt: true,
      bio: true,
      city: true,
      image: true,
      hobbies: true,
      interests: true,
      gender: true,
      instructionsVersion: true,
      instructionsCompletedAt: true,
      _count: {
        select: {
          participations: true,
          applications: true,
          bookings: true,
          ticketCheckIns: true,
        },
      },
      portfolio: { select: { status: true } },
    },
  });

  const unlocked = await prisma.userAchievement.findMany({
    where: { userId: session.user.id },
    select: { code: true, unlockedAt: true },
  });
  const gameScores = await prisma.gameScore.findMany({
    where: { userId: session.user.id },
    select: { game: true, score: true, meta: true },
  });
  const [
    friendsCount,
    messagesSent,
    approvedApplications,
    placeFavorites,
    placeRatings,
    placeReviewsApproved,
    eventInvitesSent,
    placeInvitesSent,
  ] = await Promise.all([
    prisma.friendship.count({
      where: {
        status: 'ACCEPTED',
        OR: [{ requesterId: session.user.id }, { addresseeId: session.user.id }],
      },
    }),
    prisma.directMessage.count({ where: { senderId: session.user.id } }),
    prisma.application.count({
      where: { userId: session.user.id, status: 'APPROVED' },
    }),
    prisma.placeFavorite.count({ where: { userId: session.user.id } }),
    prisma.placeRating.count({ where: { userId: session.user.id } }),
    prisma.placeReview.count({ where: { userId: session.user.id, status: 'APPROVED' } }),
    prisma.bookingInvite.count({ where: { fromUserId: session.user.id } }),
    prisma.placeInvite.count({ where: { fromUserId: session.user.id } }),
  ]);

  let sharedEventsWithFriends = 0;
  const myParts = await prisma.bookingParticipant.findMany({
    where: { userId: session.user.id },
    select: { bookingId: true },
    take: 80,
  });
  if (myParts.length) {
    const friendRows = await prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ requesterId: session.user.id }, { addresseeId: session.user.id }],
      },
      select: { requesterId: true, addresseeId: true },
      take: 100,
    });
    const friendIds = friendRows.map((f) =>
      f.requesterId === session.user.id ? f.addresseeId : f.requesterId
    );
    if (friendIds.length) {
      sharedEventsWithFriends = await prisma.bookingParticipant.count({
        where: {
          bookingId: { in: myParts.map((p) => p.bookingId) },
          userId: { in: friendIds },
        },
      });
    }
  }
  let snakeBest = 0;
  let tetrisBest = 0;
  let checkersBest = 0;
  let breakoutBest = 0;
  let memoryBest = 0;
  let checkersWon = false;
  for (const row of gameScores) {
    if (row.game === 'snake') snakeBest = row.score;
    if (row.game === 'tetris') tetrisBest = row.score;
    if (row.game === 'breakout') breakoutBest = row.score;
    if (row.game === 'memory') memoryBest = row.score;
    if (row.game === 'checkers') {
      checkersBest = Math.max(row.score, 1);
      try {
        const meta = row.meta ? JSON.parse(row.meta) : null;
        if (meta?.won) checkersWon = true;
      } catch {
        /* ignore */
      }
    }
  }
  const unlockedMap = new Map(unlocked.map((u) => [u.code, u.unlockedAt]));
  const codes = unlocked.map((u) => u.code);
  const progress = achievementProgress(codes);
  const stats = buildStatsFromUser({
    ...user,
    unlockedCodes: codes,
    snakeBest,
    tetrisBest,
    checkersBest,
    breakoutBest,
    memoryBest,
    checkersWon,
    gamesPlayed: gameScores.length,
    friendsCount,
    messagesSent,
    approvedApplications,
    hasPortfolio: Boolean(user?.portfolio),
    portfolioApproved: user?.portfolio?.status === 'APPROVED',
    placeFavorites,
    placeRatings,
    placeReviewsApproved,
    eventInvitesSent,
    placeInvitesSent,
    sharedEventsWithFriends,
  });

  const items = ACHIEVEMENTS.map((a) => {
    const unlockedAt = unlockedMap.get(a.code) || null;
    const isOn = unlockedMap.has(a.code);
    const step = computeItemProgress(a.code, stats);
    return {
      ...a,
      unlocked: isOn,
      unlockedAt,
      step: isOn
        ? { current: step.target, target: step.target, percent: 100, label: `${step.target} из ${step.target}` }
        : step,
    };
  });

  return NextResponse.json({
    unlockedCount: progress.unlocked,
    total: progress.total,
    percent: progress.percent,
    progress,
    legend: unlockedMap.has('LEGEND'),
    items,
  });
}
