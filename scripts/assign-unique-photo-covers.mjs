/**
 * Download unique Wikimedia Commons photos and assign one distinct local file
 * per catalog entity (projects, clubs, spaces, places, programs, news).
 *
 * Never reuses the same public URL across entities — each gets its own copy
 * under /uploads/covers/photo/{kind}-{id}.jpg
 *
 *   DATABASE_URL=... node scripts/assign-unique-photo-covers.mjs
 *   DATABASE_URL=... node scripts/assign-unique-photo-covers.mjs --force
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'uploads', 'covers', 'photo');
const FORCE = process.argv.includes('--force');

const UA = 'YoungPortalCoverBot/1.0 (https://young.idivles.ru; cover assignment)';

/** Themed Commons search queries — enough unique photos for all catalog rows. */
const SEARCHES = [
  'Sochi Black Sea beach',
  'Sochi embankment',
  'Rosa Khutor mountains',
  'youth volunteers event',
  'basketball sport youth',
  'concert stage music',
  'yoga outdoor park',
  'coworking office modern',
  'workshop makerspace',
  'cinema film screen',
  'gymnastics hall',
  'auditorium conference hall',
  'library students reading',
  'night city lights',
  'reforestation planting trees',
  'football stadium match',
  'swimming pool sport',
  'dance performance stage',
  'photography camera workshop',
  'debate student discussion',
  'board games table',
  'hiking Caucasus mountains',
  'beach volleyball',
  'skateboard park youth',
  'rock climbing indoor',
  'martial arts training',
  'choir singing concert',
  'guitar acoustic music',
  'theatre drama stage',
  'art gallery exhibition',
  'museum visitors hall',
  'park picnic friends',
  'festival crowd summer',
  'parade youth celebration',
  'coding hackathon laptop',
  'robotics STEM education',
  'ecology cleanup beach',
  'bicycle cycling city',
  'kayak sea sport',
  'skiing winter mountains',
  'camping tent nature',
  'sunrise seascape',
  'sunset pier',
  'urban street art mural',
  'architecture modern building',
  'bridge cityscape',
  'fountain park square',
  'marketplace street food',
  'classroom students learning',
  'graduation ceremony',
  'handshake teamwork meeting',
  'presentation speaker podium',
  'notebook journaling desk',
  'coffee coworking friends',
  'skateboard tricks',
  'parkour training',
  'tennis court sport',
  'table tennis ping pong',
  'chess tournament',
  'quiz competition',
  'science fair exhibition',
  'astronomy telescope night',
  'botanical garden flowers',
  'waterfall forest nature',
  'lake reflection mountains',
  'sailboat marina',
  'palm trees Sochi',
  'Olympic park Sochi',
  'Krasnaya Polyana resort',
  'Adler district Sochi',
  'Caucasus nature reserve',
  'volunteer planting day',
  'charity event community',
  'youth leadership seminar',
  'startup pitch event',
  'media journalism camera',
  'radio studio microphone',
  'podcast recording',
  'video production set',
  'fashion show runway',
  'design workshop creative',
  'pottery ceramics craft',
  'painting art class',
  'calligraphy workshop',
  'cooking class kitchen',
  'gardening community plot',
  'animal shelter volunteers',
  'first aid training',
  'orienteering map forest',
  'rowing boat team',
  'fencing sport',
  'archery training',
  'equestrian horse riding',
  'surfboard ocean wave',
  'inline skating park',
  'frisbee park friends',
  'yoga sunrise beach',
  'meditation nature calm',
  'family picnic park',
  'children playground park',
  'book fair outdoor',
];

function isWeakOrEmpty(v) {
  const u = String(v || '').trim();
  if (!u || u === '[]') return true;
  if (/\/covers\/[^/]+\.svg$/i.test(u)) return true;
  if (/\/uploads\/covers\/[^/]+\.svg$/i.test(u)) return true;
  if (/\/brand\/templates\//i.test(u)) return true;
  if (/\/media\/news\//i.test(u)) return true;
  if (/space-house\.svg/i.test(u)) return true;
  if (/news-default/i.test(u)) return true;
  return false;
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('http://') ? http : https;
    const req = lib.get(
      url,
      { headers: { 'User-Agent': UA, Accept: 'image/*,*/*' } },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          download(res.headers.location, dest).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(dest)));
        file.on('error', reject);
      }
    );
    req.on('error', reject);
    req.setTimeout(45000, () => {
      req.destroy(new Error('timeout'));
    });
  });
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': UA } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchJson(res.headers.location).then(resolve, reject);
          return;
        }
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

async function searchCommons(query, limit = 4) {
  const api =
    'https://commons.wikimedia.org/w/api.php?' +
    new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: query,
      gsrnamespace: '6',
      gsrlimit: String(limit),
      prop: 'imageinfo',
      iiprop: 'url|mime|size',
      iiurlwidth: '1280',
      format: 'json',
    }).toString();
  const data = await fetchJson(api);
  const pages = Object.values(data?.query?.pages || {});
  const out = [];
  for (const p of pages) {
    const info = p.imageinfo?.[0];
    if (!info) continue;
    const mime = String(info.mime || '');
    if (!mime.startsWith('image/') || mime.includes('svg')) continue;
    const url = info.thumburl || info.url;
    if (!url || !/^https?:\/\//i.test(url)) continue;
    // skip tiny / maps / coats of arms noise when possible
    if ((info.width || 0) > 0 && info.width < 400) continue;
    out.push({ title: p.title, url: url.split('?')[0], mime });
  }
  return out;
}

