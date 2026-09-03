import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';

export type ProfileVisibility = 'PUBLIC' | 'FRIENDS' | 'PRIVATE';

export type MutualItem = { id: string; title: string };

export type MutualOverlap = {
  clubs: MutualItem[];
  projects: MutualItem[];
  spaces: MutualItem[];
  interests: string[];
};

/** Sorted pair key for 1:1 conversations. */
export function conversationPairKey(userA: string, userB: string) {
  return [userA, userB].sort().join('_');
}

export function otherUserIdFromPair(pairKey: string, me: string) {
  const [a, b] = pairKey.split('_');
  return a === me ? b : a;
}

export function newFriendInviteToken() {
  return randomBytes(18).toString('base64url');
}

function parseTagList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((v) => String(v || '').trim())
        .filter(Boolean)
        .slice(0, 24);
    }
  } catch {
    /* comma-separated fallback */
  }
  return raw
    .split(/[,;#|/]+/)
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 24);
}

function intersectTags(a: string[], b: string[]) {
  const norm = (s: string) => s.toLocaleLowerCase('ru-RU');
  const setB = new Set(b.map(norm));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tag of a) {
    const key = norm(tag);
    if (setB.has(key) && !seen.has(key)) {
      seen.add(key);
      out.push(tag);
    }
  }
  return out.slice(0, 12);
}

/** Shared clubs / projects / spaces / interest tags between two users. */
export async function getMutualOverlap(userA: string, userB: string): Promise<MutualOverlap> {
  const [appsA, appsB, partsA, partsB, users] = await Promise.all([
    prisma.application.findMany({
      where: { userId: userA, status: 'APPROVED' },
      select: {
        clubId: true,
        projectId: true,
        club: { select: { id: true, title: true } },
        project: { select: { id: true, title: true } },
      },
    }),
    prisma.application.findMany({
      where: { userId: userB, status: 'APPROVED' },
      select: {
        clubId: true,
        projectId: true,
        club: { select: { id: true, title: true } },
        project: { select: { id: true, title: true } },
      },
    }),
    prisma.bookingParticipant.findMany({
      where: { userId: userA, attendanceStatus: { in: ['CHECKED_IN', 'PENDING'] } },
      select: {
        booking: { select: { spaceId: true, space: { select: { id: true, title: true } } } },
      },
    }),
    prisma.bookingParticipant.findMany({
      where: { userId: userB, attendanceStatus: { in: ['CHECKED_IN', 'PENDING'] } },
      select: {
        booking: { select: { spaceId: true, space: { select: { id: true, title: true } } } },
      },
    }),
    prisma.user.findMany({
      where: { id: { in: [userA, userB] } },
      select: { id: true, hobbies: true, interests: true },
    }),
  ]);

  const clubsB = new Set(appsB.map((a) => a.clubId).filter(Boolean) as string[]);
  const projectsB = new Set(appsB.map((a) => a.projectId).filter(Boolean) as string[]);
  const spacesB = new Set(partsB.map((p) => p.booking.spaceId).filter(Boolean) as string[]);

  const clubs: MutualItem[] = [];
  const projects: MutualItem[] = [];
  const seenClub = new Set<string>();
  const seenProject = new Set<string>();
  for (const row of appsA) {
    if (row.clubId && clubsB.has(row.clubId) && row.club && !seenClub.has(row.clubId)) {
      seenClub.add(row.clubId);
      clubs.push({ id: row.club.id, title: row.club.title });
    }
    if (
      row.projectId &&
      projectsB.has(row.projectId) &&
      row.project &&
      !seenProject.has(row.projectId)
    ) {
      seenProject.add(row.projectId);
      projects.push({ id: row.project.id, title: row.project.title });
    }
  }

  const spaces: MutualItem[] = [];
  const seenSpace = new Set<string>();
  for (const row of partsA) {
    const space = row.booking.space;
    if (space && spacesB.has(space.id) && !seenSpace.has(space.id)) {
      seenSpace.add(space.id);
      spaces.push({ id: space.id, title: space.title });
    }
  }

  const me = users.find((u) => u.id === userA);
  const them = users.find((u) => u.id === userB);
  const myTags = [...parseTagList(me?.hobbies), ...parseTagList(me?.interests)];
  const theirTags = [...parseTagList(them?.hobbies), ...parseTagList(them?.interests)];
  const interests = intersectTags(myTags, theirTags);

  return {
    clubs: clubs.slice(0, 8),
    projects: projects.slice(0, 8),
    spaces: spaces.slice(0, 8),
    interests,
  };
}

