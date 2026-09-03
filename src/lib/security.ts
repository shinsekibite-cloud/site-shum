import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

export function parseDeviceLabel(ua: string | null | undefined): string {
  const s = (ua || '').trim();
  if (!s) return 'Неизвестное устройство';
  const mobile = /Mobile|Android|iPhone|iPad/i.test(s);
  let os = 'другое ОС';
  if (/Android/i.test(s)) os = 'Android';
  else if (/iPhone|iPad|iOS/i.test(s)) os = 'iOS';
  else if (/Windows/i.test(s)) os = 'Windows';
  else if (/Mac OS|Macintosh/i.test(s)) os = 'macOS';
  else if (/Linux/i.test(s)) os = 'Linux';

  let browser = 'браузер';
  if (/Edg\//i.test(s)) browser = 'Edge';
  else if (/Chrome\//i.test(s) && !/Edg\//i.test(s)) browser = 'Chrome';
  else if (/Safari\//i.test(s) && !/Chrome\//i.test(s)) browser = 'Safari';
  else if (/Firefox\//i.test(s)) browser = 'Firefox';
  else if (/YaBrowser/i.test(s)) browser = 'Яндекс';

  return `${mobile ? 'Мобильный' : 'ПК'} · ${os} · ${browser}`;
}

export async function clientIpFromHeaders(): Promise<string | null> {
  try {
    const h = await headers();
    const xf = h.get('x-forwarded-for') || h.get('x-real-ip') || '';
    const ip = xf.split(',')[0]?.trim();
    return ip || null;
  } catch {
    return null;
  }
}

export async function userAgentFromHeaders(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get('user-agent');
  } catch {
    return null;
  }
}

export async function recordLoginEvent(opts: {
  userId: string;
  kind?: string;
  success?: boolean;
  fingerprint?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const ip = opts.ip ?? (await clientIpFromHeaders());
  const userAgent = opts.userAgent ?? (await userAgentFromHeaders());
  const deviceLabel = parseDeviceLabel(userAgent);
  try {
    return await prisma.loginEvent.create({
      data: {
        userId: opts.userId,
        ip,
        userAgent: userAgent?.slice(0, 500) || null,
        fingerprint: opts.fingerprint?.slice(0, 128) || null,
        deviceLabel,
        success: opts.success !== false,
        kind: opts.kind || 'LOGIN',
      },
    });
  } catch (e) {
    console.warn('recordLoginEvent', e);
    return null;
  }
}

export async function createUserNotification(opts: {
  userId: string;
  type: string;
  title: string;
  body: string;
  meta?: Record<string, unknown>;
  /** Force silent (no web-push). If omitted, follows org work hours. */
  silent?: boolean;
}) {
  try {
    const { isModuleEnabled } = await import('@/lib/module-flags');
    if (!(await isModuleEnabled('notifications'))) return null;

    const { parseNotificationPrefs, isNotificationTypeMuted } = await import(
      '@/lib/notification-prefs'
    );
    const user = await prisma.user.findUnique({
      where: { id: opts.userId },
      select: { notificationPrefsJson: true, deletedAt: true },
    });
    if (!user || user.deletedAt) return null;
    const prefs = parseNotificationPrefs(user.notificationPrefsJson);
    if (isNotificationTypeMuted(prefs, opts.type)) {
      return null;
    }

    let silent = opts.silent === true;
    if (opts.silent === undefined) {
      try {
        const { shouldDeliverSilently } = await import('@/lib/org-work-hours');
        silent = await shouldDeliverSilently();
      } catch {
        silent = false;
      }
    }

    const meta = {
      ...(opts.meta || {}),
      ...(silent ? { silent: true } : {}),
    };

    const row = await prisma.userNotification.create({
      data: {
        userId: opts.userId,
        type: opts.type,
        title: opts.title,
        body: opts.body,
        meta: Object.keys(meta).length ? JSON.stringify(meta) : null,
      },
    });

    void import('@/lib/notification-hub')
      .then(({ notificationHub }) => {
        notificationHub.publish(opts.userId, {
          id: row.id,
          type: row.type,
          title: row.title,
          body: row.body,
          createdAt: row.createdAt.toISOString(),
          meta: row.meta,
        });
      })
      .catch(() => null);

    // Off-hours / silent: keep in-app inbox + badge, skip OS push toast/sound
    if (!silent && prefs.push !== false) {
      void import('@/lib/web-push')
        .then(({ pushForNotification }) =>
          pushForNotification({
            userId: opts.userId,
            type: opts.type,
            title: opts.title,
            body: opts.body,
            meta: meta,
            notificationId: row.id,
          })
        )
        .catch(() => null);
    }
    return row;
  } catch (e) {
    console.warn('createUserNotification', e);
    return null;
  }
}

/** Notify organizers / staff with scanner rights that a guest arrived */
export async function notifyStaffCheckIn(opts: {
  guestName: string;
  eventTitle: string;
  spaceTitle?: string | null;
  bookingId: string;
  guestId: string;
  checkInId?: string;
}) {
  const staff = await prisma.user.findMany({
    where: {
      OR: [
        { role: 'ADMIN' },
        { role: 'SCANNER' },
        { role: 'MODERATOR', permissions: { contains: 'scanner' } },
      ],
      blockedAt: null,
    },
    select: { id: true },
    take: 40,
  });

  const title = 'Участник на месте';
  const body = `${opts.guestName || 'Участник'} · ${opts.eventTitle}${
    opts.spaceTitle ? ` · ${opts.spaceTitle}` : ''
  }`;

  await Promise.all(
    staff.map((s) =>
      createUserNotification({
        userId: s.id,
        type: 'CHECK_IN',
        title,
        body,
        meta: {
          bookingId: opts.bookingId,
          guestId: opts.guestId,
          checkInId: opts.checkInId || null,
          guestName: opts.guestName,
          eventTitle: opts.eventTitle,
          spaceTitle: opts.spaceTitle || null,
          href: '/scanner',
        },
      })
    )
  );
}
