/**
 * Backfill Club.signupUrl from description when missing.
 *   node scripts/heal-club-signup-urls.mjs
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const URL_RE =
  /(?:https?:\/\/)?(?:t\.me|telegram\.me)\/[^\s<>"']+|https?:\/\/[^\s<>"']+/gi;

function normalize(raw) {
  let u = String(raw || '').trim();
  if (!u) return null;
  if (u.startsWith('@')) u = `https://t.me/${u.slice(1)}`;
  else if (/^t\.me\//i.test(u) || /^telegram\.me\//i.test(u)) u = `https://${u}`;
  try {
    const parsed = new URL(u);
    if (!/^https?:$/i.test(parsed.protocol)) return null;
    return parsed.toString().replace(/[),.;]+$/g, '');
  } catch {
    return null;
  }
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.log('No DATABASE_URL');
    return;
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const clubs = await prisma.club.findMany({
    where: { OR: [{ signupUrl: null }, { signupUrl: '' }] },
    select: { id: true, title: true, description: true, signupUrl: true },
  });
  let n = 0;
  for (const club of clubs) {
    const text = stripHtml(club.description);
    const matches = text.match(URL_RE) || [];
    let found = null;
    for (const m of matches) {
      found = normalize(m);
      if (found) break;
    }
    if (!found) continue;
    await prisma.club.update({ where: { id: club.id }, data: { signupUrl: found } });
    console.log(club.title, '→', found);
    n++;
  }
  console.log('Updated', n, 'clubs');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
