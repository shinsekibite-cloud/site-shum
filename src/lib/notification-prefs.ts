/**
 * Server-side notification preferences (User.notificationPrefsJson).
 */
import type { NotificationTypeId } from '@/lib/notification-meta';
import { NOTIFICATION_TYPE_OPTIONS } from '@/lib/notification-meta';

export type NotificationPrefs = {
  /** Types hidden from inbox + blocked from create/push */
  muted: NotificationTypeId[];
  /** Future: daily email digest */
  emailDigest: boolean;
  /** Soft cue when opening the bell with unread */
  sound: boolean;
  /** Allow web-push for this account */
  push: boolean;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  muted: [],
  emailDigest: false,
  sound: true,
  push: true,
};

const VALID = new Set(NOTIFICATION_TYPE_OPTIONS.map((o) => o.id));

export function parseNotificationPrefs(raw: unknown): NotificationPrefs {
  if (!raw) return { ...DEFAULT_NOTIFICATION_PREFS, muted: [] };
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data || typeof data !== 'object') return { ...DEFAULT_NOTIFICATION_PREFS, muted: [] };
    const mutedRaw = Array.isArray((data as { muted?: unknown }).muted)
      ? ((data as { muted: unknown[] }).muted as unknown[])
      : [];
    const muted = mutedRaw
      .map((x) => String(x))
      .filter((x): x is NotificationTypeId => VALID.has(x as NotificationTypeId));
    return {
      muted,
      emailDigest: Boolean((data as { emailDigest?: unknown }).emailDigest),
      sound: (data as { sound?: unknown }).sound !== false,
      push: (data as { push?: unknown }).push !== false,
    };
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFS, muted: [] };
  }
}

export function serializeNotificationPrefs(prefs: NotificationPrefs): string {
  return JSON.stringify({
    muted: prefs.muted.slice(0, 32),
    emailDigest: Boolean(prefs.emailDigest),
    sound: prefs.sound !== false,
    push: prefs.push !== false,
  });
}

export function isNotificationTypeMuted(prefs: NotificationPrefs, type: string): boolean {
  return prefs.muted.includes(type as NotificationTypeId);
}
