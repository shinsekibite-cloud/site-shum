#!/usr/bin/env node
/**
 * Apply site identity after install / domain move.
 * Updates SiteSettings and rewrites CMS legal pages (privacy/rules/terms/about)
 * so old hostnames and site titles do not remain in policies.
 *
 * Env / flags:
 *   SITE_NAME / --site-name          new portal title (required)
 *   PUBLIC_URL / --public-url        https://new.example.ru
 *   OLD_SITE_NAMES / --old-names     comma list to replace (defaults include Sochi titles)
 *   OLD_HOSTS / --old-hosts          comma list of old hostnames
 *   CONTACT_EMAIL, CONTACT_PHONE, ADDRESS  optional SiteSettings contacts
 *   REPLACE_LEGAL=1 (default)        rewrite PageContent HTML
 *   DRY_RUN=1                        print plan only
 *
 * Usage:
 *   SITE_NAME='Портал X' PUBLIC_URL=https://portal.x.ru \
 *     node scripts/apply-site-identity.mjs
 *   docker exec -e SITE_NAME=… -e PUBLIC_URL=… sochi-portal-web-1 \
 *     node /app/scripts/apply-site-identity.mjs
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const LEGAL_SLUGS = ['privacy', 'about', 'rules', 'terms'];

const DEFAULT_OLD_NAMES = [
  'Центр развития молодежи Сочи',
  'Центр развития молодёжи Сочи',
  'Дом молодёжи г. Сочи',
  'Дом молодежи г. Сочи',
  'Молодёжь Сочи',
  'Молодежь Сочи',
  'YoungPortal',
];

const DEFAULT_OLD_HOSTS = [
  'ty.idivles.ru',
  'py.idivles.ru',
  'young.idivles.ru',
  'y1.idivles.ru',
  'portal.example.ru',
  'test.example.ru',
];

function arg(name, envName, fallback = '') {
  const long = `--${name}`;
  const i = process.argv.indexOf(long);
  if (i >= 0 && process.argv[i + 1] && !String(process.argv[i + 1]).startsWith('--')) {
    return process.argv[i + 1];
  }
  const eq = process.argv.find((a) => a.startsWith(`${long}=`));
  if (eq) return eq.slice(long.length + 1);
  return process.env[envName] || fallback;
}

function parseList(s) {
  return String(s || '')
    .split(/[,|]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function normalizeOrigin(raw) {
  let s = String(raw || '')
    .trim()
    .replace(/\/$/, '');
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}`.replace(/\/$/, '');
  } catch {
    return '';
  }
}

function hostFromOrigin(origin) {
  try {
    return new URL(origin).hostname || '';
  } catch {
    return '';
  }
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Longest-first so «Центр…» wins over «Молодёжь Сочи». */
function replaceNames(text, oldNames, newName) {
  let out = text;
  const sorted = [...oldNames].sort((a, b) => b.length - a.length);
  for (const old of sorted) {
    if (!old || old === newName) continue;
    // Prefer CMS placeholder so future renames stay one-shot
    out = out.replace(new RegExp(escapeRegExp(old), 'gi'), '{{SITE_NAME}}');
  }
  // Also fold the new concrete title into placeholder when already present
  if (newName) {
    out = out.replace(new RegExp(escapeRegExp(newName), 'g'), '{{SITE_NAME}}');
  }
  return out;
}

function replaceHosts(text, oldHosts, newHost, newOrigin) {
  let out = text;
  for (const host of oldHosts) {
    if (!host || (newHost && host.toLowerCase() === newHost.toLowerCase())) continue;
    out = out.replace(new RegExp(`https?://${escapeRegExp(host)}`, 'gi'), '{{SITE_ORIGIN}}');
    out = out.replace(new RegExp(escapeRegExp(host), 'gi'), '{{SITE_HOST}}');
  }
  if (newHost) {
    out = out.replace(new RegExp(`https?://${escapeRegExp(newHost)}`, 'gi'), '{{SITE_ORIGIN}}');
    out = out.replace(new RegExp(escapeRegExp(newHost), 'gi'), '{{SITE_HOST}}');
  }
  if (newOrigin) {
    out = out.replace(new RegExp(escapeRegExp(newOrigin), 'gi'), '{{SITE_ORIGIN}}');
  }
  return out;
}

