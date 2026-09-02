/**
 * Dual reputation: Authority (надёжность/посещаемость) + Social rating (сообщество).
 * Both influence rate limits and feature gates.
 */
import { prisma } from '@/lib/prisma';

export const AUTHORITY = {
  MIN: 0,
  MAX: 100,
  DEFAULT: 100,
  /** Below this — cannot create space bookings */
  BOOKING_MIN: 30,
  /** Below this — cannot invite friends to events */
  INVITE_MIN: 35,
  /** Below this — applications blocked */
  APPLICATION_MIN: 20,
} as const;

export const SOCIAL = {
  MIN: 0,
  MAX: 100,
  DEFAULT: 50,
  FRIEND_ACCEPT_DELTA: 3,
  GALLERY_PHOTO_DELTA: 1,
  /** Share of moderation reliability delta applied to social */
  MODERATION_SHARE: 0.5,
} as const;

function clampScore(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function authorityLimitMultiplier(score: number | null | undefined): number {
  const s = typeof score === 'number' && Number.isFinite(score) ? score : AUTHORITY.DEFAULT;
  if (s >= 95) return 1.4;
  if (s >= 85) return 1.25;
  if (s >= 70) return 1.1;
  if (s >= 50) return 1;
  if (s >= 30) return 0.85;
  return 0.7;
}

export function socialLimitMultiplier(score: number | null | undefined): number {
  const s = typeof score === 'number' && Number.isFinite(score) ? score : SOCIAL.DEFAULT;
  if (s >= 90) return 1.4;
  if (s >= 75) return 1.25;
  if (s >= 60) return 1.15;
  if (s >= 45) return 1;
  if (s >= 30) return 0.85;
  return 0.7;
}

/** Weighted blend for a capability bucket. */
export function blendedLimitMultiplier(
  authority: number | null | undefined,
  social: number | null | undefined,
  authorityWeight = 0.55,
  socialWeight = 0.45
): number {
  const aw = Math.max(0, authorityWeight);
  const sw = Math.max(0, socialWeight);
  const sum = aw + sw || 1;
  return (
    (authorityLimitMultiplier(authority) * aw + socialLimitMultiplier(social) * sw) / sum
  );
}

export type ReputationScores = {
  authority: number;
  social: number;
};

export async function getReputationScores(userId: string): Promise<ReputationScores> {
  try {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { reliabilityScore: true, socialScore: true },
    });
    return {
      authority: u?.reliabilityScore ?? AUTHORITY.DEFAULT,
      social: u?.socialScore ?? SOCIAL.DEFAULT,
    };
  } catch {
    return { authority: AUTHORITY.DEFAULT, social: SOCIAL.DEFAULT };
  }
}

export type CapabilityProfile = ReputationScores & {
  bookingMultiplier: number;
  applicationMultiplier: number;
  messagingMultiplier: number;
  uploadMultiplier: number;
  friendRequestMultiplier: number;
  galleryBonusSlots: number;
  canCreateBooking: boolean;
  canApply: boolean;
  canInviteToEvents: boolean;
};

export function galleryBonusSlots(social: number): number {
  if (social >= 90) return 8;
  if (social >= 75) return 5;
  if (social >= 60) return 3;
  if (social >= 50) return 1;
  return 0;
}

export function buildCapabilityProfile(scores: ReputationScores): CapabilityProfile {
  const { authority, social } = scores;
  return {
    ...scores,
    bookingMultiplier: blendedLimitMultiplier(authority, social, 0.7, 0.3),
    applicationMultiplier: blendedLimitMultiplier(authority, social, 0.65, 0.35),
    messagingMultiplier: blendedLimitMultiplier(authority, social, 0.25, 0.75),
    uploadMultiplier: blendedLimitMultiplier(authority, social, 0.4, 0.6),
    friendRequestMultiplier: blendedLimitMultiplier(authority, social, 0.2, 0.8),
    galleryBonusSlots: galleryBonusSlots(social),
    canCreateBooking: authority >= AUTHORITY.BOOKING_MIN,
    canApply: authority >= AUTHORITY.APPLICATION_MIN,
    canInviteToEvents: authority >= AUTHORITY.INVITE_MIN,
  };
}

export async function getUserCapabilities(userId: string): Promise<CapabilityProfile> {
  return buildCapabilityProfile(await getReputationScores(userId));
}

export function authorityLabel(score: number): string {
  if (score >= 95) return 'Эталон надёжности';
  if (score >= 85) return 'Высокая надёжность';
  if (score >= 70) return 'Стабильный';
  if (score >= 50) return 'Обычный';
  if (score >= 30) return 'Сниженный';
  return 'Критический';
}

export function socialLabel(score: number): string {
  if (score >= 90) return 'Лидер сообщества';
  if (score >= 75) return 'Активный в сообществе';
  if (score >= 60) return 'Вовлечённый';
  if (score >= 45) return 'Знакомый';
  if (score >= 30) return 'Новичок';
  return 'Ограниченный';
}

export async function bumpSocialScore(userId: string, delta: number, reason?: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { socialScore: true },
  });
  if (!user) return null;
  const next = clampScore((user.socialScore ?? SOCIAL.DEFAULT) + delta, SOCIAL.MIN, SOCIAL.MAX);
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { socialScore: next },
    select: { id: true, socialScore: true },
  });
  if (delta) {
    const { logReputationEvent } = await import('@/lib/reputation-history');
    await logReputationEvent({
      userId,
      kind: 'SOCIAL',
      delta,
      balanceAfter: next,
      reason: reason || (delta > 0 ? 'Социальная активность' : 'Снижение соцрейтинга'),
    });
  }
  return updated;
}

export async function setSocialScore(userId: string, score: number) {
  const next = clampScore(score, SOCIAL.MIN, SOCIAL.MAX);
  return prisma.user.update({
    where: { id: userId },
    data: { socialScore: next },
    select: { id: true, socialScore: true },
  });
}

/** Apply a fraction of moderation delta to social rating. */
export async function applyModerationSocialHit(userId: string, reliabilityDelta: number) {
  if (!reliabilityDelta) return null;
  const socialDelta = Math.round(reliabilityDelta * SOCIAL.MODERATION_SHARE);
  if (!socialDelta) return null;
  return bumpSocialScore(userId, socialDelta);
}
