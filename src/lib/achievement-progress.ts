import {
  ACHIEVEMENTS,
  BRONZE_CODES,
  LEGEND_REQUIREMENTS,
  type AchievementTier,
} from '@/lib/achievements';
import { parseTagList } from '@/lib/profile-meta';
import { INSTRUCTIONS_VERSION } from '@/lib/consent-versions';

/** Live counters used to show progress toward each achievement */
export type AchievementStats = {
  attendedCount: number;
  noShowCount: number;
  reliabilityScore: number;
  participations: number;
  applications: number;
  approvedApplications: number;
  bookings: number;
  checkIns: number;
  hasPrivacy: boolean;
  hasRules: boolean;
  hasBio: boolean;
  hasCity: boolean;
  hasAvatar: boolean;
  hasGender: boolean;
  hasInstructions: boolean;
  hobbiesCount: number;
  interestsCount: number;
  unlockedCodes: string[];
  snakeBest: number;
  tetrisBest: number;
  checkersBest: number;
  breakoutBest: number;
  memoryBest: number;
  checkersWon: boolean;
  gamesPlayed: number;
  friendsCount: number;
  messagesSent: number;
  eventInvitesSent: number;
  placeInvitesSent: number;
  sharedEventsWithFriends: number;
  hasPortfolio: boolean;
  portfolioApproved: boolean;
  placeFavorites: number;
  placeRatings: number;
  placeReviewsApproved: number;
};

export type ItemProgress = {
  current: number;
  target: number;
  /** 0–100 */
  percent: number;
  /** short hint under the bar, e.g. «2 из 5» */
  label: string;
};

function clampProgress(current: number, target: number, label?: string): ItemProgress {
  const t = Math.max(1, target);
  const c = Math.max(0, Math.min(current, t));
  return {
    current: c,
    target: t,
    percent: Math.round((c / t) * 100),
    label: label ?? `${c} из ${t}`,
  };
}

