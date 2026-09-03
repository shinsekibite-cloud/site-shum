/**
 * One-shot VK content fill for CRM Sochi (crm.sochi / -211213539).
 *
 * After this runs, editors maintain content in admin:
 * - Афиша недели → Настройки → вкладка «Афиша»
 * - Новости / анонсы → Админка → Новости
 * - Документы → Админка → Документы
 * - CMS (правила ДМ, медиа, FAQ) → Админка → Страницы
 * - Клубы (расписание) / проекты (галереи) → соответствующие разделы
 *
 * Monday workflow: with VK token + vkSyncEnabled, cron picks newest #афишанедели
 * and updates SiteSettings.afishaWeekJson. Without token — edit admin manually.
 *
 *   node scripts/seed-vk-fill.mjs
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import { projectIdFromTitle } from './lib/slug-latin.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC = process.env.PUBLIC_DIR || path.join(ROOT, 'public');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

/** Inline parse (seed runs in plain Node; avoid TS path aliases). */
function isAfishaWeekPost(text) {
  const t = (text || '').toLowerCase();
  return t.includes('#афишанедели') || (/⚡?\s*афиша\s*⚡?/i.test(text) && t.includes('#афиша'));
}

function slugId(s, idx) {
  const base = String(s)
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  return base || `item_${idx}`;
}

function detectAction(chunk) {
  const tel = chunk.match(/(?:\+7|8)[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/);
  if (tel) {
    const digits = tel[0].replace(/[^\d+]/g, '');
    return {
      action: 'phone',
      value: digits.startsWith('+') ? digits : `+${digits.replace(/^8/, '7')}`,
      label: 'Позвонить',
    };
  }
  const tme = chunk.match(/https?:\/\/t\.me\/[^\s)>\]]+/i) || chunk.match(/@[a-zA-Z0-9_]{4,}/);
  if (tme) {
    const v = tme[0];
    return {
      action: 'telegram',
      value: v.startsWith('http') ? v : `https://t.me/${v.slice(1)}`,
      label: v.startsWith('@') ? v : 'Telegram',
    };
  }
  const url = chunk.match(/https?:\/\/[^\s)>\]]+/i);
  if (url) return { action: 'link', value: url[0], label: 'Открыть' };
  return { action: 'text' };
}

function parseAfishaWeekFromVkText(text, meta = {}) {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const periodMatch =
    text.match(/(\d{2}\/\d{2}\s*[—\-–]\s*\d{2}\/\d{2})/) ||
    text.match(/(\d{1,2}[./]\d{1,2}\s*[—\-–]\s*\d{1,2}[./]\d{1,2})/);
  const period = (meta.periodHint || periodMatch?.[1] || '03/08 — 09/08').replace(/-/g, '—');

  const placeLine = lines.find((l) => /навагин|тимиряз|дом\s*молодеж|молодежн/i.test(l));
  const subtitle = placeLine
    ? placeLine.replace(/^#афиша\s*/i, '').replace(/^▫\s*/, '').slice(0, 240)
    : 'Дом молодёжи (Навагинская, 9) и Молодёжный центр (Тимирязева, 6)';

  const contactLine = lines.find((l) => /вопрос|мах|max|администратор/i.test(l) && /(\+7|8\s?\()/i.test(l));
  const rulesLink = (text.match(/https?:\/\/t\.me\/crm_sochi\/\d+/i) || [])[0] || 'https://t.me/crm_sochi/26243';

  const itemChunks = [];
  let buf = '';
  for (const line of lines) {
    if (/^⚡?\s*афиша/i.test(line) || /^#афиша/i.test(line)) continue;
    if (/^#/.test(line) && !/^#афиша/.test(line)) continue;
    if (/^⚠/.test(line) || /^‼/.test(line)) continue;
    if (/^▫|^•|^–|^-/.test(line) || /запись/i.test(line)) {
      if (buf) itemChunks.push(buf);
      buf = line.replace(/^[▫•–\-]\s*/, '');
    } else if (buf) {
      buf += ' ' + line;
    }
  }
  if (buf) itemChunks.push(buf);

  const items = itemChunks.slice(0, 12).map((chunk, idx) => {
    const clean = chunk.replace(/\s+/g, ' ').trim();
    const title =
      clean.split(/по номеру|по ссылке|через |https?:/i)[0].trim().slice(0, 160) || `Пункт ${idx + 1}`;
    const act = detectAction(clean);
    return {
      id: slugId(title, idx),
      title,
      action: act.action,
      value: act.value,
      label: act.label,
      note: clean.length > title.length + 10 ? clean.slice(0, 200) : undefined,
    };
  });

  return {
    title: 'Афиша недели',
    subtitle,
    period,
    vkLink: meta.vkLink || 'https://vk.ru/wall-211213539_9710',
    // Never take raw VK contact line (often «МАХ» OCR junk) — phone only
    contactNote: (() => {
      const phone = (contactLine || text).match(/(?:\+7|8)[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/)?.[0];
      if (!phone) return 'Вопросы — в MAX администратору Дома молодёжи: +7 988 236-50-22';
      let digits = phone.replace(/[^\d+]/g, '');
      if (digits.startsWith('8') && digits.length === 11) digits = `+7${digits.slice(1)}`;
      return `Вопросы — в MAX администратору Дома молодёжи: ${digits}`;
    })(),
    rulesLink,
    // Items always curated by caller — parser dump kept only for period/link extraction
    items: [],
  };
}

const postsPath = process.env.VK_SCRAPE_JSON || path.join(__dirname, 'vk-crm', 'posts.json');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 YoungPortal/1.0' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(dest, () => null);
        return download(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(dest, () => null);
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(dest)));
    });
    req.on('error', (e) => {
      file.close();
      fs.unlink(dest, () => null);
      reject(e);
    });
  });
}

