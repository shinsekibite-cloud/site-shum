#!/usr/bin/env node
/**
 * Bootstrap first ADMIN + SiteSettings on a fresh install.
 *
 * Env (or flags):
 *   ADMIN_EMAIL / --email
 *   ADMIN_PASSWORD / --password   (min 10, letters+digits)
 *   SITE_NAME / --site-name
 *   PUBLIC_URL / --public-url     (https://domain.ru)
 *   TECH_EMAIL / --tech-email     (optional, only writes hint; TECH is env-driven)
 *
 * Usage inside web container or with DATABASE_URL:
 *   node scripts/seed-bootstrap-admin.mjs --email admin@example.ru --password 'StrongPass1!' \
 *     --site-name "Мой портал" --public-url https://portal.example.ru
 */
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

function arg(name, envName, fallback = '') {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return process.env[envName] || fallback;
}

const email = String(arg('--email', 'ADMIN_EMAIL', '')).trim().toLowerCase();
const password = String(arg('--password', 'ADMIN_PASSWORD', ''));
const siteName = String(arg('--site-name', 'SITE_NAME', 'YoungPortal')).trim() || 'YoungPortal';
const publicUrl = String(arg('--public-url', 'PUBLIC_URL', '')).trim().replace(/\/$/, '');
const adminName = String(arg('--name', 'ADMIN_NAME', 'Администратор')).trim() || 'Администратор';

if (!email || !password) {
  console.error('Need --email and --password (or ADMIN_EMAIL / ADMIN_PASSWORD)');
  process.exit(1);
}
if (password.length < 10 || !/[A-Za-zА-Яа-я]/.test(password) || !/\d/.test(password)) {
  console.error('Password: min 10 chars, letters and digits');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const hash = await bcrypt.hash(password, 12);
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, role: true },
  });

  let userId;
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        password: hash,
        role: 'ADMIN',
        mustChangePassword: false,
        name: adminName,
      },
    });
    userId = existing.id;
    console.log('Updated existing user → ADMIN:', email);
  } else {
    const created = await prisma.user.create({
      data: {
        email,
        name: adminName,
        password: hash,
        role: 'ADMIN',
        mustChangePassword: false,
        emailVerified: new Date(),
      },
    });
    userId = created.id;
    console.log('Created ADMIN:', email, userId);
  }

  await prisma.siteSettings.upsert({
    where: { id: '1' },
    create: {
      id: '1',
      siteName,
      publicSiteUrl: publicUrl || null,
    },
    update: {
      siteName,
      ...(publicUrl ? { publicSiteUrl: publicUrl } : {}),
    },
  });
  console.log('SiteSettings:', siteName, publicUrl || '(no url)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
