/**
 * Post-registration account moderation.
 * New end-users stay pending until an admin approves them or 3 Moscow
 * weekday working hours (09:00–18:00) elapse — then auto-approve.
 * Staff roles skip the queue. Blocking remains independent of approval.
 */

import { prisma } from '@/lib/prisma';

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
const WORK_START_MIN = 9 * 60;
const WORK_END_MIN = 18 * 60;
const AUTO_APPROVE_WORK_HOURS = 3;

/** Accounts created before this instant are grandfathered as approved. */
export const ACCOUNT_MODERATION_LAUNCH_AT = new Date(
  process.env.ACCOUNT_MODERATION_LAUNCH_AT || '2026-08-18T12:00:00.000Z'
);

export const MODERATION_PENDING_MESSAGE =
  'Ваш аккаунт находится на проверке. Полный функционал будет доступен после одобрения администратором';

function mskParts(d: Date) {
  const shifted = new Date(d.getTime() + MSK_OFFSET_MS);
  return {
    dow: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

export function isMoscowWorkMinute(d: Date): boolean {
  const { dow, minutes } = mskParts(d);
  if (dow === 0 || dow === 6) return false;
  return minutes >= WORK_START_MIN && minutes < WORK_END_MIN;
}

/** Instant when `hours` of MSK weekday work time have elapsed after `from`. */
export function addMoscowWorkingHours(from: Date, hours: number): Date {
  const need = Math.max(0, hours) * 60;
  if (need === 0) return new Date(from);
  let remaining = need;
  let cursor = from.getTime();
  const maxSteps = 14 * 24 * 60;
  for (let i = 0; i < maxSteps && remaining > 0; i++) {
    cursor += 60_000;
    if (isMoscowWorkMinute(new Date(cursor))) remaining -= 1;
  }
  return new Date(cursor);
}

export function moscowWorkingHoursElapsed(from: Date, to: Date): number {
  if (to.getTime() <= from.getTime()) return 0;
  let minutes = 0;
  let cursor = from.getTime();
  const end = to.getTime();
  const maxSteps = 21 * 24 * 60;
  for (let i = 0; i < maxSteps && cursor < end; i++) {
    cursor += 60_000;
    if (isMoscowWorkMinute(new Date(cursor))) minutes += 1;
  }
  return minutes / 60;
}

export function isStaffRole(role?: string | null) {
  return role === 'ADMIN' || role === 'MODERATOR' || role === 'SCANNER' || role === 'TECH';
}

export function autoApproveDueAt(createdAt: Date): Date {
  return addMoscowWorkingHours(createdAt, AUTO_APPROVE_WORK_HOURS);
}

type ModerationRow = {
  id: string;
  role: string;
  createdAt: Date;
  moderationApprovedAt: Date | null;
  blockedAt?: Date | null;
};

export function isModerationPendingRow(row: ModerationRow, now = new Date()): boolean {
  if (isStaffRole(row.role)) return false;
  if (row.moderationApprovedAt) return false;
  if (row.createdAt.getTime() < ACCOUNT_MODERATION_LAUNCH_AT.getTime()) return false;
  return moscowWorkingHoursElapsed(row.createdAt, now) < AUTO_APPROVE_WORK_HOURS;
}

/** Approve if grandfathered or 3 working hours passed. Returns whether still pending. */
export async function syncAccountModeration(userId: string, now = new Date()): Promise<boolean> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      createdAt: true,
      moderationApprovedAt: true,
      blockedAt: true,
    },
  });
  if (!row) return false;
  if (isStaffRole(row.role)) {
    if (!row.moderationApprovedAt) {
      await prisma.user.update({
        where: { id: row.id },
        data: { moderationApprovedAt: now },
      });
    }
    return false;
  }
  if (row.moderationApprovedAt) return false;

  const grandfather = row.createdAt.getTime() < ACCOUNT_MODERATION_LAUNCH_AT.getTime();
  const due = autoApproveDueAt(row.createdAt).getTime() <= now.getTime();
  if (grandfather || due) {
    await prisma.user.update({
      where: { id: row.id },
      data: { moderationApprovedAt: now },
    });
    return false;
  }
  return true;
}

export async function autoApproveDueAccounts(now = new Date()) {
  const pending = await prisma.user.findMany({
    where: {
      moderationApprovedAt: null,
      blockedAt: null,
      deletedAt: null,
      role: { in: ['USER', 'PARTICIPANT'] },
    },
    select: { id: true, createdAt: true, role: true, moderationApprovedAt: true },
    take: 200,
  });
  let approved = 0;
  for (const u of pending) {
    if (!isModerationPendingRow(u, now)) {
      await prisma.user.update({
        where: { id: u.id },
        data: { moderationApprovedAt: now },
      });
      approved += 1;
    }
  }
  return { scanned: pending.length, approved };
}
