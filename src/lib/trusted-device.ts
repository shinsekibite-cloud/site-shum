import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import { parseDeviceLabel } from '@/lib/security';

/** Дней до доверия новому устройству */
export const TRUSTED_DEVICE_DAYS = 7;

export type DeviceTrustStatus = {
  fingerprint: string;
  trusted: boolean;
  firstSeenAt: Date;
  trustedAt: Date | null;
  daysLeft: number;
  isNew: boolean;
  deviceLabel: string | null;
};

function startOfDayMs(d: Date) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function daysUntilTrusted(firstSeenAt: Date, now = new Date()): number {
  const elapsedDays = Math.floor((startOfDayMs(now) - startOfDayMs(firstSeenAt)) / (24 * 60 * 60 * 1000));
  return Math.max(0, TRUSTED_DEVICE_DAYS - elapsedDays);
}

export function isDeviceTrustedRow(row: { trustedAt: Date | null; firstSeenAt: Date; revokedAt: Date | null }, now = new Date()) {
  if (row.revokedAt) return false;
  if (row.trustedAt) return true;
  return daysUntilTrusted(row.firstSeenAt, now) <= 0;
}

/** Upsert device from fingerprint; auto-trust first device or after 7 days. */
export async function touchTrustedDevice(opts: {
  userId: string;
  fingerprint: string;
  userAgent?: string | null;
}): Promise<DeviceTrustStatus | null> {
  const fp = opts.fingerprint.trim().slice(0, 128);
  if (!fp || fp === 'unknown') return null;

  const label = parseDeviceLabel(opts.userAgent);
  const now = new Date();

  const existingCount = await prisma.trustedDevice.count({
    where: { userId: opts.userId, revokedAt: null },
  });

  let row = await prisma.trustedDevice.findUnique({
    where: { userId_fingerprint: { userId: opts.userId, fingerprint: fp } },
  });

  if (!row) {
    const trustImmediately = existingCount === 0;
    row = await prisma.trustedDevice.create({
      data: {
        userId: opts.userId,
        fingerprint: fp,
        deviceLabel: label,
        firstSeenAt: now,
        trustedAt: trustImmediately ? now : null,
      },
    });
  } else if (row.revokedAt) {
    // Re-seen revoked device — treat as new waiting period
    row = await prisma.trustedDevice.update({
      where: { id: row.id },
      data: {
        revokedAt: null,
        firstSeenAt: now,
        trustedAt: null,
        deviceLabel: label,
        lastSeenAt: now,
      },
    });
  } else {
    const shouldTrust = !row.trustedAt && daysUntilTrusted(row.firstSeenAt, now) <= 0;
    row = await prisma.trustedDevice.update({
      where: { id: row.id },
      data: {
        lastSeenAt: now,
        deviceLabel: label || row.deviceLabel,
        ...(shouldTrust ? { trustedAt: now } : {}),
      },
    });
  }

  const trusted = isDeviceTrustedRow(row, now);
  const daysLeft = trusted ? 0 : daysUntilTrusted(row.firstSeenAt, now);

  return {
    fingerprint: fp,
    trusted,
    firstSeenAt: row.firstSeenAt,
    trustedAt: row.trustedAt,
    daysLeft,
    isNew: !trusted,
    deviceLabel: row.deviceLabel,
  };
}

export async function getDeviceTrustStatus(userId: string, fingerprint: string | null | undefined): Promise<DeviceTrustStatus | null> {
  const fp = (fingerprint || '').trim().slice(0, 128);
  if (!fp) return null;
  const row = await prisma.trustedDevice.findUnique({
    where: { userId_fingerprint: { userId, fingerprint: fp } },
  });
  if (!row || row.revokedAt) {
    return {
      fingerprint: fp,
      trusted: false,
      firstSeenAt: new Date(),
      trustedAt: null,
      daysLeft: TRUSTED_DEVICE_DAYS,
      isNew: true,
      deviceLabel: null,
    };
  }
  const now = new Date();
  // promote if due
  if (!row.trustedAt && daysUntilTrusted(row.firstSeenAt, now) <= 0) {
    await prisma.trustedDevice.update({ where: { id: row.id }, data: { trustedAt: now } });
    return {
      fingerprint: fp,
      trusted: true,
      firstSeenAt: row.firstSeenAt,
      trustedAt: now,
      daysLeft: 0,
      isNew: false,
      deviceLabel: row.deviceLabel,
    };
  }
  const trusted = isDeviceTrustedRow(row, now);
  return {
    fingerprint: fp,
    trusted,
    firstSeenAt: row.firstSeenAt,
    trustedAt: row.trustedAt,
    daysLeft: trusted ? 0 : daysUntilTrusted(row.firstSeenAt, now),
    isNew: !trusted,
    deviceLabel: row.deviceLabel,
  };
}

/** Gate sensitive account changes from untrusted devices. */
export async function assertTrustedDevice(userId: string, fingerprint: string | null | undefined) {
  const status = await getDeviceTrustStatus(userId, fingerprint);
  if (!status) {
    return {
      ok: false as const,
      message:
        'Не удалось определить устройство. Обновите страницу и повторите с того же браузера, с которого обычно входите.',
      status: null,
    };
  }
  if (!status.trusted) {
    return {
      ok: false as const,
      message: `Это новое устройство. Чувствительные изменения (email, телефон, пароль, удаление аккаунта, завершение сеансов) доступны через ${status.daysLeft} дн. после первого входа с него.`,
      status,
    };
  }
  return { ok: true as const, status };
}

export function hashContact(value: string | null | undefined) {
  if (!value?.trim()) return null;
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}
