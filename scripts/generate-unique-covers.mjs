/**
 * Generate unique SVG catalog covers (deterministic palette per seed key).
 * Also assigns them in DB when DATABASE_URL is set.
 *
 *   node scripts/generate-unique-covers.mjs
 *   DATABASE_URL=... node scripts/generate-unique-covers.mjs --assign
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { transliterateSlug } from './lib/slug-latin.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
// Uploads volume survives image rebuilds; Next standalone does not serve
// files added to /public/covers after the Docker build.
const OUT = path.join(ROOT, 'public', 'uploads', 'covers');
const PUBLIC_PREFIX = '/uploads/covers';

const PALETTES = [
  ['#0ea5e9', '#0369a1', '#0f172a'],
  ['#10b981', '#047857', '#064e3b'],
  ['#f59e0b', '#b45309', '#78350f'],
  ['#8b5cf6', '#6d28d9', '#312e81'],
  ['#ef4444', '#b91c1c', '#7f1d1d'],
  ['#14b8a6', '#0f766e', '#134e4a'],
  ['#f97316', '#c2410c', '#7c2d12'],
  ['#3b82f6', '#1d4ed8', '#1e3a8a'],
  ['#ec4899', '#be185d', '#831843'],
  ['#84cc16', '#4d7c0f', '#365314'],
  ['#06b6d4', '#0e7490', '#164e63'],
  ['#a855f7', '#7e22ce', '#581c87'],
  ['#22c55e', '#15803d', '#14532d'],
  ['#eab308', '#a16207', '#713f12'],
  ['#6366f1', '#4338ca', '#312e81'],
  ['#fb7185', '#e11d48', '#9f1239'],
  ['#2dd4bf', '#0d9488', '#115e59'],
  ['#38bdf8', '#0284c7', '#075985'],
  ['#c084fc', '#9333ea', '#6b21a8'],
  ['#fdba74', '#ea580c', '#9a3412'],
  ['#4ade80', '#16a34a', '#166534'],
  ['#f472b6', '#db2777', '#9d174d'],
  ['#67e8f9', '#0891b2', '#155e75'],
  ['#facc15', '#ca8a04', '#854d0e'],
];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function makeSvg(key, label, kind) {
  const h = hash(key);
  const [c1, c2, c3] = PALETTES[h % PALETTES.length];
  const angle = 25 + (h % 50);
  const cx = 20 + (h % 60);
  const cy = 15 + ((h >> 8) % 50);
  const kindLabel = kind || '';
  const title = (label || key).slice(0, 42);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%" gradientTransform="rotate(${angle})">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="55%" stop-color="${c2}"/>
      <stop offset="100%" stop-color="${c3}"/>
    </linearGradient>
    <radialGradient id="r" cx="${cx}%" cy="${cy}%" r="65%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="800" fill="url(#g)"/>
  <rect width="1200" height="800" fill="url(#r)"/>
  <circle cx="${200 + (h % 700)}" cy="${120 + ((h >> 4) % 400)}" r="${80 + (h % 120)}" fill="#fff" opacity="0.08"/>
  <circle cx="${400 + ((h >> 6) % 500)}" cy="${500 + ((h >> 2) % 200)}" r="${60 + ((h >> 3) % 90)}" fill="#fff" opacity="0.06"/>
  <path d="M0 560 C220 500, 420 620, 640 560 S1040 500, 1200 560 L1200 800 L0 800 Z" fill="#000" opacity="0.12"/>
  <!-- No text labels — card title lives below the image -->
  <circle cx="1000" cy="140" r="44" fill="#fff" opacity="0.1"/>
  <rect x="72" y="72" width="128" height="12" rx="6" fill="#fff" opacity="0.18"/>
  <rect x="72" y="100" width="80" height="10" rx="5" fill="#fff" opacity="0.12"/>
</svg>
`;
}

const SEEDS = [
  { key: 'project-kvn', label: 'Сочинская Лига КВН', kind: 'Проект' },
  { key: 'project-media', label: 'Медиашкола', kind: 'Проект' },
  { key: 'project-eco', label: 'Эко-инициативы', kind: 'Проект' },
  { key: 'project-volunteers', label: 'Добровольцы Сочи', kind: 'Проект' },
  { key: 'project-campus', label: 'Летний кампус', kind: 'Проект' },
  { key: 'club-debate', label: 'Клуб дебатов', kind: 'Клуб' },
  { key: 'club-photo', label: 'Фотоклуб', kind: 'Клуб' },
  { key: 'club-board', label: 'Настольные игры', kind: 'Клуб' },
  { key: 'club-music', label: 'Музыкальный клуб', kind: 'Клуб' },
  { key: 'club-archive', label: 'Архивный клуб', kind: 'Клуб' },
  { key: 'space-house', label: 'Дом молодёжи', kind: 'Пространство' },
  { key: 'space-cowork', label: 'Коворкинг', kind: 'Пространство' },
  { key: 'space-hall', label: 'Зал мероприятий', kind: 'Пространство' },
  { key: 'space-sport', label: 'Спортзал', kind: 'Пространство' },
  { key: 'space-pavilion', label: 'Павильон', kind: 'Пространство' },
  { key: 'grant-initiatives', label: 'Молодёжные инициативы', kind: 'Грант' },
  { key: 'grant-media', label: 'Грант на медиа', kind: 'Грант' },
  { key: 'grant-archive', label: 'Архивный грант', kind: 'Грант' },
  { key: 'dobro-clean', label: 'Чистый Сочи', kind: 'Добро' },
  { key: 'dobro-events', label: 'Городские события', kind: 'Добро' },
  { key: 'dobro-hq', label: 'Штаб Добро.Центра', kind: 'Добро' },
  { key: 'selfgov-council', label: 'Молодёжный совет', kind: 'Самоуправление' },
  { key: 'selfgov-parliament', label: 'Молодёжный парламент', kind: 'Самоуправление' },
  { key: 'selfgov-school', label: 'Ученическое самоуправление', kind: 'Самоуправление' },
  { key: 'page-about', label: 'О нас', kind: 'Страница' },
  { key: 'page-grants', label: 'Гранты', kind: 'Страница' },
  { key: 'page-dobro', label: 'Добро', kind: 'Страница' },
  { key: 'page-self-gov', label: 'Самоуправление', kind: 'Страница' },
  { key: 'page-documents', label: 'Документы', kind: 'Страница' },
  { key: 'news-portal', label: 'Запуск портала', kind: 'Новость' },
  { key: 'news-clubs', label: 'Набор в клубы', kind: 'Новость' },
  { key: 'news-default', label: 'Новости Сочи', kind: 'Новость' },
  { key: 'news-extra-1', label: 'Афиша недели', kind: 'Новость' },
  { key: 'news-extra-2', label: 'Волонтёры месяца', kind: 'Новость' },
];

function coverUrl(key) {
  return `${PUBLIC_PREFIX}/${key}.svg`;
}

async function assignFromDb() {
  const { PrismaClient } = await import('@prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.log('No DATABASE_URL — files only');
    return;
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  const takeUnique = (list, start = 0) => {
    const out = [];
    for (let i = 0; i < list.length; i++) out.push(coverUrl(list[(start + i) % list.length].key));
    return out;
  };

  const projectCovers = SEEDS.filter((s) => s.key.startsWith('project-'));
  const clubCovers = SEEDS.filter((s) => s.key.startsWith('club-'));
  const spaceCovers = SEEDS.filter((s) => s.key.startsWith('space-'));
  const grantCovers = SEEDS.filter((s) => s.key.startsWith('grant-'));
  const dobroCovers = SEEDS.filter((s) => s.key.startsWith('dobro-'));
  const selfCovers = SEEDS.filter((s) => s.key.startsWith('selfgov-'));
  const pageCovers = SEEDS.filter((s) => s.key.startsWith('page-'));
  const newsCovers = SEEDS.filter((s) => s.key.startsWith('news-'));

  const isWeakPlaceholder = (v) => {
    const s = String(v || '').trim();
    if (!s || s === '[]' || s === '/hero-bg.jpg') return true;
    if (/\.svg($|\?)/i.test(s)) return true;
    if (s.includes('news-default') || s.includes('/media/news/') || s.includes('/brand/templates/')) return true;
    if (s.startsWith('/covers/') && !s.includes('/covers/photo/')) return true;
    return false;
  };

  // Never overwrite real photos — only fill weak/empty placeholders.
  const shouldReplace = (v) => isWeakPlaceholder(v);

  let i = 0;
  for (const p of await prisma.project.findMany({ orderBy: { createdAt: 'asc' } })) {
    if (!shouldReplace(p.image)) continue;
    if (p.image && String(p.image).startsWith('/uploads/covers/photo/')) continue;
    const key = `project-${transliterateSlug(p.title || p.id, 40)}`;
    const file = path.join(OUT, `${key}.svg`);
    fs.writeFileSync(file, makeSvg(key, p.title || key, 'Проект'));
    const image = coverUrl(key);
    await prisma.project.update({ where: { id: p.id }, data: { image } });
    console.log('project', p.title, '→', image);
    i++;
  }
  i = 0;
  for (const c of await prisma.club.findMany({ orderBy: { createdAt: 'asc' } })) {
    if (!shouldReplace(c.image)) continue;
    if (String(c.image || '').startsWith('/uploads/covers/photo/')) continue;
    const key = `club-${transliterateSlug(c.title || c.id, 40)}`;
    const file = path.join(OUT, `${key}.svg`);
    fs.writeFileSync(file, makeSvg(key, c.title || key, 'Клуб'));
    const image = coverUrl(key);
    await prisma.club.update({ where: { id: c.id }, data: { image } });
    console.log('club', c.title, '→', image);
    i++;
  }
  i = 0;
  for (const s of await prisma.space.findMany({ orderBy: { createdAt: 'asc' } })) {
    if (!shouldReplace(s.image)) continue;
    if (String(s.image || '').startsWith('/uploads/covers/photo/')) continue;
    const key = `space-${transliterateSlug(s.title || s.id, 40)}`;
    const file = path.join(OUT, `${key}.svg`);
    fs.writeFileSync(file, makeSvg(key, s.title || key, 'Пространство'));
    const image = coverUrl(key);
    await prisma.space.update({ where: { id: s.id }, data: { image } });
    console.log('space', s.title, '→', image);
    i++;
  }
  i = 0;
  for (const p of await prisma.portalProgram.findMany({ orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }] })) {
    if (!shouldReplace(p.image)) continue;
    if (String(p.image || '').startsWith('/uploads/covers/photo/')) continue;
    const key = `program-${transliterateSlug(p.title || p.id, 40)}`;
    const file = path.join(OUT, `${key}.svg`);
    fs.writeFileSync(file, makeSvg(key, p.title || key, 'Программа'));
    const image = coverUrl(key);
    await prisma.portalProgram.update({ where: { id: p.id }, data: { image } });
    console.log('program', p.title, '→', image);
    i++;
  }
  for (const page of await prisma.pageContent.findMany()) {
    if (!shouldReplace(page.images)) continue;
    const match = pageCovers.find((c) => c.key === `page-${page.slug}`) || pageCovers[hash(page.slug) % pageCovers.length];
    await prisma.pageContent.update({
      where: { id: page.id },
      data: { images: coverUrl(match.key) },
    });
    console.log('page', page.slug, '→', coverUrl(match.key));
  }
  i = 0;
  for (const n of await prisma.news.findMany({ orderBy: { createdAt: 'asc' } })) {
    if (!shouldReplace(n.imageUrl)) continue;
    if (String(n.imageUrl || '').startsWith('/uploads/covers/photo/')) continue;
    // Prefer keeping missing news empty so photo-assign can fill; skip SVG assign for news
    continue;
  }

  await prisma.$disconnect();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  // Keep build-time /covers/* for paths already in the image
  const legacyOut = path.join(ROOT, 'public', 'covers');
  fs.mkdirSync(legacyOut, { recursive: true });
  for (const seed of SEEDS) {
    const svg = makeSvg(seed.key, seed.label, seed.kind);
    fs.writeFileSync(path.join(OUT, `${seed.key}.svg`), svg);
    fs.writeFileSync(path.join(legacyOut, `${seed.key}.svg`), svg);
    console.log('wrote', coverUrl(seed.key), 'and /covers/' + seed.key + '.svg');
  }
  // news media replacements (unique)
  const mediaNews = path.join(ROOT, 'public', 'media', 'news');
  fs.mkdirSync(mediaNews, { recursive: true });
  for (const key of ['news-portal', 'news-clubs', 'news-default']) {
    const seed = SEEDS.find((s) => s.key === key);
    const name =
      key === 'news-portal'
        ? 'news-portal-launch.svg'
        : key === 'news-clubs'
          ? 'news-clubs-recruit.svg'
          : 'news-default.svg';
    fs.writeFileSync(path.join(mediaNews, name), makeSvg(key, seed.label, seed.kind));
  }

  if (process.argv.includes('--assign')) {
    await assignFromDb();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
