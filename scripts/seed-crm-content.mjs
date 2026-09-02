/**
 * Full CRM Sochi content seed:
 * - purge demo/QA rows
 * - upsert 14 projects + 4 spaces
 * - refresh about page with team (mythical avatars as placeholders)
 * - social MAX + VK/TG
 * - repair broken news images (tiny GIF stubs)
 *
 *   node scripts/seed-crm-content.mjs
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

const PROJECTS = [
  'Сочинская Лига КВН',
  'Мисс студенчество',
  'ПроТворчество',
  'Форумная кампания «Сочиняй смыслы»',
  'Медиафорум',
  'Воркаут-фестиваль',
  'Летние площадки',
  'Студент года',
  'Фестиваль молодых семей',
  'Трудоустройство несовершеннолетних',
  'Дай порулить',
  'Лагерь «Горы возможностей»',
  'Фестиваль экстремальных видов спорта',
  'Молодёжный патруль',
];

const SPACES = [
  {
    id: 'crm_space_dm',
    title: 'Дом молодёжи',
    address: 'г. Сочи, ул. Навагинская, 9',
    category: 'Зал мероприятий',
    description:
      'Главная площадка МКУ «Центр развития молодёжи»: клубы, афиша, запись на мероприятия и проекты.',
  },
  {
    id: 'crm_space_tim',
    title: 'Молодёжный центр (Тимирязева)',
    address: 'г. Сочи, ул. Тимирязева, 6',
    category: 'Коворкинг',
    description: 'Площадка ЦРМ Сочи для занятий, клубов и встреч. Анонсы — в группе vk.ru/crm.sochi.',
  },
  {
    id: 'crm_space_part',
    title: 'Молодёжное пространство (Партизанская)',
    address: 'г. Сочи, ул. Партизанская, 20',
    category: 'Спорт',
    description: 'Молодёжное пространство Центра развития молодёжи Сочи.',
  },
  {
    id: 'crm_space_uly',
    title: 'Молодёжное пространство (Ульянова)',
    address: 'г. Сочи, ул. Ульянова, 61',
    category: 'Общее',
    description: 'Площадка ЦРМ Сочи на ул. Ульянова, 61.',
  },
];

/** Clubs mentioned in weekly afisha / VK group */
const CLUBS = [
  { id: 'crm_club_newtime', title: 'Новое время', description: 'Клуб Дома молодёжи. Запись через @crm_molodsochi_bot.' },
  { id: 'crm_club_niti', title: 'Нити', description: 'Клуб Дома молодёжи. Запись через @crm_molodsochi_bot.' },
  { id: 'crm_club_ampl', title: 'Амплитуда', description: 'Клуб Дома молодёжи. Запись через @crm_molodsochi_bot.' },
  {
    id: 'crm_club_family',
    title: 'Молодая семья',
    description: 'Занятия для детей с ОВЗ в Молодёжном центре (Тимирязева). Запись: +7 963 164-23-97.',
  },
  { id: 'crm_club_mma', title: 'ММА / рукопашный бой', description: 'Запись: https://t.me/+QMfAe7ELGrcyZDZi' },
  { id: 'crm_club_vocal', title: 'Вокал / гитара', description: 'Молодёжный центр. Запись: https://t.me/+cmHtvAv0Zm82MGZi' },
  { id: 'crm_club_gym', title: 'Гимнастика', description: 'Запись по телефону: +7 918 304-85-88' },
];

const GOV_WIDGETS_JSON = JSON.stringify([
  {
    id: 'gosuslugi-pos',
    title: 'Обратная связь',
    enabled: true,
    kind: 'link',
    url: 'https://pos.gosuslugi.ru/form/?opaId=223418&utm_source=vk&utm_medium=03&utm_campaign=1032311673074',
    note: 'Оставить обращение через ПОС Госуслуг',
  },
  {
    id: 'gosuslugi',
    title: 'Госуслуги в VK',
    enabled: true,
    kind: 'link',
    url: 'https://vk.ru/app8181405?ref=group_menu',
    note: 'Мини-приложение Госуслуг в сообществе',
  },
  {
    id: 'gov-extra',
    title: 'Портал Госуслуг',
    enabled: false,
    kind: 'link',
    url: 'https://www.gosuslugi.ru/',
    note: 'Дополнительная ссылка при необходимости',
  },
]);

/** From https://vk.ru/wall-211213539_9710 */
const AFISHA_WEEK_JSON = JSON.stringify({
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
});