function ensurePlaceholders(html) {
  let out = html;
  out = out.replace(/\{\{\s*SITE_NAME\s*\}\}/gi, '{{SITE_NAME}}');
  out = out.replace(/\{\{\s*SITE_ORIGIN\s*\}\}/gi, '{{SITE_ORIGIN}}');
  out = out.replace(/\{\{\s*SITE_HOST\s*\}\}/gi, '{{SITE_HOST}}');
  return out;
}

const siteName = String(arg('site-name', 'SITE_NAME', '')).trim();
const publicUrl = normalizeOrigin(arg('public-url', 'PUBLIC_URL', process.env.NEXTAUTH_URL || ''));
const oldNames = [
  ...parseList(arg('old-names', 'OLD_SITE_NAMES', '')),
  ...DEFAULT_OLD_NAMES,
].filter((v, i, a) => a.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i);
const oldHosts = [
  ...parseList(arg('old-hosts', 'OLD_HOSTS', '')),
  ...DEFAULT_OLD_HOSTS,
].filter((v, i, a) => a.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i);
const contactEmail = String(arg('contact-email', 'CONTACT_EMAIL', '')).trim();
const contactPhone = String(arg('contact-phone', 'CONTACT_PHONE', '')).trim();
const address = String(arg('address', 'ADDRESS', '')).trim();
const replaceLegal = String(arg('replace-legal', 'REPLACE_LEGAL', '1')) !== '0';
const dryRun = String(arg('dry-run', 'DRY_RUN', '0')) === '1' || process.argv.includes('--dry-run');

if (!siteName) {
  console.error('SITE_NAME / --site-name required');
  process.exit(1);
}

const newHost = hostFromOrigin(publicUrl);
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  console.log('apply-site-identity:', {
    siteName,
    publicUrl: publicUrl || '(unchanged)',
    replaceLegal,
    dryRun,
    oldNames: oldNames.length,
    oldHosts: oldHosts.length,
  });

  const update = {
    siteName,
    ...(publicUrl ? { publicSiteUrl: publicUrl } : {}),
    ...(contactEmail ? { contactEmail } : {}),
    ...(contactPhone ? { contactPhone } : {}),
    ...(address ? { address } : {}),
  };

  if (dryRun) {
    console.log('DRY_RUN SiteSettings update:', update);
  } else {
    await prisma.siteSettings.upsert({
      where: { id: '1' },
      create: {
        id: '1',
        siteName,
        publicSiteUrl: publicUrl || null,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
        address: address || null,
      },
      update,
    });
    console.log('SiteSettings updated');
  }

  if (!replaceLegal) {
    console.log('REPLACE_LEGAL=0 — skip PageContent');
    return;
  }

  const pages = await prisma.pageContent.findMany({
    where: { slug: { in: [...LEGAL_SLUGS] } },
    select: { id: true, slug: true, title: true, content: true },
  });

  let changed = 0;
  for (const page of pages) {
    let content = String(page.content || '');
    let title = String(page.title || '');
    const before = content;
    content = replaceNames(content, oldNames, siteName);
    title = replaceNames(title, oldNames, siteName);
    if (newHost && publicUrl) {
      content = replaceHosts(content, oldHosts, newHost, publicUrl);
      title = replaceHosts(title, oldHosts, newHost, publicUrl);
    }
    content = ensurePlaceholders(content);

    if (content === before && title === page.title) {
      console.log(`  ${page.slug}: unchanged`);
      continue;
    }
    changed += 1;
    if (dryRun) {
      console.log(`  ${page.slug}: would update (${before.length} → ${content.length} chars)`);
      continue;
    }
    await prisma.pageContent.update({
      where: { id: page.id },
      data: { content, ...(title !== page.title ? { title } : {}) },
    });
    console.log(`  ${page.slug}: updated`);
  }

  console.log(`legal pages updated: ${changed}/${pages.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