/**
 * Trust 0–100 between two users:
 * shared events, clubs, message volume, and friendship longevity.
 */
export async function computeTrustScore(userA: string, userB: string): Promise<{
  score: number;
  sharedEvents: number;
  messages: number;
  friendDays: number;
  label: string;
  overlap: MutualOverlap;
}> {
  const [myBookings, theirBookings, friendship, messageCount, overlap] = await Promise.all([
    prisma.bookingParticipant.findMany({
      where: { userId: userA, attendanceStatus: { in: ['CHECKED_IN', 'PENDING'] } },
      select: { bookingId: true },
    }),
    prisma.bookingParticipant.findMany({
      where: { userId: userB, attendanceStatus: { in: ['CHECKED_IN', 'PENDING'] } },
      select: { bookingId: true },
    }),
    prisma.friendship.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterId: userA, addresseeId: userB },
          { requesterId: userB, addresseeId: userA },
        ],
      },
      select: { updatedAt: true, createdAt: true },
    }),
    prisma.directMessage.count({
      where: {
        conversation: { pairKey: conversationPairKey(userA, userB) },
      },
    }),
    getMutualOverlap(userA, userB),
  ]);

  const theirSet = new Set(theirBookings.map((b) => b.bookingId));
  const sharedEvents = myBookings.filter((b) => theirSet.has(b.bookingId)).length;
  const friendSince = friendship?.updatedAt || friendship?.createdAt;
  const friendDays = friendSince
    ? Math.max(0, Math.floor((Date.now() - friendSince.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  const clubBonus = Math.min(overlap.clubs.length, 4) * 8;
  const projectBonus = Math.min(overlap.projects.length, 3) * 5;
  const interestBonus = Math.min(overlap.interests.length, 4) * 2;

  const raw =
    sharedEvents * 14 +
    Math.min(messageCount, 40) * 1.5 +
    Math.min(friendDays, 90) * 0.35 +
    clubBonus +
    projectBonus +
    interestBonus;
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  let label = 'Знакомые';
  if (score >= 70) label = 'Сильное доверие';
  else if (score >= 40) label = 'Доверительные';
  else if (score >= 15) label = 'Общаются';
  else if (!friendship) label = 'Пока мало связей';

  return { score, sharedEvents, messages: messageCount, friendDays, label, overlap };
}

export async function areFriends(userA: string, userB: string) {
  const row = await prisma.friendship.findFirst({
    where: {
      status: 'ACCEPTED',
      OR: [
        { requesterId: userA, addresseeId: userB },
        { requesterId: userB, addresseeId: userA },
      ],
    },
    select: { id: true },
  });
  return Boolean(row);
}

export async function getFriendshipStatus(userA: string, userB: string) {
  const row = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: userA, addresseeId: userB },
        { requesterId: userB, addresseeId: userA },
      ],
    },
    select: { id: true, status: true, requesterId: true },
  });
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    direction: (row.requesterId === userA ? 'outgoing' : 'incoming') as 'incoming' | 'outgoing',
  };
}

/** Whether viewer can see full profile details (bio, city, reliability). */
export function canViewFullProfile(opts: {
  visibility: ProfileVisibility;
  isSelf: boolean;
  isFriend: boolean;
  /** Guests (no session) never get the full profile. */
  authenticated?: boolean;
}) {
  if (opts.isSelf || opts.isFriend) return true;
  if (opts.authenticated === false) return false;
  return opts.visibility === 'PUBLIC';
}

/** Whether viewer may send a friend request without invite. */
export function canRequestFriendOpenly(visibility: ProfileVisibility) {
  return visibility === 'PUBLIC' || visibility === 'FRIENDS';
}

export function inviteTokenValid(
  userToken: string | null | undefined,
  provided: string | null | undefined
) {
  if (!userToken || !provided) return false;
  return userToken === provided.trim();
}

export async function getOrCreateConversation(userA: string, userB: string) {
  const pairKey = conversationPairKey(userA, userB);
  return prisma.conversation.upsert({
    where: { pairKey },
    create: { pairKey },
    update: {},
  });
}
