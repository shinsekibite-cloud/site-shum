/**
 * Soft anti-multi-registration: IP + fingerprint windows, attempt log.
 */
import { prisma } from '@/lib/prisma';
import { createUserNotification } from '@/lib/security';

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_ATTEMPTS_PER_IP = 8;
const MAX_SUCCESS_PER_IP_DAY = 3;
const MAX_ATTEMPTS_PER_FP = 6;

export type RegGuardResult =
  | { ok: true }
  | { ok: false; message: string; softBlock: boolean };

export async function logRegistrationAttempt(opts: {
  ip: string | null;
  fingerprint?: string | null;
  email?: string | null;
  phone?: string | null;
  success: boolean;
  blocked?: boolean;
  reason?: string | null;
}) {
  try {
    await prisma.registrationAttempt.create({
      data: {
        ip: opts.ip?.slice(0, 64) || null,
        fingerprint: opts.fingerprint?.trim().slice(0, 128) || null,
        email: opts.email?.trim().toLowerCase().slice(0, 190) || null,
        phone: opts.phone?.slice(0, 32) || null,
        success: opts.success,
        blocked: Boolean(opts.blocked),
        reason: opts.reason?.slice(0, 240) || null,
      },
    });
  } catch (e) {
    console.warn('logRegistrationAttempt', e);
  }
}

async function notifyModsAboutIp(ip: string, detail: string) {
  try {
    const staff = await prisma.user.findMany({
      where: {
        OR: [
          { role: 'ADMIN' },
          { role: 'MODERATOR', permissions: { contains: 'moderation' } },
        ],
        blockedAt: null,
        deletedAt: null,
      },
      select: { id: true },
      take: 30,
    });
    await Promise.all(
      staff.map((s) =>
        createUserNotification({
          userId: s.id,
          type: 'MODERATION',
          title: 'Подозрительные регистрации',
          body: `IP ${ip}: ${detail}`,
          meta: { href: '/admin/security', ip, audience: 'staff' },
        })
      )
    );
  } catch {
    /* ignore */
  }
}

/** Soft-check before creating PendingUser / User. */
export async function assertRegistrationAllowed(opts: {
  ip: string | null;
  fingerprint?: string | null;
}): Promise<RegGuardResult> {
  const since = new Date(Date.now() - WINDOW_MS);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const ip = opts.ip?.trim() || null;
  const fp = opts.fingerprint?.trim().slice(0, 128) || null;

  if (ip) {
    const [attempts, successes, softBlocks] = await Promise.all([
      prisma.registrationAttempt.count({
        where: { ip, createdAt: { gte: since } },
      }),
      prisma.registrationAttempt.count({
        where: { ip, success: true, createdAt: { gte: dayAgo } },
      }),
      prisma.registrationAttempt.count({
        where: { ip, blocked: true, createdAt: { gte: since } },
      }),
    ]);

    if (softBlocks >= 1 || attempts >= MAX_ATTEMPTS_PER_IP) {
      await notifyModsAboutIp(
        ip,
        `${attempts} попыток за час, успешных за сутки: ${successes}`
      );
      return {
        ok: false,
        softBlock: true,
        message:
          'Слишком много попыток регистрации с вашего адреса. Попробуйте позже или напишите в поддержку.',
      };
    }
    if (successes >= MAX_SUCCESS_PER_IP_DAY) {
      await notifyModsAboutIp(ip, `${successes} успешных регистраций за сутки`);
      return {
        ok: false,
        softBlock: true,
        message:
          'С этого адреса уже создано несколько аккаунтов. Если это ошибка — обратитесь к администрации.',
      };
    }
  }

  if (fp) {
    const fpAttempts = await prisma.registrationAttempt.count({
      where: { fingerprint: fp, createdAt: { gte: since } },
    });
    if (fpAttempts >= MAX_ATTEMPTS_PER_FP) {
      return {
        ok: false,
        softBlock: true,
        message: 'Слишком много попыток с этого устройства. Подождите немного.',
      };
    }
  }

  return { ok: true };
}

/** Accounts that share an IP in login history (for admin tools). */
export async function usersSharingIp(ip: string, take = 40) {
  const events = await prisma.loginEvent.findMany({
    where: { ip },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { userId: true, createdAt: true, deviceLabel: true, kind: true },
  });
  const byUser = new Map<string, { lastAt: Date; count: number; device?: string | null }>();
  for (const e of events) {
    const cur = byUser.get(e.userId);
    if (!cur) {
      byUser.set(e.userId, { lastAt: e.createdAt, count: 1, device: e.deviceLabel });
    } else {
      cur.count += 1;
    }
  }
  const ids = [...byUser.keys()].slice(0, take);
  const users = await prisma.user.findMany({
    where: { id: { in: ids }, role: { not: 'TECH' } },
    select: {
      id: true,
      name: true,
      email: true,
      publicCode: true,
      role: true,
      blockedAt: true,
      suspiciousFlag: true,
      createdAt: true,
    },
  });
  return users.map((u) => ({
    ...u,
    ipHits: byUser.get(u.id)?.count || 0,
    lastIpAt: byUser.get(u.id)?.lastAt || null,
    deviceLabel: byUser.get(u.id)?.device || null,
  }));
}