const MYTH = [
  'Василиса Премудрая',
  'Иван Царевич',
  'Жар-Птица',
  'Серый Волк',
  'Финист Ясный Сокол',
  'Снегурочка',
  'Добрыня Никитич',
  'Илья Муромец',
];

function slugify(title) {
  return projectIdFromTitle(title);
}

function projectHtml(title) {
  return `<p><strong>${title}</strong> — проект МКУ города Сочи «Центр развития молодёжи». Актуальные анонсы и набор участников публикуются в новостях портала и группе <a href="https://vk.ru/crm.sochi" target="_blank" rel="noopener">vk.ru/crm.sochi</a>.</p>
<p>Подайте заявку через портал, чтобы участвовать в мероприятиях, кастингах и сменах проекта.</p>`;
}

function aboutHtml() {
  const team = MYTH.map(
    (name, i) => `
    <div class="team-card">
      <img src="/api/avatar/myth/${encodeURIComponent(name)}" alt="${name}" width="200" height="200" loading="lazy" />
      <strong>${name}</strong>
      <span>${i % 2 === 0 ? 'Направление проектов' : 'Пространства и события'}</span>
    </div>`
  ).join('');

  return `
<p><strong>МКУ города Сочи «Центр развития молодёжи»</strong> — оператор молодёжной политики города. Мы развиваем проекты, пространства и сообщества: от КВН и медиа до форумов, фестивалей и волонтёрства.</p>
<h2>Что делаем</h2>
<ul>
<li>Проекты и форумы для самореализации</li>
<li>Молодёжные пространства по городу</li>
<li>Афиша, клубы, гранты и самоуправление</li>
<li>Новости и анонсы из официальной группы ВКонтакте</li>
</ul>
<h2>Площадки</h2>
<ul>
<li>Дом молодёжи — ул. Навагинская, 9</li>
<li>Молодёжный центр — ул. Тимирязева, 6</li>
<li>ул. Партизанская, 20</li>
<li>ул. Ульянова, 61</li>
</ul>
<h2>Команда</h2>
<p>Фото и роли можно заменить в админке (Страницы → О нас). Пока нет фото — показываем образы мифических персонажей.</p>
<div class="team-grid">${team}</div>
<p>Контакты: 8 (862) 253-32-37 · cddim_sochi@mail.ru · <a href="https://vk.ru/crm.sochi">VK</a> · <a href="https://max.ru/id2320047033_gos">MAX</a></p>
`.trim();
}

function requestBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('redirects'));
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 YoungPortal/1.0',
          Accept: 'image/*,*/*;q=0.8',
        },
        timeout: 20000,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).toString();
          return resolve(requestBuffer(next, redirects + 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error('HTTP ' + res.statusCode));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

function isRealImage(buf) {
  if (!buf || buf.length < 8000) return false;
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8) return true;
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50) return true;
  // WEBP
  if (buf[0] === 0x52 && buf[8] === 0x57) return true;
  // GIF only if large enough (already >= 8kb)
  if (buf[0] === 0x47 && buf[1] === 0x49) return buf.length > 20000;
  return false;
}