function writeTxtDoc(stableName, body) {
  const dir = path.join(PUBLIC, 'uploads', 'documents');
  fs.mkdirSync(dir, { recursive: true });
  const stored = `${stableName}.txt`;
  const full = path.join(dir, stored);
  const buf = Buffer.from(body, 'utf8');
  fs.writeFileSync(full, buf);
  return { url: `/uploads/documents/${stored}`, fileName: stored, sizeBytes: buf.length, mimeType: 'text/plain' };
}

async function ensureLocalImage(post, subdir) {
  if (!post?.vkPostId && !post?.imageUrl) return null;
  const safe = String(post.vkPostId || post.id || 'x').replace(/[^0-9_-]/g, '');
  const filename = `vk_${safe}.jpg`;

  // Prefer already-mirrored news/project files (VK CDN URLs expire)
  for (const probe of [
    path.join(PUBLIC, 'uploads', subdir, filename),
    path.join(PUBLIC, 'uploads', 'news', filename),
    path.join(PUBLIC, 'uploads', 'projects', filename),
  ]) {
    if (fs.existsSync(probe) && fs.statSync(probe).size >= 500) {
      const rel = probe.replace(PUBLIC, '').replace(/\\/g, '/');
      return rel.startsWith('/') ? rel : `/${rel}`;
    }
  }

  if (!post?.imageUrl || !/^https?:\/\//i.test(post.imageUrl)) return null;
  const dir = path.join(PUBLIC, 'uploads', subdir);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, filename);
  try {
    await download(post.imageUrl, dest);
  } catch (e) {
    console.warn('image fail', safe, e.message);
    return null;
  }
  if (!fs.existsSync(dest) || fs.statSync(dest).size < 500) return null;
  return `/uploads/${subdir}/${filename}`;
}

const MONTHS = {
  января: 0,
  февраля: 1,
  марта: 2,
  апреля: 3,
  мая: 4,
  июня: 5,
  июля: 6,
  августа: 7,
  сентября: 8,
  октября: 9,
  ноября: 10,
  декабря: 11,
};

