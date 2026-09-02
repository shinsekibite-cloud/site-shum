/**
 * Fill SiteSettings, About CMS page, and News from VK group crm.sochi scrape.
 * Usage (in web container or with DATABASE_URL):
 *   node scripts/seed-from-vk-crm.mjs
 * Optional:
 *   VK_SCRAPE_JSON=/path/to/posts.json GROUP_JSON=/path/to/group.json
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const PUBLIC = process.env.PUBLIC_DIR || path.join(process.cwd(), 'public');
const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const postsPath = process.env.VK_SCRAPE_JSON || path.join(scriptDir, 'vk-crm', 'posts.json');
const groupPath = process.env.GROUP_JSON || path.join(scriptDir, 'vk-crm', 'group.json');

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

function toHtmlParagraphs(text) {
  const parts = String(text || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return '<p></p>';
  return parts
    .map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')}</p>`)
    .join('\n');
}

async function main() {
  if (!fs.existsSync(postsPath) || !fs.existsSync(groupPath)) {
    console.error('Missing scrape JSON. Expected:', postsPath, groupPath);
    process.exit(1);
  }
  const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
  const group = JSON.parse(fs.readFileSync(groupPath, 'utf8'));

  const newsDir = path.join(PUBLIC, 'uploads', 'news');
  fs.mkdirSync(newsDir, { recursive: true });

  await prisma.siteSettings.upsert({
    where: { id: '1' },
    create: {
      id: '1',
      siteName: group.siteName || 'Центр развития молодежи Сочи',
      contactPhone: group.phone || null,
      contactEmail: group.email || null,
      supportEmail: group.email || null,
      address: group.address || null,
      workHours: group.workHours || null,
      vkLink: group.vkLink || 'https://vk.ru/crm.sochi',
      vkEnabled: true,
      vkGroupId: group.vkGroupId || 'crm.sochi',
      vkSyncEnabled: false,
      logoUrl: '/brand/logo.png',
      operatorName: 'МКУ города Сочи «Центр развития молодёжи»',
    },
    update: {
      siteName: group.siteName || 'Центр развития молодежи Сочи',
      contactPhone: group.phone || undefined,
      contactEmail: group.email || undefined,
      supportEmail: group.email || undefined,
      address: group.address || undefined,
      workHours: group.workHours || undefined,
      vkLink: group.vkLink || 'https://vk.ru/crm.sochi',
      vkEnabled: true,
      vkGroupId: group.vkGroupId || 'crm.sochi',
      logoUrl: '/brand/logo.png',
      operatorName: 'МКУ города Сочи «Центр развития молодёжи»',
    },
  });
  console.log('SiteSettings updated for CRM Sochi');

  const aboutHtml = `
<p><strong>МКУ города Сочи «Центр развития молодёжи»</strong> — официальный оператор молодёжной политики города. Портал собирает афишу, клубы, пространства и возможности для самореализации.</p>
<p>${(group.description || '').replace(/</g, '&lt;')}</p>
<h2>Площадки</h2>
<ul>
<li><strong>Дом Молодёжи</strong> — ул. Навагинская, 9</li>
<li><strong>Молодёжный центр</strong> — ул. Тимирязева, 6</li>
</ul>
<h2>Контакты</h2>
<ul>
<li>Телефон: ${group.phone || ''}</li>
<li>Email: ${group.email || ''}</li>
<li>ВКонтакте: <a href="${group.vkLink || 'https://vk.ru/crm.sochi'}" target="_blank" rel="noopener">vk.ru/crm.sochi</a></li>
</ul>
<p>Актуальные новости и анонсы публикуются на портале и дублируются из официальной группы ВКонтакте.</p>
`.trim();

  await prisma.pageContent.upsert({
    where: { slug: 'about' },
    create: {
      slug: 'about',
      title: 'О нас',
      content: aboutHtml,
      images: '/brand/logo.png',
      menuPosition: 'HEADER_MAIN',
      template: 'HERO',
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
    update: {
      title: 'О нас — Центр развития молодежи Сочи',
      content: aboutHtml,
      images: '/brand/logo.png',
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });
  console.log('About page updated');

  let added = 0;
  let updated = 0;
  for (const post of posts) {
    const vkPostId = String(post.vkPostId || '');
    if (!vkPostId) continue;
    let localImage = null;
    if (post.imageUrl && /^https?:\/\//i.test(post.imageUrl)) {
      const safe = vkPostId.replace(/[^0-9_-]/g, '');
      const filename = `vk_${safe}.jpg`;
      const dest = path.join(newsDir, filename);
      try {
        await download(post.imageUrl, dest);
        localImage = `/uploads/news/${filename}`;
      } catch (e) {
        console.warn('image fail', vkPostId, e.message);
        // Never persist VK CDN URLs — they expire / return stubs.
        localImage = null;
      }
    }
    const title = (post.title || 'Новость').slice(0, 120);
    const text = post.text || title;
    const existing = await prisma.news.findUnique({ where: { vkPostId } });
    if (existing) {
      const keepExisting =
        existing.imageUrl && !/userapi|vkuserphoto/i.test(existing.imageUrl)
          ? existing.imageUrl
          : '/covers/news-default.svg';
      await prisma.news.update({
        where: { id: existing.id },
        data: {
          title,
          text,
          imageUrl: localImage || keepExisting,
          vkLink: post.vkLink || existing.vkLink,
          status: 'PUBLISHED',
          publishedAt: existing.publishedAt || new Date(),
        },
      });
      updated++;
    } else {
      await prisma.news.create({
        data: {
          vkPostId,
          title,
          text,
          imageUrl: localImage || '/covers/news-default.svg',
          vkLink: post.vkLink || `https://vk.ru/wall${vkPostId}`,
          status: 'PUBLISHED',
          publishedAt: new Date(),
          createdAt: new Date(),
        },
      });
      added++;
    }
  }
  console.log(`News: added ${added}, updated ${updated}`);

  // Soft-hide obvious demo news without vkPostId if titles look like placeholders
  const demo = await prisma.news.updateMany({
    where: {
      vkPostId: null,
      OR: [
        { title: { contains: 'Демо' } },
        { title: { contains: 'демо' } },
        { isDemoData: true },
      ],
    },
    data: { status: 'DRAFT' },
  });
  console.log('Demo news drafted:', demo.count);

  // Align key spaces with CRM venues when present
  const spaces = await prisma.space.findMany({ take: 20, orderBy: { createdAt: 'asc' } });
  const venues = [
    {
      match: /дом|навагин/i,
      title: 'Дом Молодёжи',
      address: 'г. Сочи, ул. Навагинская, 9',
      description:
        'Главная площадка МКУ «Центр развития молодёжи»: клубы, афиша, мероприятия и запись через портал и VK crm.sochi.',
    },
    {
      match: /центр|тимиряз/i,
      title: 'Молодёжный центр',
      address: 'г. Сочи, ул. Тимирязева, 6',
      description:
        'Площадка Центра развития молодёжи Сочи: занятия, клубы и события. Анонсы — в группе vk.ru/crm.sochi.',
    },
  ];
  for (const venue of venues) {
    const space = spaces.find((s) => venue.match.test(`${s.title} ${s.address || ''}`)) || null;
    if (!space) continue;
    await prisma.space.update({
      where: { id: space.id },
      data: {
        title: venue.title,
        address: venue.address,
        description: venue.description,
        status: 'ACTIVE',
      },
    });
    console.log('Space updated:', space.id, venue.title);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
