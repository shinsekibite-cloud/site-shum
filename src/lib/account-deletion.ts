import { prisma } from '@/lib/prisma';
import { hashContact } from '@/lib/trusted-device';

export const ACCOUNT_DELETION_GRACE_DAYS = 30;
export const ACCOUNT_ARCHIVE_YEARS = 5;

export function addDays(from: Date, days: number) {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

export function addYears(from: Date, years: number) {
  const d = new Date(from);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

export async function requestAccountDeletion(userId: string) {
  const now = new Date();
  const effective = addDays(now, ACCOUNT_DELETION_GRACE_DAYS);
  return prisma.user.update({
    where: { id: userId },
    data: {
      deletionRequestedAt: now,
      deletionEffectiveAt: effective,
    },
    select: {
      deletionRequestedAt: true,
      deletionEffectiveAt: true,
    },
  });
}

export async function cancelAccountDeletion(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      deletionRequestedAt: null,
      deletionEffectiveAt: null,
    },
    select: { id: true },
  });
}

/** Build archive snapshot and anonymize user after grace period. */
export async function finalizeAccountDeletion(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      _count: {
        select: {
          bookings: true,
          participations: true,
          applications: true,
          achievements: true,
          friendRequestsSent: true,
          friendRequestsReceived: true,
          sentMessages: true,
          ticketCheckIns: true,
        },
      },
    },
  });
  if (!user || user.deletedAt) return null;

  const now = new Date();
  const retainUntil = addYears(now, ACCOUNT_ARCHIVE_YEARS);
  const snapshot = JSON.stringify({
    userId: user.id,
    name: user.name,
    role: user.role,
    reliabilityScore: user.reliabilityScore,
    attendedCount: user.attendedCount,
    noShowCount: user.noShowCount,
    city: user.city,
    createdAt: user.createdAt,
    privacyAcceptedAt: user.privacyAcceptedAt,
    rulesAcceptedAt: user.rulesAcceptedAt,
    cookiesAcceptedAt: user.cookiesAcceptedAt,
    counts: user._count,
    archivedReason: 'self_deletion',
  });

  await prisma.$transaction(async (tx) => {
    await tx.userArchive.upsert({
      where: { userId },
      create: {
        userId,
        displayName: user.name,
        emailHash: hashContact(user.email),
        phoneHash: hashContact(user.phone),
        snapshot,
        archivedAt: now,
        retainUntil,
      },
      update: {
        displayName: user.name,
        emailHash: hashContact(user.email),
        phoneHash: hashContact(user.phone),
        snapshot,
        archivedAt: now,
        retainUntil,
        purgedAt: null,
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        name: 'Удалённый аккаунт',
        email: `deleted_${userId}@archive.local`,
        phone: null,
        password: `deleted_${userId}_${Date.now()}`,
        recoveryPhraseHash: null,
        recoveryPhraseCreatedAt: null,
        image: null,
        bio: null,
        about: null,
        city: null,
        hobbies: null,
        interests: null,
        birthDate: null,
        profileVisibility: 'PRIVATE',
        friendInviteToken: null,
        blockedAt: now,
        blockedReason: 'Аккаунт удалён пользователем',
        deletedAt: now,
        tokenVersion: { increment: 1 },
        privacySignature: null,
        cookiesSignature: null,
        rulesSignature: null,
      },
    });

    await tx.trustedDevice.updateMany({
      where: { userId },
      data: { revokedAt: now },
    });
  });

  return { userId, retainUntil };
}

/** Process overdue deletions (call from security ping / cron). */
export async function processDueAccountDeletions(limit = 20) {
  const now = new Date();
  const due = await prisma.user.findMany({
    where: {
      deletedAt: null,
      deletionEffectiveAt: { lte: now },
      deletionRequestedAt: { not: null },
    },
    select: { id: true },
    take: limit,
  });
  const results = [];
  for (const u of due) {
    results.push(await finalizeAccountDeletion(u.id));
  }
  return results;
}

/** Purge archives past retainUntil (hard remove archive rows only). */
export async function purgeExpiredArchives(limit = 50) {
  const now = new Date();
  const rows = await prisma.userArchive.findMany({
    where: { purgedAt: null, retainUntil: { lte: now } },
    select: { id: true, userId: true },
    take: limit,
  });
  for (const row of rows) {
    await prisma.userArchive.update({
      where: { id: row.id },
      data: { purgedAt: now, snapshot: JSON.stringify({ purged: true, at: now.toISOString() }) },
    });
  }
  return rows.length;
}
