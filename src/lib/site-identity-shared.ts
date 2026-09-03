/** Sync site helpers — safe for client and server (no Prisma). */

/** Generic default for fresh installs. Production sets siteName in DB. */
export const DEFAULT_SITE_NAME = 'Молодёжь Сочи';
export const DEFAULT_PUBLIC_ORIGIN = 'http://localhost:3000';

export function normalizeDisplaySiteName(raw?: string | null) {
  const t = String(raw || '').trim();
  return t || DEFAULT_SITE_NAME;
}

/**
 * Soft line breaks for long official titles in the header brand.
 * Short names like «Молодёжь Сочи» stay on one line — splitting them
 * made the sticky header jump and look like a two-line stack.
 */
export function brandNameLines(raw?: string | null): string[] {
  const name = normalizeDisplaySiteName(raw);
  const crm = name.match(/^(Центр развития)\s+(молод[её]жи\s+Сочи)$/iu);
  if (crm) return [crm[1], crm[2]];
  if (name.length <= 24) return [name];
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length < 3) return [name];
  const mid = Math.ceil(parts.length / 2);
  return [parts.slice(0, mid).join(' '), parts.slice(mid).join(' ')].filter(Boolean);
}

export type SiteIdentity = {
  siteName: string;
  publicOrigin: string;
  shortName: string;
  host: string;
};

export function normalizeOrigin(raw?: string | null): string {
  let s = String(raw || '')
    .trim()
    .replace(/\/$/, '');
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!u.hostname) return '';
    return `${u.protocol}//${u.host}`.replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function isLocalOrigin(origin: string) {
  return /0\.0\.0\.0|127\.0\.0\.1|localhost/i.test(origin);
}

export function originFromEnv(opts?: { allowLocal?: boolean }): string {
  const env = normalizeOrigin(process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL);
  if (!env) return DEFAULT_PUBLIC_ORIGIN;
  if (!opts?.allowLocal && isLocalOrigin(env)) return DEFAULT_PUBLIC_ORIGIN;
  return env;
}

export function shortSiteName(name: string) {
  const n = name.trim() || DEFAULT_SITE_NAME;
  return n.length > 14 ? `${n.slice(0, 13)}…` : n;
}

export function hostFromOrigin(origin: string) {
  try {
    return new URL(origin).hostname || 'localhost';
  } catch {
    return 'localhost';
  }
}

/** Sync helper when settings row is already loaded (or missing). */
export function identityFromSettings(settings?: {
  siteName?: string | null;
  publicSiteUrl?: string | null;
} | null): SiteIdentity {
  const siteName = normalizeDisplaySiteName(settings?.siteName);
  const fromSettings = normalizeOrigin(settings?.publicSiteUrl);
  const publicOrigin = fromSettings || originFromEnv({ allowLocal: true });
  return {
    siteName,
    publicOrigin,
    shortName: shortSiteName(siteName),
    host: hostFromOrigin(publicOrigin),
  };
}

export function applySitePlaceholders(text: string, id: SiteIdentity): string {
  if (!text) return text;
  let out = text;
  out = out.replace(/\{\{\s*SITE_NAME\s*\}\}/g, id.siteName);
  out = out.replace(/\{\{\s*SITE_ORIGIN\s*\}\}/g, id.publicOrigin);
  out = out.replace(/\{\{\s*SITE_HOST\s*\}\}/g, id.host);
  return out;
}

/**
 * Page title fragment for Next.js Metadata.
 * Root layout already applies `title.template = "%s | ${siteName}"` —
 * do NOT append the brand here or titles become "Page | Brand | Brand".
 */
export function withSiteBrand(pageTitle: string, siteName: string) {
  const brand = siteName.trim() || DEFAULT_SITE_NAME;
  const page = pageTitle.trim();
  if (!page) return brand;
  const suffix = ` | ${brand}`;
  if (page === brand) return page;
  if (page.endsWith(suffix)) return page.slice(0, -suffix.length) || page;
  if (page.includes(suffix)) return page.split(suffix)[0]?.trim() || page;
  return page;
}
