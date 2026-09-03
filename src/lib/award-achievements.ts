import { prisma } from '@/lib/prisma';
import { ACHIEVEMENTS, BRONZE_CODES, LEGEND_REQUIREMENTS, ecoRewardForTier } from '@/lib/achievements';
import { parseTagList } from '@/lib/profile-meta';
import { INSTRUCTIONS_VERSION } from '@/lib/consent-versions';
import { galleryUrls, parseGalleryItems } from '@/lib/gallery-shared';
import { grantEcoPoints } from '@/lib/eco-points';

export async function unlockAchievement(userId: string, code: string) {
  try {
    const { isModuleEnabled } = await import('@/lib/module-flags');
    if (!(await isModuleEnabled('achievements'))) return null;
  } catch {
    /* fail-open */
  }
  const def = ACHIEVEMENTS.find((a) => a.code === code);
  if (!def) return null;
  try {
    const existing = await prisma.userAchievement.findUnique({
      where: { userId_code: { userId, code } },
      select: { id: true },
    });
    if (existing) return existing;

    const created = await prisma.userAchievement.create({
      data: { userId, code },
    });
    const reward = ecoRewardForTier(def.tier);
    if (reward > 0) {
      await grantEcoPoints(userId, reward, `Достижение: ${def.title}`).catch(() => null);
    }
    return created;
  } catch (e) {
    console.error('unlockAchievement', code, e);
    return null;
  }
}

export async function revokeAchievement(userId: string, code: string) {
  try {
    await prisma.userAchievement.deleteMany({ where: { userId, code } });
  } catch (e) {
    console.error('revokeAchievement', code, e);
  }
}

