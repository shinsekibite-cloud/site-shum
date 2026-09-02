/** Shared helpers for club tags / gallery parsing */

import { galleryUrls, parseGalleryItems, serializeGalleryUrls } from '@/lib/gallery-shared';

/** Normalize club tags from JSON array or comma/semicolon-separated text. */
export function parseClubTags(raw?: string | null): string[] {
  if (!raw?.trim()) return [];
  const trimmed = raw.trim();

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((t) => String(t).trim())
          .filter(Boolean)
          .slice(0, 12);
      }
    } catch {
      // fall through to delimiter split
    }
  }

  return trimmed
    .split(/[,;|]/)
    .map((t) =>
      t
        .trim()
        .replace(/^\[+|\]+$/g, '')
        .replace(/^["'«]+|["'»]+$/g, '')
        .trim()
    )
    .filter(Boolean)
    .slice(0, 12);
}

/** Persist tags as a simple comma-separated string for admin/CMS edits. */
export function serializeClubTags(tags: string[] | string | null | undefined): string | null {
  const list = Array.isArray(tags)
    ? tags
    : parseClubTags(typeof tags === 'string' ? tags : '');
  const clean = list.map((t) => t.trim()).filter(Boolean).slice(0, 12);
  return clean.length ? clean.join(', ') : null;
}

export function parseGalleryInput(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== 'string') return null;
  return serializeGalleryUrls(galleryUrls(parseGalleryItems(raw, 24)), 24);
}

export function parseGalleryJson(raw?: string | null): string[] {
  return galleryUrls(parseGalleryItems(raw, 48));
}

export function stripHtml(html?: string | null): string {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

const URL_RE =
  /(?:https?:\/\/)?(?:t\.me|telegram\.me)\/[^\s<>"']+|https?:\/\/[^\s<>"']+/gi;

/** Normalize a club signup / invite URL (Telegram invite, bot, form, …). */
export function normalizeClubSignupUrl(raw?: string | null): string | null {
  const t = String(raw || '').trim();
  if (!t) return null;
  let u = t;
  if (u.startsWith('@')) u = `https://t.me/${u.slice(1)}`;
  else if (/^t\.me\//i.test(u) || /^telegram\.me\//i.test(u)) u = `https://${u}`;
  else if (!/^https?:\/\//i.test(u) && /^[a-z0-9_+./%-]+$/i.test(u)) {
    // bare path-ish — only accept if looks like t.me username
    if (/^[a-zA-Z0-9_]{4,32}$/.test(u)) u = `https://t.me/${u}`;
    else return null;
  }
  try {
    const parsed = new URL(u);
    if (!/^https?:$/i.test(parsed.protocol)) return null;
    return parsed.toString().replace(/[),.;]+$/g, '');
  } catch {
    return null;
  }
}

/** Prefer explicit signupUrl; otherwise extract first t.me / https link from description. */
export function resolveClubSignupUrl(club: {
  signupUrl?: string | null;
  description?: string | null;
}): string | null {
  const explicit = normalizeClubSignupUrl(club.signupUrl);
  if (explicit) return explicit;
  const text = stripHtml(club.description);
  const matches = text.match(URL_RE) || [];
  for (const m of matches) {
    const n = normalizeClubSignupUrl(m);
    if (n) return n;
  }
  return null;
}

export function signupCtaLabel(url: string): string {
  if (/t\.me|telegram\.me/i.test(url)) return 'Записаться в Telegram';
  if (/vk\.com|vk\.ru/i.test(url)) return 'Записаться ВКонтакте';
  return 'Перейти к записи';
}

/** Remove bare «Запись: url» lines from HTML so the CTA button is the primary action. */
export function stripSignupLinesFromHtml(html?: string | null, signupUrl?: string | null): string {
  let out = String(html || '');
  if (!out.trim()) return out;
  // Common patterns: Запись: https://…  or plain URL paragraphs
  out = out.replace(
    /(?:<p[^>]*>\s*)?(?:<[^>]+>\s*)*Запись\s*[:：]?\s*(?:<a[^>]*>)?(?:https?:\/\/)?(?:t\.me|telegram\.me)\/[^<\s]+(?:<\/a>)?\s*(?:<\/[^>]+>\s*)*(?:<\/p>)?/gi,
    ''
  );
  if (signupUrl) {
    const escaped = signupUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(?:<p[^>]*>\\s*)?${escaped}\\s*(?:</p>)?`, 'gi'), '');
    const bare = signupUrl.replace(/^https?:\/\//i, '');
    if (bare !== signupUrl) {
      const e2 = bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(`(?:<p[^>]*>\\s*)?(?:https?:\\/\\/)?${e2}\\s*(?:</p>)?`, 'gi'), '');
    }
  }
  return out.replace(/(<p>\s*<\/p>)+/gi, '').trim();
}
