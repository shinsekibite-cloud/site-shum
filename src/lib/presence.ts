import { prisma } from '@/lib/prisma';
import { areFriends, type ProfileVisibility } from '@/lib/social';

export type OnlineVisibility = 'FRIENDS' | 'PUBLIC' | 'HIDDEN';

export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export function isUserOnline(lastActiveAt: Date | string | null | undefined, now = Date.now()) {
  if (!lastActiveAt) return false;
  const t = typeof lastActiveAt === 'string' ? Date.parse(lastActiveAt) : lastActiveAt.getTime();
  if (!Number.isFinite(t)) return false;
  return now - t <= ONLINE_WINDOW_MS;
}

export function normalizeOnlineVisibility(raw: string | null | undefined): OnlineVisibility {
  if (raw === 'PUBLIC' || raw === 'HIDDEN' || raw === 'FRIENDS') return raw;
  return 'FRIENDS';
}

/**
 * Resolve whether viewer may see target's online status (privacy-aware).
 * Returns null when status must be hidden entirely.
 */
export async function resolvePresenceForViewer(opts: {
  viewerId: string | null | undefined;
  targetId: string;
  targetLastActiveAt: Date | null | undefined;
  targetOnlineVisibility: string | null | undefined;
  targetProfileVisibility?: ProfileVisibility | string | null;
  isFriend?: boolean;
}): Promise<{ online: boolean; label: string } | null> {
  const { viewerId, targetId } = opts;
  if (!viewerId) return null;
  if (viewerId === targetId) {
    const online = isUserOnline(opts.targetLastActiveAt);
    return { online, label: online ? 'в сети' : 'не в сети' };
  }

  const visibility = normalizeOnlineVisibility(opts.targetOnlineVisibility);
  if (visibility === 'HIDDEN') return null;

  // Closed profiles never leak presence to strangers
  const profileVis = (opts.targetProfileVisibility || 'PUBLIC') as string;
  let friend = opts.isFriend;
  if (friend == null) friend = await areFriends(viewerId, targetId);

  if (profileVis === 'PRIVATE' && !friend) return null;
  if (visibility === 'FRIENDS' && !friend) return null;
  if (profileVis === 'FRIENDS' && visibility === 'PUBLIC' && !friend) {
    // Profile aliases strangers — still don't show real-time presence to them
    return null;
  }

  const online = isUserOnline(opts.targetLastActiveAt);
  return { online, label: online ? 'в сети' : 'не в сети' };
}

export async function touchUserPresence(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { lastActiveAt: new Date() },
  });
}
