#!/usr/bin/env node
/**
 * Verify site identity after apply-site-identity / install.
 * Fails if privacy/rules/terms/about still contain old hosts or miss the new site name.
 *
 * Env:
 *   SITE_NAME, PUBLIC_URL
 *   OLD_SITE_NAMES, OLD_HOSTS (same defaults as apply-site-identity)
 *   REQUIRE_NAME_IN_LEGAL=1 (default) — each legal page must mention SITE_NAME
 *
 * Exit 0 = OK, 1 = problems found.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const LEGAL_SLUGS = ['privacy', 'about', 'rules', 'terms'];

const DEFAULT_OLD_NAMES = [
  'Центр развития молодежи Сочи',
  'Центр развития молодёжи Сочи',
  'Молодёжь Сочи',
  'Молодежь Сочи',
];

const DEFAULT_OLD_HOSTS = [
  'ty.idivles.ru',
  'py.idivles.ru',
  'young.idivles.ru',
  'y1.idivles.ru',
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

const siteName = String(arg('site-name', 'SITE_NAME', '')).trim();
const publicUrl = normalizeOrigin(arg('public-url', 'PUBLIC_URL', process.env.NEXTAUTH_URL || ''));
const requireName = String(arg('require-name', 'REQUIRE_NAME_IN_LEGAL', '1')) !== '0';
const oldNames = [
  ...parseList(arg('old-names', 'OLD_SITE_NAMES', '')),
  ...DEFAULT_OLD_NAMES,
].filter((v, i, a) => a.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i);
const oldHosts = [
  ...parseList(arg('old-hosts', 'OLD_HOSTS', '')),
  ...DEFAULT_OLD_HOSTS,
].filter((v, i, a) => a.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const problems = [];
  const settings = await prisma.siteSettings.findUnique({ where: { id: '1' } });
  if (!settings) {
    problems.push('SiteSettings row missing');
  } else {
    if (siteName && settings.siteName !== siteName) {
      problems.push(`SiteSettings.siteName="${settings.siteName}" ≠ expected "${siteName}"`);
    }
    if (publicUrl && settings.publicSiteUrl) {
      const got = String(settings.publicSiteUrl).replace(/\/$/, '');
      if (got !== publicUrl) {
        problems.push(`SiteSettings.publicSiteUrl="${got}" ≠ expected "${publicUrl}"`);
      }
    }
    console.log('SiteSettings:', {
      siteName: settings.siteName,
      publicSiteUrl: settings.publicSiteUrl,
    });
  }

  const newHost = publicUrl ? new URL(publicUrl).hostname : '';
  const pages = await prisma.pageContent.findMany({
    where: { slug: { in: [...LEGAL_SLUGS] } },
    select: { slug: true, title: true, content: true },
  });
  const bySlug = Object.fromEntries(pages.map((p) => [p.slug, p]));

  for (const slug of LEGAL_SLUGS) {
    const page = bySlug[slug];
    if (!page) {
      problems.push(`missing PageContent slug=${slug}`);
      continue;
    }
    const blob = `${page.title}\n${page.content}`;
    const expectName = siteName || settings?.siteName || '';
    const hasName =
      (expectName && blob.includes(expectName)) ||
      blob.includes('{{SITE_NAME}}');
    if (requireName && expectName && !hasName) {
      problems.push(`${slug}: does not mention site name «${expectName}» (or {{SITE_NAME}})`);
    }
    for (const host of oldHosts) {
      if (!host) continue;
      if (newHost && host.toLowerCase() === newHost.toLowerCase()) continue;
      if (blob.toLowerCase().includes(host.toLowerCase())) {
        problems.push(`${slug}: still contains old host «${host}»`);
      }
    }
    // Only flag old titles if they differ from the new name (placeholders OK)
    for (const old of oldNames) {
      if (!old || (expectName && old.toLowerCase() === expectName.toLowerCase())) continue;
      if (blob.includes(old)) {
        problems.push(`${slug}: still contains old title «${old}»`);
      }
    }
  }

  if (problems.length) {
    console.error('VERIFY FAIL:');
    for (const p of problems) console.error(' -', p);
    process.exit(1);
  }
  console.log('VERIFY OK: identity + legal pages look consistent');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
