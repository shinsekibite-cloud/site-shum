import webpush from 'web-push';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { getUploadRoot } from '@/lib/upload-root';

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  type?: string;
};

type VapidKeys = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

/** Prefer data/ (not web-aliased). Legacy path kept for one-shot migration. */
function vapidFilePath() {
  return path.join(process.cwd(), 'data', '.vapid-keys.json');
}

function legacyVapidFilePath() {
  return path.join(getUploadRoot(), '.vapid-keys.json');
}

let cachedKeys: VapidKeys | null = null;
let vapidConfigured = false;

function defaultSubject() {
  const fromEnv = process.env.VAPID_SUBJECT?.trim();
  if (fromEnv) return fromEnv;
  try {
    const origin = process.env.NEXTAUTH_URL || 'https://py.idivles.ru';
    const host = new URL(origin).hostname;
    return `mailto:noreply@${host}`;
  } catch {
    return 'mailto:noreply@py.idivles.ru';
  }
}

async function loadOrCreateVapidKeys(): Promise<VapidKeys> {
  if (cachedKeys) return cachedKeys;

  const envPub = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPriv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (envPub && envPriv) {
    cachedKeys = {
      publicKey: envPub,
      privateKey: envPriv,
      subject: defaultSubject(),
    };
    return cachedKeys;
  }

  for (const file of [vapidFilePath(), legacyVapidFilePath()]) {
    try {
      const raw = await readFile(file, 'utf8');
      const parsed = JSON.parse(raw) as { publicKey?: string; privateKey?: string; subject?: string };
      if (parsed.publicKey && parsed.privateKey) {
        cachedKeys = {
          publicKey: parsed.publicKey,
          privateKey: parsed.privateKey,
          subject: parsed.subject || defaultSubject(),
        };
        // Migrate off the public uploads tree when found on legacy path
        if (file === legacyVapidFilePath()) {
          try {
            const dest = vapidFilePath();
            await mkdir(path.dirname(dest), { recursive: true });
            await writeFile(dest, JSON.stringify(cachedKeys, null, 2), { mode: 0o600 });
          } catch (e) {
            console.warn('web-push: could not migrate VAPID keys to data/', e);
          }
        }
        return cachedKeys;
      }
    } catch {
      /* try next / generate */
    }
  }

  const generated = webpush.generateVAPIDKeys();
  const keys: VapidKeys = {
    publicKey: generated.publicKey,
    privateKey: generated.privateKey,
    subject: defaultSubject(),
  };
  try {
    const file = vapidFilePath();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(keys, null, 2), { mode: 0o600 });
  } catch (e) {
    console.warn('web-push: could not persist VAPID keys', e);
  }
  cachedKeys = keys;
  return keys;
}

async function ensureVapidConfigured() {
  const keys = await loadOrCreateVapidKeys();
  if (!vapidConfigured) {
    webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
    vapidConfigured = true;
  }
  return keys;
}

export async function getVapidPublicKey(): Promise<string> {
  const keys = await ensureVapidConfigured();
  return keys.publicKey;
}

function hrefFromMeta(meta?: string | Record<string, unknown> | null): string | undefined {
  try {
    const obj =
      typeof meta === 'string'
        ? (JSON.parse(meta) as { href?: unknown })
        : meta && typeof meta === 'object'
          ? meta
          : null;
    if (obj && typeof obj.href === 'string' && obj.href.startsWith('/')) return obj.href;
  } catch {
    /* ignore */
  }
  return undefined;
}

export function defaultUrlForNotificationType(type: string): string {
  switch (type) {
    case 'MESSAGE':
      return '/messages';
    case 'FRIEND_REQUEST':
      return '/friends';
    case 'BOOKING_REQUEST':
      return '/admin/bookings';
    case 'CHECK_IN':
      return '/tickets';
    case 'PORTFOLIO':
      return '/dashboard/portfolio';
    case 'MODERATION':
      return '/dashboard';
    case 'SECURITY':
      return '/dashboard#profile-edit';
    case 'SYSTEM':
      return '/dashboard';
    default:
      return '/dashboard';
  }
}

/** Send Web Push to all of the user's subscribed browsers/devices. */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  try {
    await ensureVapidConfigured();
    const subs = await prisma.pushSubscription.findMany({ where: { userId } });
    if (!subs.length) return { sent: 0, failed: 0 };

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || '/dashboard',
      tag: payload.tag || `yp-${payload.type || 'notif'}`,
      type: payload.type || 'SYSTEM',
    });

    let sent = 0;
    let failed = 0;
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            body,
            { TTL: 60 * 60 * 12, urgency: 'normal' }
          );
          sent += 1;
        } catch (e: unknown) {
          failed += 1;
          const status = (e as { statusCode?: number })?.statusCode;
          // Gone / expired subscription
          if (status === 404 || status === 410) {
            await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => null);
          } else {
            console.warn('web-push send failed', status || e);
          }
        }
      })
    );
    return { sent, failed };
  } catch (e) {
    console.warn('sendPushToUser', e);
    return { sent: 0, failed: 0 };
  }
}

/** Push after an in-app notification row exists (or for tx-created rows). */
export async function pushForNotification(opts: {
  userId: string;
  type: string;
  title: string;
  body: string;
  meta?: string | Record<string, unknown> | null;
  notificationId?: string;
  /** Skip OS push (off-hours). If omitted, follows org work hours. */
  silent?: boolean;
}) {
  let silent = opts.silent === true;
  if (opts.silent === undefined) {
    try {
      if (opts.meta && typeof opts.meta === 'object' && (opts.meta as { silent?: unknown }).silent === true) {
        silent = true;
      } else if (typeof opts.meta === 'string' && opts.meta.includes('"silent":true')) {
        silent = true;
      } else {
        const { shouldDeliverSilently } = await import('@/lib/org-work-hours');
        silent = await shouldDeliverSilently();
      }
    } catch {
      silent = false;
    }
  }
  if (silent) return { sent: 0, failed: 0, skipped: 'silent' as const };

  const url =
    hrefFromMeta(opts.meta) || defaultUrlForNotificationType(opts.type);
  return sendPushToUser(opts.userId, {
    title: opts.title,
    body: opts.body,
    url,
    type: opts.type,
    tag: opts.notificationId ? `yp-n-${opts.notificationId}` : `yp-${opts.type}`,
  });
}

export async function savePushSubscription(opts: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}) {
  return prisma.pushSubscription.upsert({
    where: { endpoint: opts.endpoint },
    create: {
      userId: opts.userId,
      endpoint: opts.endpoint,
      p256dh: opts.p256dh,
      auth: opts.auth,
      userAgent: opts.userAgent?.slice(0, 400) || null,
    },
    update: {
      userId: opts.userId,
      p256dh: opts.p256dh,
      auth: opts.auth,
      userAgent: opts.userAgent?.slice(0, 400) || null,
    },
  });
}

export async function removePushSubscription(opts: {
  userId: string;
  endpoint?: string;
  all?: boolean;
}) {
  if (opts.all) {
    return prisma.pushSubscription.deleteMany({ where: { userId: opts.userId } });
  }
  if (!opts.endpoint) return { count: 0 };
  return prisma.pushSubscription.deleteMany({
    where: { userId: opts.userId, endpoint: opts.endpoint },
  });
}
