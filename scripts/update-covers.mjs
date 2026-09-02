/**
 * Download cover photos for projects/clubs/spaces/pages missing images.
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/update-covers.mjs
 */
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import path from 'path';
import https from 'https';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://sochi:sochi@127.0.0.1:5432/sochi_portal?schema=public';
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const COVERS = [
  'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1200&q=80',
  'https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=1200&q=80',
  'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&q=80',
  'https://images.unsplash.com/photo-1523580494863-6f3031224c94?w=1200&q=80',
  'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&q=80',
  'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=1200&q=80',
  'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=1200&q=80',
  'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=1200&q=80',
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'YoungPortal/1.0' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const file = createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', reject);
    }).on('error', reject);
  });
}

async function saveCover(subdir, index) {
  const dir = path.join(process.cwd(), 'public', 'uploads', subdir);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = `${subdir}-${index}-${Date.now()}.jpg`;
  const dest = path.join(dir, file);
  await download(COVERS[index % COVERS.length], dest);
  return `/uploads/${subdir}/${file}`;
}

function needsImage(v) {
  return !v || v === '[]' || String(v).trim() === '';
}

async function main() {
  let i = 0;
  for (const p of await prisma.project.findMany()) {
    if (!needsImage(p.image)) continue;
    const image = await saveCover('projects', i++);
    await prisma.project.update({ where: { id: p.id }, data: { image } });
    console.log('project', p.title, image);
  }
  for (const c of await prisma.club.findMany()) {
    if (!needsImage(c.image)) continue;
    const image = await saveCover('clubs', i++);
    await prisma.club.update({ where: { id: c.id }, data: { image } });
    console.log('club', c.title, image);
  }
  for (const s of await prisma.space.findMany()) {
    if (!needsImage(s.image)) continue;
    const image = await saveCover('spaces', i++);
    await prisma.space.update({ where: { id: s.id }, data: { image } });
    console.log('space', s.title, image);
  }
  for (const p of await prisma.pageContent.findMany()) {
    if (!needsImage(p.images)) continue;
    const images = await saveCover('pages', i++);
    await prisma.pageContent.update({ where: { id: p.id }, data: { images } });
    console.log('page', p.slug, images);
  }

  await prisma.pageContent.updateMany({
    where: { slug: 'about' },
    data: { menuPosition: 'HEADER_MAIN', template: 'HERO' },
  });
  await prisma.pageContent.updateMany({
    where: { slug: { in: ['documents'] } },
    data: { menuPosition: 'FOOTER' },
  });
  // Dedicated /contacts route — keep CMS slug out of menus to avoid duplicates
  await prisma.pageContent.updateMany({
    where: { slug: 'contacts' },
    data: { menuPosition: 'NONE' },
  });
  await prisma.pageContent.updateMany({
    where: { slug: 'grants' },
    data: { menuPosition: 'HEADER_SUB' },
  });

  console.log('done');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
