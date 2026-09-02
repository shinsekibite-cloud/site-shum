/**
 * Thematic SVG cover templates for catalog/afisha/pages.
 * Used when real photos are missing.
 *
 *   node scripts/generate-theme-templates.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'public', 'brand', 'templates');

const TEMPLATES = [
  // Weekly afisha items (match DEFAULT_AFISHA_WEEK ids)
  { key: 'afisha-gym', title: 'Гимнастика', kind: 'Афиша', colors: ['#0ea5e9', '#0369a1', '#0f172a'] },
  { key: 'afisha-family', title: 'Молодая семья', kind: 'Афиша', colors: ['#f472b6', '#db2777', '#831843'] },
  { key: 'afisha-clubs', title: 'Клубы', kind: 'Афиша', colors: ['#8b5cf6', '#6d28d9', '#312e81'] },
  { key: 'afisha-mma', title: 'ММА', kind: 'Афиша', colors: ['#ef4444', '#b91c1c', '#7f1d1d'] },
  { key: 'afisha-film', title: 'Кино', kind: 'Афиша', colors: ['#6366f1', '#4338ca', '#1e1b4b'] },
  { key: 'afisha-vocal', title: 'Вокал / гитара', kind: 'Афиша', colors: ['#14b8a6', '#0f766e', '#134e4a'] },
  // Site sections
  { key: 'section-projects', title: 'Проекты', kind: 'Раздел', colors: ['#3b82f6', '#1d4ed8', '#1e3a8a'] },
  { key: 'section-clubs', title: 'Клубы', kind: 'Раздел', colors: ['#a855f7', '#7e22ce', '#581c87'] },
  { key: 'section-spaces', title: 'Пространства', kind: 'Раздел', colors: ['#10b981', '#047857', '#064e3b'] },
  { key: 'section-events', title: 'Афиша', kind: 'Раздел', colors: ['#0ea5e9', '#0284c7', '#0c4a6e'] },
  { key: 'section-news', title: 'Новости', kind: 'Раздел', colors: ['#38bdf8', '#0369a1', '#0f172a'] },
  { key: 'section-documents', title: 'Документы', kind: 'Раздел', colors: ['#64748b', '#334155', '#0f172a'] },
  { key: 'section-about', title: 'О нас', kind: 'Раздел', colors: ['#2563eb', '#1e40af', '#172554'] },
  { key: 'section-grants', title: 'Гранты', kind: 'Раздел', colors: ['#eab308', '#a16207', '#713f12'] },
  { key: 'section-dobro', title: 'Добро', kind: 'Раздел', colors: ['#22c55e', '#15803d', '#14532d'] },
  { key: 'section-selfgov', title: 'Самоуправление', kind: 'Раздел', colors: ['#f97316', '#c2410c', '#7c2d12'] },
  { key: 'section-contacts', title: 'Контакты', kind: 'Раздел', colors: ['#06b6d4', '#0e7490', '#164e63'] },
  { key: 'section-default', title: 'Центр молодёжи', kind: 'Шаблон', colors: ['#3b82f6', '#1d4ed8', '#0f172a'] },
];

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function makeSvg({ key, title, kind, colors }) {
  const [c1, c2, c3] = colors;
  const h = [...key].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const angle = 20 + (h % 40);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%" gradientTransform="rotate(${angle})">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="55%" stop-color="${c2}"/>
      <stop offset="100%" stop-color="${c3}"/>
    </linearGradient>
    <radialGradient id="r" cx="30%" cy="25%" r="70%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="800" fill="url(#g)"/>
  <rect width="1200" height="800" fill="url(#r)"/>
  <circle cx="${180 + (h % 500)}" cy="${140 + (h % 300)}" r="${90 + (h % 80)}" fill="#fff" opacity="0.08"/>
  <circle cx="${700 + (h % 300)}" cy="${480 + (h % 160)}" r="${70 + (h % 60)}" fill="#fff" opacity="0.06"/>
  <path d="M0 520 C200 460, 400 600, 600 540 S1000 460, 1200 520 L1200 800 L0 800 Z" fill="#000" opacity="0.12"/>
  <!-- Decorative shapes only — no labels (avoids text sitting under card titles) -->
  <circle cx="980" cy="160" r="48" fill="#fff" opacity="0.1"/>
  <rect x="72" y="72" width="120" height="12" rx="6" fill="#fff" opacity="0.18"/>
  <rect x="72" y="100" width="72" height="10" rx="5" fill="#fff" opacity="0.12"/>
</svg>
`;
}

fs.mkdirSync(OUT, { recursive: true });
for (const t of TEMPLATES) {
  const file = path.join(OUT, `${t.key}.svg`);
  fs.writeFileSync(file, makeSvg(t));
  console.log('wrote', `/brand/templates/${t.key}.svg`);
}

// Also copy into uploads/covers for runtime-safe serving of afisha covers
const uploads = path.join(__dirname, '..', 'public', 'uploads', 'covers');
fs.mkdirSync(uploads, { recursive: true });
for (const t of TEMPLATES.filter((x) => x.key.startsWith('afisha-'))) {
  fs.copyFileSync(path.join(OUT, `${t.key}.svg`), path.join(uploads, `${t.key}.svg`));
}
console.log('Done', TEMPLATES.length, 'templates');
