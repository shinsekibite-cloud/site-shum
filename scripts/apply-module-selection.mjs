#!/usr/bin/env node
/**
 * Apply module kill-switches at install / seed time.
 *
 * Env / flags:
 *   MODULES / --modules     all | core | content | full | comma list of enabled keys
 *   MODULES_OFF / --off     comma list to force off (after MODULES)
 *   OFF_MODE / --off-mode   hide | soon (default hide)
 *
 * Presets:
 *   all|full  — everything on
 *   core      — portal essentials (no games/eco/vacancies/contests/grants/…)
 *   content   — core + catalogs (places, grants, dobro, self_gov, vacancies, contests)
 *
 * Usage:
 *   node scripts/apply-module-selection.mjs --modules=core
 *   MODULES=events,news,projects,clubs node scripts/apply-module-selection.mjs
 *   MODULES=all MODULES_OFF=games,eco node scripts/apply-module-selection.mjs
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const ALL_KEYS = [
  'registration',
  'messaging',
  'events',
  'tickets_scan',
  'places',
  'gallery',
  'projects',
  'clubs',
  'spaces',
  'grants',
  'dobro',
  'self_gov',
  'vacancies',
  'contests',
  'friends',
  'games',
  'news',
  'portfolio',
  'eco',
  'achievements',
  'ratings',
  'club_chat',
  'applications',
  'notifications',
  'documents',
  'referrals',
  'faq',
  'presentation',
  'server_status',
  'bots',
  'maintenance',
];

const CORE = [
  'registration',
  'messaging',
  'events',
  'tickets_scan',
  'gallery',
  'projects',
  'clubs',
  'spaces',
  'friends',
  'news',
  'portfolio',
  'achievements',
  'ratings',
  'club_chat',
  'applications',
  'notifications',
  'documents',
  'faq',
  'presentation',
  'server_status',
  'bots',
  'maintenance',
];

const CONTENT_EXTRA = ['places', 'grants', 'dobro', 'self_gov', 'vacancies', 'contests', 'referrals'];

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
    .split(/[,+\s]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

function resolveEnabled(spec) {
  const raw = String(spec || 'all').trim().toLowerCase();
  if (!raw || raw === 'all' || raw === 'full' || raw === '*') {
    return new Set(ALL_KEYS);
  }
  if (raw === 'core') return new Set(CORE);
  if (raw === 'content') return new Set([...CORE, ...CONTENT_EXTRA]);
  const list = parseList(raw);
  const unknown = list.filter((k) => !ALL_KEYS.includes(k));
  if (unknown.length) {
    console.error('Unknown module keys:', unknown.join(', '));
    console.error('Known:', ALL_KEYS.join(', '));
    process.exit(1);
  }
  // Always keep system modules on unless explicitly listed-off later
  const set = new Set(list);
  set.add('maintenance');
  set.add('server_status');
  set.add('bots');
  return set;
}

const modulesSpec = arg('modules', 'MODULES', 'all');
const offSpec = arg('off', 'MODULES_OFF', '');
const offMode = String(arg('off-mode', 'OFF_MODE', 'hide')).toLowerCase() === 'soon' ? 'soon' : 'hide';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const enabled = resolveEnabled(modulesSpec);
  for (const k of parseList(offSpec)) {
    if (!ALL_KEYS.includes(k)) {
      console.error('Unknown MODULES_OFF key:', k);
      process.exit(1);
    }
    enabled.delete(k);
  }
  // maintenance true = site normal
  enabled.add('maintenance');

  const flags = {};
  const offModes = {};
  for (const k of ALL_KEYS) {
    const on = enabled.has(k);
    flags[k] = on;
    if (!on && k !== 'maintenance') offModes[k] = offMode;
  }

  const jsonPayload = {};
  for (const k of ALL_KEYS) {
    if (k === 'maintenance') continue;
    jsonPayload[k] = flags[k] !== false;
  }
  if (Object.keys(offModes).length) jsonPayload.__offModes = offModes;

  const maintenanceMode = flags.maintenance === false;

  await prisma.siteSettings.upsert({
    where: { id: '1' },
    create: {
      id: '1',
      siteName: 'YoungPortal',
      moduleFlagsJson: JSON.stringify(jsonPayload),
      maintenanceMode,
      registrationEnabled: flags.registration !== false,
      messagingEnabled: flags.messaging !== false,
      galleryPageEnabled: flags.gallery !== false,
    },
    update: {
      moduleFlagsJson: JSON.stringify(jsonPayload),
      maintenanceMode,
      registrationEnabled: flags.registration !== false,
      messagingEnabled: flags.messaging !== false,
      galleryPageEnabled: flags.gallery !== false,
    },
  });

  // Best-effort cache bust (Redis)
  try {
    if (process.env.REDIS_URL) {
      const Redis = (await import('ioredis')).default;
      const r = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
      await r.connect();
      await r.del('yp:module-flags:v2', 'yp:module-flags:v1');
      await r.quit();
      console.log('redis module-flags cache cleared');
    }
  } catch (e) {
    console.log('redis cache clear skipped:', (e && e.message) || e);
  }

  const onList = ALL_KEYS.filter((k) => flags[k] !== false);
  const offList = ALL_KEYS.filter((k) => flags[k] === false);
  console.log('moduleFlags applied. on=%d off=%d mode=%s', onList.length, offList.length, offMode);
  if (offList.length) console.log('OFF:', offList.join(', '));
  console.log('preset/spec:', modulesSpec, offSpec ? `off+=${offSpec}` : '');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