async function buildPhotoPool(needed) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const pool = [];
  const seenUrls = new Set();

  // Prefer existing local thematic JPGs first
  const localPhotoDir = path.join(ROOT, 'public', 'covers', 'photo');
  if (fs.existsSync(localPhotoDir)) {
    for (const name of fs.readdirSync(localPhotoDir).filter((f) => /\.jpe?g$/i.test(f))) {
      const src = path.join(localPhotoDir, name);
      pool.push({ kind: 'local', src, key: `local-${name}` });
    }
  }

  for (const q of SEARCHES) {
    if (pool.length >= needed + 20) break;
    try {
      const hits = await searchCommons(q, 5);
      for (const hit of hits) {
        if (seenUrls.has(hit.url)) continue;
        seenUrls.add(hit.url);
        pool.push({ kind: 'remote', src: hit.url, key: hit.title });
        if (pool.length >= needed + 40) break;
      }
      await new Promise((r) => setTimeout(r, 120));
    } catch (e) {
      console.warn('search fail', q, e.message || e);
    }
  }

  console.log(`photo pool size: ${pool.length} (need ~${needed})`);
  return pool;
}

async function materializeUniqueFile(poolItem, kind, entityId, index) {
  const safeId = String(entityId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || `n${index}`;
  const file = `${kind}-${safeId}-${index}.jpg`;
  const dest = path.join(OUT_DIR, file);
  const publicUrl = `/uploads/covers/photo/${file}`;

  if (poolItem.kind === 'local') {
    fs.copyFileSync(poolItem.src, dest);
  } else {
    await download(poolItem.src, dest);
  }
  const st = fs.statSync(dest);
  if (st.size < 8_000) {
    fs.unlinkSync(dest);
    throw new Error('file too small');
  }
  return publicUrl;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  const projects = await prisma.project.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, title: true, image: true } });
  const clubs = await prisma.club.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, title: true, image: true } });
  const spaces = await prisma.space.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, title: true, image: true } });
  const places = await prisma.place.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, title: true, image: true } });
  const programs = await prisma.portalProgram.findMany({
    orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }],
    select: { id: true, title: true, image: true },
  });
  const news = await prisma.news.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, title: true, imageUrl: true } });

  // Detect duplicate image URLs that should be reassigned (keep first owner)
  const claim = new Map(); // image -> first entity key
  const markDup = (image, key) => {
    if (!image || isWeakOrEmpty(image)) return true;
    if (claim.has(image)) return true;
    claim.set(image, key);
    return false;
  };

  const jobs = [];
  for (const p of projects) {
    const key = `project:${p.id}`;
    if (FORCE || isWeakOrEmpty(p.image) || markDup(p.image, key)) {
      jobs.push({ table: 'project', id: p.id, title: p.title, kind: 'project' });
    }
  }
  for (const c of clubs) {
    const key = `club:${c.id}`;
    if (FORCE || isWeakOrEmpty(c.image) || markDup(c.image, key)) {
      jobs.push({ table: 'club', id: c.id, title: c.title, kind: 'club' });
    }
  }
  for (const s of spaces) {
    const key = `space:${s.id}`;
    if (FORCE || isWeakOrEmpty(s.image) || markDup(s.image, key)) {
      jobs.push({ table: 'space', id: s.id, title: s.title, kind: 'space' });
    }
  }
  for (const p of places) {
    const key = `place:${p.id}`;
    if (FORCE || isWeakOrEmpty(p.image) || markDup(p.image, key)) {
      jobs.push({ table: 'place', id: p.id, title: p.title, kind: 'place' });
    }
  }
  for (const p of programs) {
    const key = `program:${p.id}`;
    if (FORCE || isWeakOrEmpty(p.image) || markDup(p.image, key)) {
      jobs.push({ table: 'program', id: p.id, title: p.title, kind: 'program' });
    }
  }
  for (const n of news) {
    const key = `news:${n.id}`;
    if (FORCE || isWeakOrEmpty(n.imageUrl) || markDup(n.imageUrl, key)) {
      jobs.push({ table: 'news', id: n.id, title: n.title, kind: 'news' });
    }
  }

  console.log(`entities to assign: ${jobs.length}`);
  if (!jobs.length) {
    await prisma.$disconnect();
    return;
  }

  const pool = await buildPhotoPool(jobs.length);
  if (!pool.length) {
    console.error('empty photo pool');
    process.exit(1);
  }

  let poolIdx = 0;
  let ok = 0;
  let fail = 0;

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    let assigned = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const item = pool[(poolIdx + attempt) % pool.length];
      try {
        assigned = await materializeUniqueFile(item, job.kind, job.id, i);
        poolIdx = (poolIdx + attempt + 1) % pool.length;
        break;
      } catch (e) {
        console.warn('download fail', job.kind, job.title, e.message || e);
      }
    }
    if (!assigned) {
      fail++;
      continue;
    }

    if (job.table === 'project') {
      await prisma.project.update({ where: { id: job.id }, data: { image: assigned } });
    } else if (job.table === 'club') {
      await prisma.club.update({ where: { id: job.id }, data: { image: assigned } });
    } else if (job.table === 'space') {
      await prisma.space.update({ where: { id: job.id }, data: { image: assigned } });
    } else if (job.table === 'place') {
      await prisma.place.update({ where: { id: job.id }, data: { image: assigned } });
    } else if (job.table === 'program') {
      await prisma.portalProgram.update({ where: { id: job.id }, data: { image: assigned } });
    } else if (job.table === 'news') {
      await prisma.news.update({ where: { id: job.id }, data: { imageUrl: assigned } });
    }
    ok++;
    console.log('✓', job.kind, job.title || job.id, '→', assigned);
  }

  console.log(`done ok=${ok} fail=${fail}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
