/** Build a minimal iCalendar (.ics) event attachment */

import { hostFromOrigin, originFromEnv } from '@/lib/site-identity-shared';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function toIcsUtc(d: Date) {
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

function escapeText(s: string) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export type CalendarEventOpts = {
  uid: string;
  /** Domain part of UID — defaults to env/public host */
  uidHost?: string;
  title: string;
  description?: string | null;
  location?: string | null;
  start: Date;
  end: Date;
  url?: string | null;
};

export function buildEventIcs(opts: CalendarEventOpts) {
  const now = toIcsUtc(new Date());
  const uidHost = (opts.uidHost || hostFromOrigin(originFromEnv())).replace(/[^a-z0-9.-]/gi, '') || 'py.idivles.ru';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//YoungPortal//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeText(opts.uid)}@${uidHost}`,
    `DTSTAMP:${now}`,
    `DTSTART:${toIcsUtc(opts.start)}`,
    `DTEND:${toIcsUtc(opts.end)}`,
    `SUMMARY:${escapeText(opts.title)}`,
  ];
  if (opts.description) lines.push(`DESCRIPTION:${escapeText(opts.description)}`);
  if (opts.location) lines.push(`LOCATION:${escapeText(opts.location)}`);
  if (opts.url) lines.push(`URL:${escapeText(opts.url)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * Yandex Calendar «create event» web URL — desktop only.
 * On mobile, calendar.yandex.ru/* redirects guests to 360.yandex.ru/calendar/ marketing
 * page, so never open this URL from phones.
 */
export function buildYandexCalendarUrl(opts: {
  title: string;
  description?: string | null;
  location?: string | null;
  start: Date;
  end: Date;
}) {
  const params = new URLSearchParams({
    name: opts.title,
    // Yandex expects unix ms
    start_ts: String(opts.start.getTime()),
    end_ts: String(opts.end.getTime()),
  });
  if (opts.description) params.set('description', opts.description.slice(0, 500));
  if (opts.location) params.set('location', opts.location.slice(0, 200));
  return `https://calendar.yandex.ru/event?${params.toString()}`;
}

/** Current Play Store package for consumer Yandex Calendar (not ru.yandex.calendar). */
export const YANDEX_CALENDAR_ANDROID_PACKAGE = 'com.yandex.calendar.app';

/** https → webcal so the OS hands the file to a calendar app. */
export function toWebcalUrl(httpsUrl: string) {
  return httpsUrl.replace(/^https:/i, 'webcal:').replace(/^http:/i, 'webcal:');
}

/** Query string for our public ICS endpoint */
export function buildIcsQuery(opts: CalendarEventOpts & { inline?: boolean }) {
  const params = new URLSearchParams({
    uid: opts.uid,
    title: opts.title,
    start: opts.start.toISOString(),
    end: opts.end.toISOString(),
  });
  if (opts.description) params.set('description', opts.description);
  if (opts.location) params.set('location', opts.location);
  if (opts.url) params.set('url', opts.url);
  if (opts.inline) params.set('inline', '1');
  return params.toString();
}

type AddEventIntentOpts = {
  title: string;
  description?: string | null;
  location?: string | null;
  start: Date;
  end: Date;
  /**
   * https fallback when the Intent cannot be handled.
   * Must NOT be calendar.yandex.ru / 360 — those are marketing pages for guests.
   */
  fallbackUrl?: string;
  /** Pin to a specific calendar package (omit → system chooser) */
  packageName?: string | null;
};

/**
 * Android Chrome Intent: native «Add event» form.
 * With package → opens Yandex Calendar directly when installed.
 * Without package → OS chooser (user can pick Яндекс Календарь).
 */
export function buildAndroidAddEventIntent(opts: AddEventIntentOpts) {
  const parts = [
    'action=android.intent.action.INSERT',
    'type=vnd.android.cursor.item/event',
    'category=android.intent.category.DEFAULT',
    `S.title=${encodeURIComponent(opts.title)}`,
    `l.beginTime=${opts.start.getTime()}`,
    `l.endTime=${opts.end.getTime()}`,
  ];
  if (opts.description) {
    parts.push(`S.description=${encodeURIComponent(opts.description)}`);
  }
  if (opts.location) {
    parts.push(`S.eventLocation=${encodeURIComponent(opts.location)}`);
  }
  if (opts.packageName) {
    parts.push(`package=${opts.packageName}`);
  }
  if (opts.fallbackUrl) {
    parts.push(`S.browser_fallback_url=${encodeURIComponent(opts.fallbackUrl)}`);
  }
  parts.push('end');
  // Host path helps some Chrome versions resolve INSERT intents from the web.
  return `intent://com.android.calendar/event#Intent;${parts.join(';')}`;
}

/** Launch Yandex Calendar app home screen (no event prefill). */
export function buildAndroidYandexLaunchIntent(fallbackUrl?: string) {
  const parts = [
    'action=android.intent.action.MAIN',
    'category=android.intent.category.LAUNCHER',
    `package=${YANDEX_CALENDAR_ANDROID_PACKAGE}`,
  ];
  if (fallbackUrl) {
    parts.push(`S.browser_fallback_url=${encodeURIComponent(fallbackUrl)}`);
  }
  parts.push('end');
  return `intent://#Intent;${parts.join(';')}`;
}

/**
 * Force-open calendar.yandex.ru inside the Yandex Calendar app via verified App Link.
 * Never use as a naked https navigation — guests get 360 landing in the browser.
 * Prefer INSERT intents; this is only a last-ditch «open the app» attempt.
 */
export function buildAndroidYandexAppOpenIntent(fallbackUrl?: string) {
  const parts = [
    'scheme=https',
    'action=android.intent.action.VIEW',
    'category=android.intent.category.BROWSABLE',
    `package=${YANDEX_CALENDAR_ANDROID_PACKAGE}`,
  ];
  if (fallbackUrl) {
    parts.push(`S.browser_fallback_url=${encodeURIComponent(fallbackUrl)}`);
  }
  parts.push('end');
  return `intent://calendar.yandex.ru/#Intent;${parts.join(';')}`;
}

export function isAndroidUa(ua?: string) {
  if (typeof ua === 'string') return /Android/i.test(ua);
  if (typeof navigator !== 'undefined') return /Android/i.test(navigator.userAgent);
  return false;
}

export function isIosUa(ua?: string) {
  if (typeof ua === 'string') return /iPhone|iPad|iPod/i.test(ua);
  if (typeof navigator !== 'undefined') return /iPhone|iPad|iPod/i.test(navigator.userAgent);
  return false;
}