export function computeItemProgress(code: string, s: AchievementStats): ItemProgress {
  const unlocked = new Set(s.unlockedCodes);

  switch (code) {
    case 'FIRST_STEPS':
      return clampProgress(1, 1);
    case 'PRIVACY_OK':
      return clampProgress(s.hasPrivacy ? 1 : 0, 1);
    case 'RULES_OK':
      return clampProgress(s.hasRules || s.hasPrivacy ? 1 : 0, 1);
    case 'VIBE_ON':
      return clampProgress(s.hasBio ? 1 : 0, 1);
    case 'FACE_ON':
      return clampProgress(s.hasAvatar ? 1 : 0, 1);
    case 'CITY_SET':
      return clampProgress(s.hasCity ? 1 : 0, 1);
    case 'GENDER_SET':
      return clampProgress(s.hasGender ? 1 : 0, 1);
    case 'INSTRUCTED':
      return clampProgress(s.hasInstructions || unlocked.has('INSTRUCTED') ? 1 : 0, 1);
    case 'EVENT_JOIN':
      return clampProgress(Math.min(s.participations, 1), 1);
    case 'CHECKED_IN':
      return clampProgress(s.checkIns >= 1 || s.attendedCount >= 1 ? 1 : 0, 1);
    case 'COMMUNITY':
      return clampProgress(Math.min(s.applications, 1), 1);
    case 'APP_ACCEPTED':
      return clampProgress(Math.min(s.approvedApplications, 1), 1);
    case 'SPACE_HOST':
      return clampProgress(Math.min(s.bookings, 1), 1);
    case 'PORTFOLIO_START':
      return clampProgress(s.hasPortfolio || unlocked.has('PORTFOLIO_START') ? 1 : 0, 1);
    case 'PORTFOLIO_LIVE':
      return clampProgress(s.portfolioApproved || unlocked.has('PORTFOLIO_LIVE') ? 1 : 0, 1);
    case 'PLACE_FIRST':
      return clampProgress(Math.min(s.placeFavorites, 1), 1);
    case 'PLACE_EXPLORER':
      return clampProgress(s.placeFavorites, 5);
    case 'PLACE_RATED':
      return clampProgress(Math.min(s.placeRatings, 1), 1);
    case 'PLACE_REVIEWER':
      return clampProgress(Math.min(s.placeReviewsApproved, 1), 1);
    case 'FIRST_FRIEND':
      return clampProgress(Math.min(s.friendsCount, 1), 1);
    case 'FIRST_MESSAGE':
      return clampProgress(Math.min(s.messagesSent, 1), 1);
    case 'FRIENDS_3':
      return clampProgress(s.friendsCount, 3);
    case 'FRIENDS_10':
      return clampProgress(s.friendsCount, 10);
    case 'MESSAGES_25':
      return clampProgress(s.messagesSent, 25);
    case 'EVENT_INVITE':
      return clampProgress(Math.min(s.eventInvitesSent, 1), 1);
    case 'PLACE_INVITE':
      return clampProgress(Math.min(s.placeInvitesSent, 1), 1);
    case 'SHARED_EVENT':
      return clampProgress(Math.min(s.sharedEventsWithFriends, 1), 1);
    case 'TRUSTED_CIRCLE': {
      const friendsOk = s.friendsCount >= 3;
      const msgsOk = s.messagesSent >= 5;
      if (friendsOk && msgsOk) return clampProgress(2, 2, 'готово');
      if (!friendsOk) {
        return clampProgress(s.friendsCount, 3, `${s.friendsCount} из 3 друзей`);
      }
      return clampProgress(s.messagesSent, 5, `${s.messagesSent} из 5 сообщений`);
    }
    case 'PROFILE_PRO': {
      const parts =
        (s.hasBio ? 1 : 0) +
        (s.hasCity ? 1 : 0) +
        (s.hobbiesCount >= 1 ? 1 : 0) +
        (s.interestsCount >= 1 ? 1 : 0);
      return clampProgress(parts, 4);
    }
    case 'ACTIVE_5':
      return clampProgress(s.attendedCount, 5);
    case 'SCAN_3': {
      const scans = Math.max(s.checkIns, s.attendedCount >= 1 ? 1 : 0);
      return clampProgress(scans, 3);
    }
    case 'JOIN_3':
      return clampProgress(s.participations, 3);
    case 'RELIABLE': {
      const visitsOk = s.attendedCount >= 3;
      const ratingOk = s.reliabilityScore >= 95;
      if (visitsOk && ratingOk) return clampProgress(2, 2, 'готово');
      if (!visitsOk) {
        return clampProgress(s.attendedCount, 3, `${s.attendedCount} из 3 посещений`);
      }
      return clampProgress(
        Math.min(s.reliabilityScore, 95),
        95,
        `рейтинг ${s.reliabilityScore}% · нужно ≥ 95%`
      );
    }
    case 'STAR_10':
      return clampProgress(s.attendedCount, 10);
    case 'LOYAL': {
      const visitsOk = s.attendedCount >= 5;
      const ratingOk = s.reliabilityScore >= 100;
      const cleanOk = s.noShowCount === 0;
      const parts = (visitsOk ? 1 : 0) + (ratingOk ? 1 : 0) + (cleanOk ? 1 : 0);
      if (parts >= 3) return clampProgress(3, 3, 'готово');
      if (!visitsOk) {
        return clampProgress(s.attendedCount, 5, `${s.attendedCount} из 5 посещений`);
      }
      const missing: string[] = [];
      if (!ratingOk) missing.push('рейтинг 100%');
      if (!cleanOk) missing.push('без пропусков');
      return clampProgress(parts, 3, missing.join(' · ') || `${parts} из 3`);
    }
    case 'HOST_PRO':
      return clampProgress(s.bookings, 3);
    case 'BRONZE_SET': {
      const done = BRONZE_CODES.filter((c) => unlocked.has(c)).length;
      return clampProgress(done, BRONZE_CODES.length);
    }
    case 'LEGEND': {
      const done = LEGEND_REQUIREMENTS.filter((c) => unlocked.has(c)).length;
      return clampProgress(done, LEGEND_REQUIREMENTS.length);
    }
    case 'SECRET_MENU':
      return clampProgress(unlocked.has('SECRET_MENU') ? 1 : 0, 1);
    case 'MODERN_USER':
      return clampProgress(unlocked.has('MODERN_USER') ? 1 : 0, 1);
    case 'SNAKE_PLAY':
      return clampProgress(s.snakeBest > 0 || unlocked.has('SNAKE_PLAY') ? 1 : 0, 1);
    case 'TETRIS_PLAY':
      return clampProgress(s.tetrisBest > 0 || unlocked.has('TETRIS_PLAY') ? 1 : 0, 1);
    case 'CHECKERS_PLAY':
      return clampProgress(s.checkersBest > 0 || unlocked.has('CHECKERS_PLAY') ? 1 : 0, 1);
    case 'BREAKOUT_PLAY':
      return clampProgress(s.breakoutBest > 0 || unlocked.has('BREAKOUT_PLAY') ? 1 : 0, 1);
    case 'MEMORY_PLAY':
      return clampProgress(s.memoryBest > 0 || unlocked.has('MEMORY_PLAY') ? 1 : 0, 1);
    case 'SNAKE_50':
      return clampProgress(s.snakeBest, 50);
    case 'SNAKE_120':
      return clampProgress(s.snakeBest, 120);
    case 'TETRIS_800':
      return clampProgress(s.tetrisBest, 800);
    case 'TETRIS_2500':
      return clampProgress(s.tetrisBest, 2500);
    case 'BREAKOUT_800':
      return clampProgress(s.breakoutBest, 800);
    case 'MEMORY_500':
      return clampProgress(s.memoryBest, 500);
    case 'CHECKERS_WIN':
      return clampProgress(s.checkersWon || unlocked.has('CHECKERS_WIN') ? 1 : 0, 1);
    case 'GAME_TRIO':
      return clampProgress(s.gamesPlayed, 3);
    default:
      return clampProgress(unlocked.has(code) ? 1 : 0, 1);
  }
}