async function main() {
  console.log('Purging demo/QA…');
  // Soft-hide demo news/projects/spaces/clubs
  await prisma.news.updateMany({
    where: { OR: [{ isDemoData: true }, { id: { startsWith: 'qa_' } }, { id: { startsWith: 'news_' } }] },
    data: { status: 'DRAFT' },
  });
  await prisma.project.updateMany({
    where: { OR: [{ isDemoData: true }, { id: { startsWith: 'qa_' } }, { id: { startsWith: 'seed_' } }] },
    data: { status: 'INACTIVE' },
  });
  await prisma.space.updateMany({
    where: { OR: [{ isDemoData: true }, { id: { startsWith: 'qa_' } }, { id: { startsWith: 'seed_' } }] },
    data: { status: 'INACTIVE' },
  });
  await prisma.club.updateMany({
    where: { OR: [{ isDemoData: true }, { id: { startsWith: 'qa_' } }, { id: { startsWith: 'seed_' } }] },
    data: { status: 'INACTIVE' },
  }).catch(() => null);

  // Only reject demo/QA bookings — never wipe real upcoming APPROVED events
  const clearedDemo = await prisma.booking.updateMany({
    where: { OR: [{ isDemoData: true }, { id: { startsWith: 'qa_' } }, { id: { startsWith: 'seed_' } }] },
    data: { status: 'REJECTED' },
  });
  console.log(`Demo/QA bookings rejected: ${clearedDemo.count}`);

  // Hard-delete junk only (demo / qa / test titles) — keep real REJECTED history out of wipe
  try {
    const junk = await prisma.booking.findMany({
      select: { id: true, title: true, status: true, isDemoData: true, endTime: true },
    });
    const re = /(тест|test|qa\b|e2e|auto verify|within hours|шумко|хуй|бронь mse|participant mse|согласование ронь)/i;
    const ids = junk
      .filter(
        (b) =>
          b.isDemoData ||
          b.id.startsWith('qa_') ||
          b.id.startsWith('seed_') ||
          re.test(b.title || '')
      )
      .map((b) => b.id);
    if (ids.length) {
      const del = await prisma.booking.deleteMany({ where: { id: { in: ids } } });
      console.log(`Hard-deleted junk bookings: ${del.count}`);
    }
  } catch (e) {
    console.warn('booking purge', e.message);
  }

  console.log('Upserting projects…');
  const coverDir = path.join(PUBLIC, 'covers');
  fs.mkdirSync(coverDir, { recursive: true });
  for (const title of PROJECTS) {
    const id = slugify(title);
    await prisma.project.upsert({
      where: { id },
      create: {
        id,
        title,
        description: projectHtml(title),
        image: null,
        template: 'DEFAULT',
        status: 'ACTIVE',
        isDemoData: false,
      },
      update: {
        title,
        description: projectHtml(title),
        // Do not overwrite covers — generate-unique-covers assigns per-project art
        status: 'ACTIVE',
        isDemoData: false,
      },
    });
  }

  console.log('Upserting spaces…');
  for (const s of SPACES) {
    await prisma.space.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        title: s.title,
        address: s.address,
        category: s.category,
        description: s.description,
        image: '/covers/space-house.svg',
        capacity: 80,
        status: 'ACTIVE',
        isDemoData: false,
      },
      update: {
        title: s.title,
        address: s.address,
        category: s.category,
        description: s.description,
        status: 'ACTIVE',
        isDemoData: false,
      },
    });
  }

  console.log('Upserting clubs from VK afisha…');
  for (const c of CLUBS) {
    await prisma.club.upsert({
      where: { id: c.id },
      create: {
        id: c.id,
        title: c.title,
        description: c.description,
        image: '/covers/club-archive.svg',
        status: 'ACTIVE',
        isDemoData: false,
      },
      update: {
        title: c.title,
        description: c.description,
        status: 'ACTIVE',
        isDemoData: false,
      },
    });
  }

  console.log('Site settings + social…');
  await prisma.siteSettings.upsert({
    where: { id: '1' },
    create: {
      id: '1',
      siteName: 'Центр развития молодежи Сочи',
      contactPhone: '8 (862) 253-32-37',
      contactEmail: 'cddim_sochi@mail.ru',
      supportEmail: 'cddim_sochi@mail.ru',
      address: 'г. Сочи, ул. Навагинская, 9',
      workHours: 'Пн–Пт: 9:00 – 18:00\nСб–Вс: по расписанию мероприятий',
      vkLink: 'https://vk.ru/crm.sochi',
      vkEnabled: true,
      tgLink: 'https://t.me/crm_sochi',
      tgEnabled: true,
      maxLink: 'https://max.ru/id2320047033_gos',
      maxEnabled: true,
      vkGroupId: 'crm.sochi',
      logoUrl: '/brand/logo.png',
      heroImageUrl: '/brand/hero-cover.jpg',
      heroVideoUrl: '/brand/hero-cover.mp4',
      operatorName: 'МКУ города Сочи «Центр развития молодёжи»',
      publicEventsVisibility: true,
      govWidgetsEnabled: true,
      govWidgetsTitle: 'Госуслуги',
      govWidgetsJson: GOV_WIDGETS_JSON,
      afishaWeekEnabled: true,
      afishaWeekJson: AFISHA_WEEK_JSON,
    },
    update: {
      siteName: 'Центр развития молодежи Сочи',
      contactPhone: '8 (862) 253-32-37',
      contactEmail: 'cddim_sochi@mail.ru',
      supportEmail: 'cddim_sochi@mail.ru',
      address: 'г. Сочи, ул. Навагинская, 9',
      workHours: 'Пн–Пт: 9:00 – 18:00\nСб–Вс: по расписанию мероприятий',
      vkLink: 'https://vk.ru/crm.sochi',
      vkEnabled: true,
      tgLink: 'https://t.me/crm_sochi',
      tgEnabled: true,
      maxLink: 'https://max.ru/id2320047033_gos',
      maxEnabled: true,
      vkGroupId: 'crm.sochi',
      logoUrl: '/brand/logo.png',
      heroImageUrl: '/brand/hero-cover.jpg',
      heroVideoUrl: '/brand/hero-cover.mp4',
      operatorName: 'МКУ города Сочи «Центр развития молодёжи»',
      publicEventsVisibility: true,
      govWidgetsEnabled: true,
      govWidgetsTitle: 'Госуслуги',
      govWidgetsJson: GOV_WIDGETS_JSON,
      afishaWeekEnabled: true,
      afishaWeekJson: AFISHA_WEEK_JSON,
    },
  });

  await prisma.pageContent.upsert({
    where: { slug: 'about' },
    create: {
      slug: 'about',
      title: 'О нас',
      content: aboutHtml(),
      images: '/brand/logo.png',
      menuPosition: 'HEADER_MAIN',
      template: 'HERO',
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
    update: {
      title: 'О нас',
      content: aboutHtml(),
      images: '/brand/logo.png',
      template: 'HERO',
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });

  // Repair broken local news images
  console.log('Repairing news images…');
  const newsDir = path.join(PUBLIC, 'uploads', 'news');
  fs.mkdirSync(newsDir, { recursive: true });
  const news = await prisma.news.findMany({
    where: { status: 'PUBLISHED', vkPostId: { not: null } },
    select: { id: true, imageUrl: true, title: true, vkPostId: true },
  });
  for (const n of news) {
    const rel = n.imageUrl || '';
    if (!rel.startsWith('/uploads/news/')) {
      // assign default cover if empty
      if (!rel || /userapi\.com|vkuserphoto\.ru/i.test(rel)) {
        await prisma.news.update({
          where: { id: n.id },
          data: { imageUrl: '/covers/news-default.svg' },
        });
      }
      continue;
    }
    const abs = path.join(PUBLIC, rel.replace(/^\//, ''));
    let bad = !fs.existsSync(abs);
    if (!bad) {
      const st = fs.statSync(abs);
      if (st.size < 8000) bad = true;
      else {
        const buf = fs.readFileSync(abs);
        if (!isRealImage(buf)) bad = true;
      }
    }
    if (bad) {
      await prisma.news.update({
        where: { id: n.id },
        data: { imageUrl: '/covers/news-default.svg' },
      });
      console.log('fixed bad image → default', n.title?.slice(0, 40));
    }
  }

  // Re-import latest posts from scrape JSON if present (refresh images)
  const postsPath = path.join(__dirname, 'vk-crm', 'posts.json');
  if (fs.existsSync(postsPath)) {
    const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
    for (const post of posts) {
      const vkPostId = post.vkPostId;
      if (!vkPostId) continue;
      let localImage = null;
      if (post.imageUrl && /^https?:\/\//i.test(post.imageUrl)) {
        try {
          const buf = await requestBuffer(post.imageUrl);
          if (isRealImage(buf)) {
            const ext = buf[0] === 0x89 ? 'png' : 'jpg';
            const filename = `vk_${String(vkPostId).replace(/[^0-9_-]/g, '')}.${ext}`;
            fs.writeFileSync(path.join(newsDir, filename), buf);
            localImage = `/uploads/news/${filename}`;
          }
        } catch (e) {
          console.warn('img', vkPostId, e.message);
        }
      }
      const existing = await prisma.news.findUnique({ where: { vkPostId } });
      const data = {
        title: (post.title || 'Новость').slice(0, 120),
        text: post.text || post.title || '',
        vkLink: post.vkLink || `https://vk.ru/wall${vkPostId}`,
        status: 'PUBLISHED',
        ...(localImage ? { imageUrl: localImage } : {}),
      };
      if (existing) {
        await prisma.news.update({ where: { id: existing.id }, data });
      } else {
        await prisma.news.create({
          data: {
            vkPostId,
            ...data,
            imageUrl: localImage || '/covers/news-default.svg',
            publishedAt: new Date(),
          },
        });
      }
    }
    await prisma.news.updateMany({
      where: { OR: [{ imageUrl: { contains: 'userapi.com' } }, { imageUrl: { contains: 'vkuserphoto.ru' } }] },
      data: { imageUrl: '/covers/news-default.svg' },
    });
    console.log('VK posts refreshed from scrape JSON');
  }

  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