export async function evaluateAchievements(userId: string) {
  try {
    const { isModuleEnabled } = await import('@/lib/module-flags');
    if (!(await isModuleEnabled('achievements'))) return;
  } catch {
    /* fail-open */
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      reliabilityScore: true,
      socialScore: true,
      ecoPoints: true,
      cosmeticsJson: true,
      ecoLoadoutJson: true,
      collectiblesJson: true,
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
      personalGalleryJson: true,
      _count: {
        select: {
          participations: true,
          applications: true,
          bookings: true,
          ticketCheckIns: true,
        },
      },
    },
  });
  if (!user) return;

  await unlockAchievement(userId, 'FIRST_STEPS');

  if (user._count.participations >= 1) await unlockAchievement(userId, 'EVENT_JOIN');
  if (user._count.participations >= 3) await unlockAchievement(userId, 'JOIN_3');
  if (user._count.ticketCheckIns >= 1 || user.attendedCount >= 1) {
    await unlockAchievement(userId, 'CHECKED_IN');
  }
  if (user._count.ticketCheckIns >= 3) await unlockAchievement(userId, 'SCAN_3');
  if (user._count.applications >= 1) await unlockAchievement(userId, 'COMMUNITY');
  if (user._count.bookings >= 1) await unlockAchievement(userId, 'SPACE_HOST');
  if (user._count.bookings >= 3) await unlockAchievement(userId, 'HOST_PRO');
  if (user.attendedCount >= 5) await unlockAchievement(userId, 'ACTIVE_5');
  if (user.attendedCount >= 10) await unlockAchievement(userId, 'STAR_10');
  if (user.privacyAcceptedAt) await unlockAchievement(userId, 'PRIVACY_OK');
  if ((user as { rulesAcceptedAt?: Date | null }).rulesAcceptedAt || user.privacyAcceptedAt) {
    await unlockAchievement(userId, 'RULES_OK');
  }
  if ((user.bio || '').trim().length >= 2) await unlockAchievement(userId, 'VIBE_ON');
  if ((user.city || '').trim().length >= 2) await unlockAchievement(userId, 'CITY_SET');
  if ((user.image || '').trim()) await unlockAchievement(userId, 'FACE_ON');
  const galleryCount = galleryUrls(
    parseGalleryItems((user as { personalGalleryJson?: string | null }).personalGalleryJson, 48)
  ).length;
  if (galleryCount >= 1) await unlockAchievement(userId, 'GALLERY_SHOT');
  if (galleryCount >= 5) await unlockAchievement(userId, 'GALLERY_PRO');
  if ((user as { gender?: string | null }).gender === 'MALE' || (user as { gender?: string | null }).gender === 'FEMALE') {
    await unlockAchievement(userId, 'GENDER_SET');
  }
  const instr = user as {
    instructionsVersion?: string | null;
    instructionsCompletedAt?: Date | null;
  };
  if (instr.instructionsCompletedAt && instr.instructionsVersion === INSTRUCTIONS_VERSION) {
    await unlockAchievement(userId, 'INSTRUCTED');
  } else {
    // New guides / version bump — hide «Инструктаж пройден» until the pack is completed again
    await revokeAchievement(userId, 'INSTRUCTED');
  }

  const hobbies = parseTagList(user.hobbies);
  const interests = parseTagList(user.interests);
  if (
    (user.bio || '').trim().length >= 2 &&
    (user.city || '').trim().length >= 2 &&
    hobbies.length >= 1 &&
    interests.length >= 1
  ) {
    await unlockAchievement(userId, 'PROFILE_PRO');
  }

  if ((user.reliabilityScore ?? 100) >= 95 && user.attendedCount >= 3) {
    await unlockAchievement(userId, 'RELIABLE');
  }
  if (
    (user.reliabilityScore ?? 100) >= 100 &&
    user.attendedCount >= 5 &&
    (user.noShowCount ?? 0) === 0
  ) {
    await unlockAchievement(userId, 'LOYAL');
  }

  const gameScores = await prisma.gameScore.findMany({
    where: { userId },
    select: { game: true, score: true, meta: true },
  });
  const gamesPlayed = new Set(gameScores.map((g) => g.game));
  for (const row of gameScores) {
    if (row.game === 'snake') {
      await unlockAchievement(userId, 'SNAKE_PLAY');
      if (row.score >= 50) await unlockAchievement(userId, 'SNAKE_50');
      if (row.score >= 120) await unlockAchievement(userId, 'SNAKE_120');
    }
    if (row.game === 'tetris') {
      await unlockAchievement(userId, 'TETRIS_PLAY');
      if (row.score >= 800) await unlockAchievement(userId, 'TETRIS_800');
      if (row.score >= 2500) await unlockAchievement(userId, 'TETRIS_2500');
    }
    if (row.game === 'checkers') {
      await unlockAchievement(userId, 'CHECKERS_PLAY');
      try {
        const meta = row.meta ? JSON.parse(row.meta) : null;
        if (meta?.won) await unlockAchievement(userId, 'CHECKERS_WIN');
      } catch {
        /* ignore */
      }
    }
    if (row.game === 'breakout') {
      await unlockAchievement(userId, 'BREAKOUT_PLAY');
      if (row.score >= 800) await unlockAchievement(userId, 'BREAKOUT_800');
    }
    if (row.game === 'memory') {
      await unlockAchievement(userId, 'MEMORY_PLAY');
      if (row.score >= 500) await unlockAchievement(userId, 'MEMORY_500');
    }
    if (row.game === 'fifteen') {
      await unlockAchievement(userId, 'FIFTEEN_PLAY');
      try {
        const meta = row.meta ? JSON.parse(row.meta) : null;
        if (meta?.difficulty === 'hard' && meta?.won) {
          await unlockAchievement(userId, 'FIFTEEN_HARD');
        }
      } catch {
        /* ignore */
      }
    }
  }
  if (gamesPlayed.size >= 3) {
    await unlockAchievement(userId, 'GAME_TRIO');
  }

  try {
    const vacApps = await prisma.vacancyApplication.count({
      where: { userId, autoPassed: true },
    });
    if (vacApps >= 1) await unlockAchievement(userId, 'JOB_FIRST_APPLY');
    const vacHired = await prisma.vacancyApplication.count({
      where: { userId, status: 'APPROVED' },
    });
    if (vacHired >= 1) await unlockAchievement(userId, 'JOB_HIRED');
    const contestSubs = await prisma.contestSubmission.count({ where: { userId } });
    if (contestSubs >= 1) await unlockAchievement(userId, 'CONTEST_SUBMIT');
    const contestWins = await prisma.contestWinner.count({
      where: { userId, contest: { kind: 'SUBMISSION' } },
    });
    if (contestWins >= 1) await unlockAchievement(userId, 'CONTEST_WIN');
    const raffleWins = await prisma.contestWinner.count({
      where: { userId, contest: { kind: 'RAFFLE' } },
    });
    if (raffleWins >= 1) await unlockAchievement(userId, 'RAFFLE_LUCKY');
  } catch (e) {
    console.error('career/contest achievements', e);
  }

  try {
    const [
      friendsCount,
      messagesSent,
      approvedApps,
      portfolio,
      placeFavs,
      placeRatings,
      placeReviews,
      eventInvitesSent,
      placeInvitesSent,
      myParticipations,
      entityInvitesSent,
      entityInvitesAccepted,
    ] = await Promise.all([
      prisma.friendship.count({
        where: {
          status: 'ACCEPTED',
          OR: [{ requesterId: userId }, { addresseeId: userId }],
        },
      }),
      prisma.directMessage.count({ where: { senderId: userId } }),
      prisma.application.count({
        where: { userId, status: 'APPROVED' },
      }),
      prisma.userPortfolio.findUnique({
        where: { userId },
        select: { status: true },
      }),
      prisma.placeFavorite.count({ where: { userId } }),
      prisma.placeRating.count({ where: { userId } }),
      prisma.placeReview.count({ where: { userId, status: 'APPROVED' } }),
      prisma.bookingInvite.count({ where: { fromUserId: userId } }),
      prisma.placeInvite.count({ where: { fromUserId: userId } }),
      prisma.bookingParticipant.findMany({
        where: { userId },
        select: { bookingId: true },
        take: 80,
      }),
      prisma.entityInvite.count({ where: { inviterId: userId } }),
      prisma.entityInvite.count({ where: { inviteeId: userId, status: 'ACCEPTED' } }),
    ]);
    if (friendsCount >= 1) await unlockAchievement(userId, 'FIRST_FRIEND');
    if (messagesSent >= 1) await unlockAchievement(userId, 'FIRST_MESSAGE');
    if (friendsCount >= 3) await unlockAchievement(userId, 'FRIENDS_3');
    if (friendsCount >= 10) await unlockAchievement(userId, 'FRIENDS_10');
    if (friendsCount >= 3 && messagesSent >= 5) await unlockAchievement(userId, 'TRUSTED_CIRCLE');
    if (messagesSent >= 25) await unlockAchievement(userId, 'MESSAGES_25');
    if (eventInvitesSent >= 1) await unlockAchievement(userId, 'EVENT_INVITE');
    if (placeInvitesSent >= 1) await unlockAchievement(userId, 'PLACE_INVITE');
    if (entityInvitesSent >= 1) await unlockAchievement(userId, 'ENTITY_INVITE');
    if (entityInvitesAccepted >= 1) await unlockAchievement(userId, 'ENTITY_JOIN');
    if (approvedApps >= 1) await unlockAchievement(userId, 'APP_ACCEPTED');
    if (portfolio) await unlockAchievement(userId, 'PORTFOLIO_START');
    if (portfolio?.status === 'APPROVED') await unlockAchievement(userId, 'PORTFOLIO_LIVE');
    if (placeFavs >= 1) await unlockAchievement(userId, 'PLACE_FIRST');
    if (placeFavs >= 5) await unlockAchievement(userId, 'PLACE_EXPLORER');
    if (placeRatings >= 1) await unlockAchievement(userId, 'PLACE_RATED');
    if (placeReviews >= 1) await unlockAchievement(userId, 'PLACE_REVIEWER');

    if (myParticipations.length) {
      const friendIds = (
        await prisma.friendship.findMany({
          where: {
            status: 'ACCEPTED',
            OR: [{ requesterId: userId }, { addresseeId: userId }],
          },
          select: { requesterId: true, addresseeId: true },
          take: 100,
        })
      ).map((f) => (f.requesterId === userId ? f.addresseeId : f.requesterId));
      if (friendIds.length) {
        const shared = await prisma.bookingParticipant.count({
          where: {
            bookingId: { in: myParticipations.map((p) => p.bookingId) },
            userId: { in: friendIds },
          },
        });
        if (shared >= 1) await unlockAchievement(userId, 'SHARED_EVENT');
      }
    }
  } catch (e) {
    console.warn('social/portfolio achievements', e);
  }

  const ecoPoints = (user as { ecoPoints?: number }).ecoPoints ?? 0;
  const ownedCosmetics = (() => {
    try {
      const raw = (user as { cosmeticsJson?: string | null }).cosmeticsJson;
      if (!raw) return 0;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  })();
  if (ecoPoints >= 1) await unlockAchievement(userId, 'ECO_STARTER');
  if (ecoPoints >= 50 || ownedCosmetics >= 1) await unlockAchievement(userId, 'ECO_GARDENER');
  if (ownedCosmetics >= 3) await unlockAchievement(userId, 'ECO_COLLECTOR');
  if (ownedCosmetics >= 5) await unlockAchievement(userId, 'ECO_SPENDER');

  try {
    const { parseCollectibles, collectiblesValue, uniqueCardCount, CARD_BY_ID } = await import('@/lib/collectibles');
    const { cosmeticsCatalogValue, parseCosmetics } = await import('@/lib/eco-points');
    const { profileContribution, profileLevel } = await import('@/lib/profile-level');
    const col = parseCollectibles((user as { collectiblesJson?: string | null }).collectiblesJson);
    const uniq = uniqueCardCount(col);
    if (uniq >= 1) await unlockAchievement(userId, 'CARD_FIRST');
    if (col.packsOpened >= 3) await unlockAchievement(userId, 'CARD_PACK');
    if (col.showcase.length >= 1) await unlockAchievement(userId, 'CARD_SHOWCASE');
    if (uniq >= 10) await unlockAchievement(userId, 'CARD_SET');
    for (const id of Object.keys(col.cards)) {
      const rar = CARD_BY_ID[id]?.rarity;
      if (rar === 'rare' || rar === 'epic' || rar === 'legendary') {
        await unlockAchievement(userId, 'CARD_RARE');
        break;
      }
    }
    const contrib = profileContribution({
      ecoPoints,
      cosmeticsValue: cosmeticsCatalogValue(parseCosmetics((user as { cosmeticsJson?: string | null }).cosmeticsJson)),
      collectiblesValue: collectiblesValue(col),
    });
    const lvl = profileLevel(contrib).level;
    if (lvl >= 3) await unlockAchievement(userId, 'LEVEL_3');
    if (lvl >= 5) await unlockAchievement(userId, 'LEVEL_5');
    if (lvl >= 6) await unlockAchievement(userId, 'LEVEL_6');
    if (lvl >= 8) await unlockAchievement(userId, 'LEVEL_8');
    if (lvl >= 10) await unlockAchievement(userId, 'LEVEL_10');
    const { ensureLevelRewards } = await import('@/lib/level-rewards');
    await ensureLevelRewards(userId, lvl);
  } catch (e) {
    console.warn('collectible/level achievements', e);
  }

  try {
    const loadoutRaw = (user as { ecoLoadoutJson?: string | null }).ecoLoadoutJson;
    if (loadoutRaw) {
      const lo = JSON.parse(loadoutRaw);
      if (lo && typeof lo.voice === 'string' && lo.voice.startsWith('voice_')) {
        await unlockAchievement(userId, 'ECO_STYLIST');
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const viewCount = await prisma.contentView.count({ where: { userId } });
    if (viewCount >= 1) await unlockAchievement(userId, 'VIEW_CURIOUS');
    if (viewCount >= 10) await unlockAchievement(userId, 'VIEW_TOURIST');
    if (viewCount >= 50) await unlockAchievement(userId, 'VIEW_CARTOGRAPHER');
  } catch (e) {
    console.warn('view achievements', e);
  }

  const unlocked = await prisma.userAchievement.findMany({
    where: { userId },
    select: { code: true },
  });
  const codes = new Set(unlocked.map((u) => u.code));

  if (BRONZE_CODES.every((c) => codes.has(c))) {
    await unlockAchievement(userId, 'BRONZE_SET');
    codes.add('BRONZE_SET');
  }

  if (LEGEND_REQUIREMENTS.every((c) => codes.has(c))) {
    await unlockAchievement(userId, 'LEGEND');
  }
}