export function buildStatsFromUser(user: {
  reliabilityScore?: number | null;
  attendedCount?: number | null;
  noShowCount?: number | null;
  privacyAcceptedAt?: Date | string | null;
  rulesAcceptedAt?: Date | string | null;
  bio?: string | null;
  city?: string | null;
  image?: string | null;
  gender?: string | null;
  instructionsVersion?: string | null;
  instructionsCompletedAt?: Date | string | null;
  hobbies?: string | null;
  interests?: string | null;
  _count?: {
    participations?: number;
    applications?: number;
    bookings?: number;
    ticketCheckIns?: number;
  };
  unlockedCodes?: string[];
  snakeBest?: number;
  tetrisBest?: number;
  checkersBest?: number;
  breakoutBest?: number;
  memoryBest?: number;
  checkersWon?: boolean;
  gamesPlayed?: number;
  friendsCount?: number;
  messagesSent?: number;
  eventInvitesSent?: number;
  placeInvitesSent?: number;
  sharedEventsWithFriends?: number;
  approvedApplications?: number;
  hasPortfolio?: boolean;
  portfolioApproved?: boolean;
  placeFavorites?: number;
  placeRatings?: number;
  placeReviewsApproved?: number;
}): AchievementStats {
  const hobbies = parseTagList(user.hobbies);
  const interests = parseTagList(user.interests);
  const hasInstructions = Boolean(
    user.instructionsCompletedAt && user.instructionsVersion === INSTRUCTIONS_VERSION
  );
  return {
    attendedCount: user.attendedCount ?? 0,
    noShowCount: user.noShowCount ?? 0,
    reliabilityScore: user.reliabilityScore ?? 100,
    participations: user._count?.participations ?? 0,
    applications: user._count?.applications ?? 0,
    approvedApplications: user.approvedApplications ?? 0,
    bookings: user._count?.bookings ?? 0,
    checkIns: user._count?.ticketCheckIns ?? 0,
    hasPrivacy: Boolean(user.privacyAcceptedAt),
    hasRules: Boolean(user.rulesAcceptedAt) || Boolean(user.privacyAcceptedAt),
    hasBio: (user.bio || '').trim().length >= 2,
    hasCity: (user.city || '').trim().length >= 2,
    hasAvatar: Boolean((user.image || '').trim()),
    hasGender: user.gender === 'MALE' || user.gender === 'FEMALE',
    hasInstructions,
    hobbiesCount: hobbies.length,
    interestsCount: interests.length,
    unlockedCodes: user.unlockedCodes || [],
    snakeBest: user.snakeBest ?? 0,
    tetrisBest: user.tetrisBest ?? 0,
    checkersBest: user.checkersBest ?? 0,
    breakoutBest: user.breakoutBest ?? 0,
    memoryBest: user.memoryBest ?? 0,
    checkersWon: Boolean(user.checkersWon),
    gamesPlayed: user.gamesPlayed ?? 0,
    friendsCount: user.friendsCount ?? 0,
    messagesSent: user.messagesSent ?? 0,
    eventInvitesSent: user.eventInvitesSent ?? 0,
    placeInvitesSent: user.placeInvitesSent ?? 0,
    sharedEventsWithFriends: user.sharedEventsWithFriends ?? 0,
    hasPortfolio: Boolean(user.hasPortfolio),
    portfolioApproved: Boolean(user.portfolioApproved),
    placeFavorites: user.placeFavorites ?? 0,
    placeRatings: user.placeRatings ?? 0,
    placeReviewsApproved: user.placeReviewsApproved ?? 0,
  };
}

export function enrichAchievementsWithProgress(
  unlockedCodes: string[],
  stats: AchievementStats
) {
  const withCodes = { ...stats, unlockedCodes };
  return ACHIEVEMENTS.map((a) => {
    const unlocked = unlockedCodes.includes(a.code);
    const step = computeItemProgress(a.code, withCodes);
    return {
      ...a,
      unlocked,
      step: unlocked
        ? { ...step, current: step.target, percent: 100, label: `${step.target} из ${step.target}` }
        : step,
    };
  });
}

export type { AchievementTier };
