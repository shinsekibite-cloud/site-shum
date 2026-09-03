/**
 * Heal News covers from scripts/fixtures/vk-crm-posts.json when VK API token is missing.
 *   node scripts/heal-vk-news-from-cache.mjs
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, 'fixtures', 'vk-crm-posts.json');
const uploadDir =
  process.env.UPLOAD_NEWS_DIR || path.join(process.cwd(), 'public', 'uploads', 'news');
const MIN_BYTES = 8000;

function isPlaceholder(imageUrl) {
  const u = String(imageUrl || '').trim();
  if (!u) return true;
  return (
    /news-default/i.test(u) ||
    /section-news/i.test(u) ||
    /\/covers\/news-/i.test(u) ||
    u.startsWith('/media/news/') ||
    u === '/hero-bg.jpg'
  );
}

function isRemoteImage(url) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  if (/scorecardresearch|doubleclick|counter|pixel/i.test(url)) return false;
  return true;
}

function detectImageType(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45
  ) {
    return 'webp';
  }
  return null;
}

function requestBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; YoungPortal/1.0)',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
        timeout: 20000,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).toString();
          return resolve(requestBuffer(next, redirects + 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

async function downloadNewsImage(url, destBasename) {
  const buf = await requestBuffer(url);
  if (buf.length < MIN_BYTES) return null;
  const ext = detectImageType(buf);
  if (!ext) return null;
  fs.mkdirSync(uploadDir, { recursive: true });
  const fileName = `${destBasename}.${ext}`;
  fs.writeFileSync(path.join(uploadDir, fileName), buf);
  return `/uploads/news/${fileName}`;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.log('No DATABASE_URL');
    return;
  }
  if (!fs.existsSync(fixturePath)) {
    console.error('Missing fixture', fixturePath);
    return;
  }

  const posts = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  let updated = 0;
  let skipped = 0;

  try {
    for (const post of posts) {
      const vkPostId = String(post.vkPostId || '').trim();
      const remote = String(post.imageUrl || '').trim();
      if (!vkPostId || !isRemoteImage(remote)) {
        skipped++;
        continue;
      }

      const existing = await prisma.news.findUnique({ where: { vkPostId } });
      if (!existing || !isPlaceholder(existing.imageUrl)) {
        skipped++;
        continue;
      }

      try {
        const local = await downloadNewsImage(
          remote,
          `vk_${vkPostId.replace(/[^0-9_-]/g, '')}`
        );
        if (!local) {
          skipped++;
          continue;
        }
        await prisma.news.update({
          where: { id: existing.id },
          data: { imageUrl: local },
        });
        updated++;
        console.log('updated', vkPostId, '→', local);
      } catch (e) {
        console.warn('fail', vkPostId, e?.message || e);
        skipped++;
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(JSON.stringify({ ok: true, updated, skipped }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