/** Parse «🗓 5 августа» + «12:00» relative to post year (MSK). */
function parseEventDateFromText(text, fallbackDate) {
  const m = String(text || '').match(/(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/i);
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTHS[m[2].toLowerCase()];
  if (month == null) return null;
  const base = fallbackDate instanceof Date ? fallbackDate : new Date();
  const year = base.getFullYear();
  const time = String(text || '').match(/(?:начало|старт)?\s*[—\-]?\s*(\d{1,2}):(\d{2})/i);
  const hh = time ? Number(time[1]) : 12;
  const mm = time ? Number(time[2]) : 0;
  // Store as local wall time ≈ MSK for portal display
  return new Date(year, month, day, hh, mm, 0);
}

function isAnonsPost(text) {
  return /#анонс(?![а-яёa-z0-9_])/i.test(text || '');
}

const CLUB_SCHEDULES = [
  {
    id: 'crm_club_gym',
    meetingSchedule: 'Запись по телефону (см. афишу недели)',
    meetingPlace: 'Дом молодёжи / по согласованию',
    curatorContact: '+79183048588',
  },
  {
    id: 'crm_club_family',
    meetingSchedule: 'Запись по телефону Натальи',
    meetingPlace: 'Молодёжный центр, ул. Тимирязева, 6',
    curatorName: 'Наталья',
    curatorContact: '+79631642397',
  },
  {
    id: 'crm_club_newtime',
    meetingSchedule: 'Запись через Telegram-бот @crm_molodsochi_bot',
    meetingPlace: 'Дом молодёжи, ул. Навагинская, 9',
    curatorContact: 'https://t.me/crm_molodsochi_bot',
  },
  {
    id: 'crm_club_niti',
    meetingSchedule: 'Запись через Telegram-бот @crm_molodsochi_bot',
    meetingPlace: 'Дом молодёжи, ул. Навагинская, 9',
    curatorContact: 'https://t.me/crm_molodsochi_bot',
  },
  {
    id: 'crm_club_ampl',
    meetingSchedule: 'Запись через Telegram-бот @crm_molodsochi_bot',
    meetingPlace: 'Дом молодёжи, ул. Навагинская, 9',
    curatorContact: 'https://t.me/crm_molodsochi_bot',
  },
  {
    id: 'crm_club_mma',
    meetingSchedule: 'Запись по ссылке в Telegram',
    meetingPlace: 'По расписанию клуба',
    curatorContact: 'https://t.me/+QMfAe7ELGrcyZDZi',
  },
  {
    id: 'crm_club_vocal',
    meetingSchedule: 'Запись через Telegram',
    meetingPlace: 'Молодёжный центр, ул. Тимирязева, 6',
    curatorContact: 'https://t.me/+cmHtvAv0Zm82MGZi',
  },
];

const FAQ_HTML = `
<h2>Как записаться в клуб или на занятие?</h2>
<p>Смотрите актуальную <strong>афишу недели</strong> на главной и на странице «Афиша». У каждого пункта — свой способ записи: телефон, Telegram-бот или анкета.</p>

<h2>Где найти афишу на эту неделю?</h2>
<p>На портале в блоке «Афиша недели» и в группе ВКонтакте по хештегу <strong>#афишанедели</strong>. Период и пункты обновляются по понедельникам (после публикации поста в VK или вручную в админке).</p>

<h2>Как попасть на разовое мероприятие?</h2>
<p>Следите за хештегом <strong>#анонс</strong> в группе VK и разделом «Новости» на портале. Если указана дата и место — можно записаться по телефону из поста или прийти к регистрации на площадке.</p>

<h2>Где правила посещения Дома молодёжи?</h2>
<p>Страница <a href="/p/pravila-dm">Правила ДМ</a>, раздел <a href="/documents">Документы</a> и закреплённый материал в Telegram: <a href="https://t.me/crm_sochi/26243" target="_blank" rel="noopener">t.me/crm_sochi/26243</a> (хештег <strong>#правилаДМ</strong>).</p>

<h2>Куда писать, если остались вопросы?</h2>
<p>Администратору Дома молодёжи в мессенджере MAX: <strong>+7 988 236-50-22</strong>. Также контакты центра — на странице <a href="/contacts">Контакты</a>.</p>

<h2>«Новое время», «Нити», «Амплитуда» — куда писать?</h2>
<p>Запись через Telegram-бот <a href="https://t.me/crm_molodsochi_bot" target="_blank" rel="noopener">@crm_molodsochi_bot</a>.</p>
`.trim();

const PRAVILA_DM_HTML = `
<p><strong>Правила посещения Дома молодёжи</strong> (ул. Навагинская, 9) и площадок Центра развития молодёжи Сочи.</p>
<p>Полный текст памятки публикуется в официальном канале и группе: <a href="https://t.me/crm_sochi/26243" target="_blank" rel="noopener">Telegram · правила ДМ</a>, хештег <strong>#правилаДМ</strong> в <a href="https://vk.ru/crm.sochi" target="_blank" rel="noopener">VK crm.sochi</a>.</p>
<h2>Кратко</h2>
<ul>
<li>Соблюдайте правила внутреннего распорядка площадки и указания сотрудников.</li>
<li>Запись на клубы и занятия — только через актуальные контакты из афиши недели.</li>
<li>Мероприятия с ограничением возраста / вместимости — по предварительной записи.</li>
<li>Фото- и видеосъёмка на мероприятиях может вестись организаторами для отчётов.</li>
</ul>
<p>Документ-памятка также доступен в разделе <a href="/documents">Документы</a>. Правки после первичной загрузки — через админку портала.</p>
`.trim();

const MEDIA_HTML = `
<p>Медиа-направление Центра развития молодёжи Сочи: блоги, видео, фотоотчёты, участие в конкурсах и премиях.</p>
<h2>Премия «ШУМ»</h2>
<p>Всероссийская молодёжная премия в сфере медиа и журналистики. Регистрация и номинации — на <a href="https://premiyashum.ru/" target="_blank" rel="noopener">premiyashum.ru</a>. Анонсы набора публикуются в группе VK и в новостях портала.</p>
<h2>Медиафорум и проекты</h2>
<p>Следите за проектом <a href="/projects">Медиафорум</a> и новостями с хештегами медиа-направления. Фотоотчёты смен и форумов добавляются в галереи проектов через админку.</p>
<p>Хотите развивать медиапроект — напишите в группу <a href="https://vk.ru/crm.sochi" target="_blank" rel="noopener">crm.sochi</a> или через <a href="/contacts">контакты</a> центра.</p>
`.trim();

const DOC_PRAVILA = `Правила посещения Дома молодёжи (памятка)
Центр развития молодёжи Сочи · ул. Навагинская, 9

Актуальная версия в Telegram: https://t.me/crm_sochi/26243
Хештег в VK: #правилаДМ

1. Посещение клубов и занятий — по записи из афиши недели.
2. Соблюдайте распорядок площадки и требования сотрудников.
3. Вопросы администратору ДМ в MAX: +7 988 236-50-22.
4. Анонсы мероприятий — #анонс; расписание недели — #афишанедели.

Документ загружен единоразово из материалов группы VK crm.sochi.
Дальнейшие правки — в админке портала → Документы.
`;

const DOC_ZAPIS = `Памятка: как записаться
Центр развития молодёжи Сочи

• Гимнастика — телефон +7 918 304-85-88
• Клуб «Молодая семья» (ОВЗ, Тимирязева) — +7 963 164-23-97 (Наталья)
• «Новое время», «Нити», «Амплитуда» — Telegram-бот @crm_molodsochi_bot
• ММА / рукопашный бой — https://t.me/+QMfAe7ELGrcyZDZi
• Обсуждение фильма — анкета в афише недели
• Вокал / гитара — https://t.me/+cmHtvAv0Zm82MGZi

Афиша недели обновляется по понедельникам (#афишанедели).
FAQ на портале: /p/faq
`;

async function upsertDoc(id, meta, body) {
  const file = writeTxtDoc(id, body);
  const existing = await prisma.siteDocument.findUnique({ where: { id } });
  const data = {
    title: meta.title,
    description: meta.description,
    category: meta.category,
    fileUrl: file.url,
    fileName: file.fileName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    status: 'PUBLISHED',
    publishedAt: existing?.publishedAt || new Date(),
    isDemoData: false,
  };
  if (existing) {
    await prisma.siteDocument.update({ where: { id }, data });
  } else {
    await prisma.siteDocument.create({ data: { id, ...data } });
  }
}

async function main() {
  if (!fs.existsSync(postsPath)) {
    console.error('Missing', postsPath);
    process.exit(1);
  }
  const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
  console.log('VK fill: posts=', posts.length);

  // --- 1) Weekly afisha: curated from wall-211213539_9710 standard ---
  // Prefer curated bulletin (titles + CTAs). Raw parser is only a fallback for period/link.
  const CURATED_AFISHA = {
    title: 'Афиша недели',
    subtitle: 'Дом молодёжи (Навагинская, 9) и Молодёжный центр (Тимирязева, 6)',
    period: '03/08 — 09/08',
    vkLink: 'https://vk.ru/wall-211213539_9710',
    contactNote: 'Вопросы — в MAX администратору Дома молодёжи: +7 988 236-50-22',
    rulesLink: 'https://t.me/crm_sochi/26243',
    coverImage: '/brand/afisha-week.svg',
    items: [
      { id: 'gym', title: 'Гимнастика', place: 'Запись по телефону', action: 'phone', value: '+79183048588', label: 'Позвонить' },
      {
        id: 'young-family',
        title: 'Клуб «Молодая семья»',
        place: 'Молодёжный центр · для детей с ОВЗ',
        action: 'phone',
        value: '+79631642397',
        label: 'Наталья',
      },
      {
        id: 'clubs-bot',
        title: '«Новое время», «Нити», «Амплитуда»',
        place: 'Запись через Telegram-бот',
        action: 'telegram',
        value: 'https://t.me/crm_molodsochi_bot',
        label: '@crm_molodsochi_bot',
      },
      {
        id: 'mma',
        title: 'ММА / рукопашный бой',
        place: 'Запись по ссылке',
        action: 'telegram',
        value: 'https://t.me/+QMfAe7ELGrcyZDZi',
        label: 'Записаться',
      },
      {
        id: 'film',
        title: 'Обсуждение фильма',
        place: 'Молодёжный центр',
        action: 'link',
        value: 'https://forms.yandex.ru/cloud/69f75cfc6d2d736ad9321aba',
        label: 'Анкета',
      },
      {
        id: 'vocal',
        title: 'Вокал / гитара',
        place: 'Молодёжный центр',
        action: 'telegram',
        value: 'https://t.me/+cmHtvAv0Zm82MGZi',
        label: 'Записаться',
      },
    ],
  };

  const afishaPost = posts.find((p) => isAfishaWeekPost(p.text || ''));
  let cfg = { ...CURATED_AFISHA, items: CURATED_AFISHA.items.map((i) => ({ ...i })) };
  if (afishaPost) {
    const parsed = parseAfishaWeekFromVkText(afishaPost.text, {
      vkLink: afishaPost.vkLink || `https://vk.ru/wall${afishaPost.vkPostId}`,
    });
    // Keep curated item cards always; take period / links / healed contact from post
    cfg = {
      ...cfg,
      period: parsed.period || cfg.period,
      vkLink: parsed.vkLink || cfg.vkLink,
      contactNote: parsed.contactNote || cfg.contactNote,
      rulesLink: parsed.rulesLink || cfg.rulesLink,
      subtitle: /навагин/i.test(parsed.subtitle || '') ? cfg.subtitle : parsed.subtitle || cfg.subtitle,
      items: cfg.items,
    };
  }
  await prisma.siteSettings.upsert({
    where: { id: '1' },
    create: {
      id: '1',
      siteName: 'Центр развития молодежи Сочи',
      afishaWeekEnabled: true,
      afishaWeekJson: JSON.stringify(cfg),
    },
    update: {
      afishaWeekEnabled: true,
      afishaWeekJson: JSON.stringify(cfg),
    },
  });
  console.log('Afisha week updated:', cfg.period, 'items=', cfg.items.length);

  // --- 2) FAQ + CMS pages ---
  await prisma.pageContent.upsert({
    where: { slug: 'faq' },
    create: {
      slug: 'faq',
      title: 'Как записаться — FAQ',
      content: FAQ_HTML,
      images: '[]',
      menuPosition: 'FOOTER',
      template: 'FAQ',
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
    update: {
      title: 'Как записаться — FAQ',
      content: FAQ_HTML,
      template: 'FAQ',
      menuPosition: 'FOOTER',
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });
  console.log('CMS /p/faq');

  await prisma.pageContent.upsert({
    where: { slug: 'pravila-dm' },
    create: {
      slug: 'pravila-dm',
      title: 'Правила Дома молодёжи',
      content: PRAVILA_DM_HTML,
      images: '[]',
      menuPosition: 'HEADER_SUB',
      template: 'DEFAULT',
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
    update: {
      title: 'Правила Дома молодёжи',
      content: PRAVILA_DM_HTML,
      menuPosition: 'HEADER_SUB',
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });
  console.log('CMS /p/pravila-dm');

  await prisma.pageContent.upsert({
    where: { slug: 'media' },
    create: {
      slug: 'media',
      title: 'Медиа-направление',
      content: MEDIA_HTML,
      images: '[]',
      menuPosition: 'HEADER_SUB',
      template: 'DEFAULT',
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
    update: {
      title: 'Медиа-направление',
      content: MEDIA_HTML,
      menuPosition: 'HEADER_SUB',
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });
  console.log('CMS /p/media');

  // --- 3) Documents ---
  await upsertDoc(
    'doc_pravila_dm',
    {
      title: 'Правила посещения Дома молодёжи',
      description: 'Памятка #правилаДМ из материалов группы VK / Telegram-закрепа',
      category: 'Правила',
    },
    DOC_PRAVILA
  );
  await upsertDoc(
    'doc_kak_zapisatsya',
    {
      title: 'Памятка: как записаться в клубы',
      description: 'Контакты записи из афиши недели #афишанедели',
      category: 'Правила',
    },
    DOC_ZAPIS
  );
  console.log('Documents: pravila-dm + kak-zapisatsya');

  // --- 4) Club schedules from afisha pins ---
  for (const c of CLUB_SCHEDULES) {
    const exists = await prisma.club.findUnique({ where: { id: c.id } });
    if (!exists) {
      console.warn('Club missing, skip schedule:', c.id);
      continue;
    }
    await prisma.club.update({
      where: { id: c.id },
      data: {
        meetingSchedule: c.meetingSchedule,
        meetingPlace: c.meetingPlace,
        curatorName: c.curatorName || exists.curatorName,
        curatorContact: c.curatorContact || exists.curatorContact,
        curatorContactPublic: true,
      },
    });
  }
  console.log('Club schedules updated:', CLUB_SCHEDULES.length);

  // --- 5) #анонс → news (ensure) + events when date parseable & future ---
  let anonsNews = 0;
  let anonsEvents = 0;
  const admin =
    (await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' } })) ||
    (await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } }));
  const spaces = await prisma.space.findMany({ take: 20 });

  for (const post of posts) {
    const text = post.text || '';
    if (!isAnonsPost(text) && !isAnonsPost(post.title || '')) {
      // still ensure non-afisha posts exist as news below via gallery/media mapping
      continue;
    }
    if (isAfishaWeekPost(text)) continue;

    const vkPostId = String(post.vkPostId || '');
    if (!vkPostId) continue;

    const localImage = await ensureLocalImage(post, 'news');
    const title = (post.title || text.split('\n')[0] || 'Анонс').slice(0, 120);
    const createdAt = post.date ? new Date(post.date * 1000) : new Date();
    const existing = await prisma.news.findUnique({ where: { vkPostId } });
    if (existing) {
      await prisma.news.update({
        where: { id: existing.id },
        data: {
          title,
          text,
          imageUrl: localImage || existing.imageUrl || '/covers/news-default.svg',
          vkLink: post.vkLink || existing.vkLink,
          status: 'PUBLISHED',
          publishedAt: existing.publishedAt || createdAt,
          createdAt: existing.createdAt || createdAt,
        },
      });
    } else {
      await prisma.news.create({
        data: {
          vkPostId,
          title,
          text,
          imageUrl: localImage || '/covers/news-default.svg',
          vkLink: post.vkLink || `https://vk.ru/wall${vkPostId}`,
          status: 'PUBLISHED',
          publishedAt: createdAt,
          createdAt,
        },
      });
    }
    anonsNews++;

    const start = parseEventDateFromText(text, createdAt);
    if (start && admin && start.getTime() > Date.now() - 6 * 3600 * 1000) {
      const placeHint = /партизан/i.test(text)
        ? /партизан/i
        : /тимиряз/i.test(text)
          ? /тимиряз|центр/i
          : /навагин|дом/i.test(text)
            ? /навагин|дом/i
            : null;
      const space =
        (placeHint && spaces.find((s) => placeHint.test(`${s.title} ${s.address || ''}`))) ||
        spaces.find((s) => /дом|навагин/i.test(`${s.title} ${s.address || ''}`)) ||
        spaces[0];
      if (space) {
        const end = new Date(start.getTime() + 2 * 3600 * 1000);
        const bookingId = `vk_anons_${vkPostId.replace(/[^0-9_-]/g, '')}`;
        const existsB = await prisma.booking.findUnique({ where: { id: bookingId } }).catch(() => null);
        const payload = {
          title: title.slice(0, 160),
          description: `${text.slice(0, 1500)}\n\nИсточник: ${post.vkLink || vkPostId}`,
          startTime: start,
          endTime: end,
          spaceId: space.id,
          userId: admin.id,
          status: 'APPROVED',
          isDemoData: false,
        };
        if (existsB) {
          await prisma.booking.update({ where: { id: bookingId }, data: payload });
        } else {
          try {
            await prisma.booking.create({ data: { id: bookingId, ...payload } });
            anonsEvents++;
          } catch (e) {
            // Booking id might not accept custom — fall back without id
            const dup = await prisma.booking.findFirst({
              where: { title: payload.title, startTime: start, spaceId: space.id },
            });
            if (!dup) {
              await prisma.booking.create({ data: payload });
              anonsEvents++;
            }
          }
        }
      }
    }
  }
  console.log(`#анонс news=${anonsNews}, events created/updated=${anonsEvents}`);

  // --- 6) Photo reports → project galleries ---
  const galleryMap = [
    {
      postId: '-211213539_9715',
      projectTitle: 'ПроТворчество',
      alsoClubId: 'crm_club_family',
    },
    {
      postId: '-211213539_9712',
      projectTitle: 'Лагерь «Горы возможностей»',
    },
    {
      postId: '-211213539_9714',
      projectTitle: 'Медиафорум',
    },
  ];

  for (const g of galleryMap) {
    const post = posts.find((p) => p.vkPostId === g.postId);
    if (!post) continue;
    let img = await ensureLocalImage(post, 'projects');
    if (!img) {
      const news = await prisma.news.findUnique({ where: { vkPostId: g.postId } });
      if (news?.imageUrl && news.imageUrl.startsWith('/uploads/')) img = news.imageUrl;
    }
    if (!img) {
      console.warn('No local image for gallery', g.postId, '— upload in admin or enable VK token & re-sync');
      const vk = post.vkLink || `https://vk.ru/wall${g.postId}`;
      const note = `<p><em>Фотоотчёт VK:</em> <a href="${vk}" target="_blank" rel="noopener">${vk}</a>. Добавьте фото в галерею проекта в админке.</p>`;
      const project = await prisma.project.findUnique({ where: { id: projectIdFromTitle(g.projectTitle) } });
      if (project && !/Фотоотчёт VK/i.test(project.description || '')) {
        await prisma.project.update({
          where: { id: project.id },
          data: { description: `${project.description || ''}\n${note}` },
        });
      }
      continue;
    }
    const pid = projectIdFromTitle(g.projectTitle);
    const project = await prisma.project.findUnique({ where: { id: pid } });
    if (!project) {
      console.warn('Project missing:', g.projectTitle, pid);
      continue;
    }
    let gallery = [];
    try {
      gallery = project.gallery ? JSON.parse(project.gallery) : [];
      if (!Array.isArray(gallery)) gallery = [];
    } catch {
      gallery = [];
    }
    if (!gallery.includes(img)) gallery.unshift(img);
    gallery = gallery.slice(0, 24);
    await prisma.project.update({
      where: { id: pid },
      data: {
        gallery: JSON.stringify(gallery),
        template: project.template === 'DEFAULT' ? 'GALLERY' : project.template,
        image: project.image && !/userapi|vkuserphoto/i.test(project.image) ? project.image : img,
      },
    });
    console.log('Project gallery:', g.projectTitle, gallery.length);

    if (g.alsoClubId) {
      const club = await prisma.club.findUnique({ where: { id: g.alsoClubId } });
      if (club) {
        let cg = [];
        try {
          cg = club.gallery ? JSON.parse(club.gallery) : [];
          if (!Array.isArray(cg)) cg = [];
        } catch {
          cg = [];
        }
        if (!cg.includes(img)) cg.unshift(img);
        await prisma.club.update({
          where: { id: g.alsoClubId },
          data: { gallery: JSON.stringify(cg.slice(0, 24)) },
        });
        console.log('Club gallery:', g.alsoClubId);
      }
    }
  }

  // Soft-hide demo documents if any
  await prisma.siteDocument.updateMany({
    where: { isDemoData: true },
    data: { status: 'DRAFT' },
  });

  console.log('seed-vk-fill done. Further edits: admin panel.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
