import { getUserCapabilities } from '@/lib/reputation';

/** @deprecated Prefer getUserCapabilities — kept for call sites that only need a single multiplier. */
export function reliabilityLimitMultiplier(score: number | null | undefined): number {
  const s = typeof score === 'number' && Number.isFinite(score) ? score : 100;
  if (s >= 95) return 1.4;
  if (s >= 85) return 1.25;
  if (s >= 70) return 1.1;
  if (s >= 50) return 1;
  return 0.85;
}

/** Combined authority + social multiplier (balanced weights). */
export async function userLimitMultiplier(userId: string): Promise<number> {
  try {
    const caps = await getUserCapabilities(userId);
    return caps.uploadMultiplier;
  } catch {
    return 1;
  }
}

export async function userBookingLimitMultiplier(userId: string): Promise<number> {
  try {
    return (await getUserCapabilities(userId)).bookingMultiplier;
  } catch {
    return 1;
  }
}

export async function userApplicationLimitMultiplier(userId: string): Promise<number> {
  try {
    return (await getUserCapabilities(userId)).applicationMultiplier;
  } catch {
    return 1;
  }
}

export async function userMessagingLimitMultiplier(userId: string): Promise<number> {
  try {
    return (await getUserCapabilities(userId)).messagingMultiplier;
  } catch {
    return 1;
  }
}

export async function userFriendRequestLimitMultiplier(userId: string): Promise<number> {
  try {
    return (await getUserCapabilities(userId)).friendRequestMultiplier;
  } catch {
    return 1;
  }
}

export function boostedMax(base: number, multiplier: number) {
  return Math.max(1, Math.round(base * multiplier));
}
