#!/usr/bin/env node
/**
 * Первичные учётки всех ролей для чистой / demo-установки.
 *
 * Env:
 *   DATABASE_URL          (обязательно)
 *   SEED_PASSWORD         общий пароль (мин. 10, буквы+цифры), default InstallSeed1!
 *   SEED_RESET_PASSWORDS  1 = всегда перезаписать пароли (для install/reinstall)
 *   SEED_DOMAIN           суффикс email, default local.yp → admin@local.yp
 *   SITE_NAME / PUBLIC_URL
 *
 * Роли:
 *   admin@DOMAIN     ADMIN
 *   mod@DOMAIN       MODERATOR
 *   part@DOMAIN      PARTICIPANT
 *   user@DOMAIN      USER
 *   scanner@DOMAIN   SCANNER
 *   private@DOMAIN   USER PRIVATE
 *
 * TECH — через TECH_EMAIL / TECH_BOOTSTRAP_PASSWORD в .env (не в БД).
 *
 *   node scripts/seed-install-roles.mjs
 */
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import fs from 'fs';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const DOMAIN = String(process.env.SEED_DOMAIN || 'local.yp')
  .trim()
  .toLowerCase()
  .replace(/^@/, '');
const PASS = String(process.env.SEED_PASSWORD || 'InstallSeed1!').trim();
const RESET = String(process.env.SEED_RESET_PASSWORDS || '1') !== '0';
const siteName = String(process.env.SITE_NAME || 'Молодёжь Сочи').trim();
const publicUrl = String(process.env.PUBLIC_URL || '').trim().replace(/\/$/, '');
const outFile = process.env.SEED_ACCOUNTS_FILE || '';

if (PASS.length < 10 || !/[A-Za-zА-Яа-я]/.test(PASS) || !/\d/.test(PASS)) {
  console.error('SEED_PASSWORD: мин. 10 символов, буквы и цифры');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const ACCOUNTS = [
  {
    email: `admin@${DOMAIN}`,
    name: 'Администратор',
    role: 'ADMIN',
    bio: 'Полный доступ к кабинету',
  },
  {
    email: `mod@${DOMAIN}`,
    name: 'Модератор',
    role: 'MODERATOR',
    permissions: 'projects,clubs,spaces,bookings,applications,pages,programs,news,stats,scanner',
    bio: 'Модерация заявок и контента',
  },
  {
    email: `part@${DOMAIN}`,
    name: 'Участник',
    role: 'PARTICIPANT',
    bio: 'Участник проектов и событий',
  },
  {
    email: `user@${DOMAIN}`,
    name: 'Пользователь',
    role: 'USER',
    bio: 'Обычный пользователь',
  },
  {
    email: `scanner@${DOMAIN}`,
    name: 'Сканер',
    role: 'SCANNER',
    bio: 'Проверка билетов на входе',
  },
  {
    email: `private@${DOMAIN}`,
    name: 'Закрытый профиль',
    role: 'USER',
    profileVisibility: 'PRIVATE',
    bio: 'Профиль скрыт',
  },
];

async function upsertUser(spec, passwordHash) {
  const existing = await prisma.user.findFirst({
    where: { email: { equals: spec.email, mode: 'insensitive' } },
  });
  const base = {
    name: spec.name,
    role: spec.role,
    permissions: spec.permissions ?? null,
    profileVisibility: spec.profileVisibility || 'PUBLIC',
    bio: spec.bio || null,
    city: 'Сочи',
    deletedAt: null,
    blockedAt: null,
    mustChangePassword: false,
    emailVerified: new Date(),
    privacyAcceptedAt: new Date(),
    rulesAcceptedAt: new Date(),
    cookiesAcceptedAt: new Date(),
    isDemoData: true,
  };
  if (existing) {
    const data = { ...base };
    if (RESET) data.password = passwordHash;
    return prisma.user.update({ where: { id: existing.id }, data });
  }
  return prisma.user.create({
    data: {
      email: spec.email,
      password: passwordHash,
      ...base,
    },
  });
}

async function main() {
  const hash = await bcrypt.hash(PASS, 12);

  await prisma.siteSettings.upsert({
    where: { id: '1' },
    update: {
      siteName,
      ...(publicUrl ? { publicSiteUrl: publicUrl } : {}),
      publicEventsVisibility: true,
    },
    create: {
      id: '1',
      siteName,
      publicSiteUrl: publicUrl || null,
      publicEventsVisibility: true,
    },
  });

  const created = [];
  for (const spec of ACCOUNTS) {
    const u = await upsertUser(spec, hash);
    created.push({ email: spec.email, role: spec.role, id: u.id });
    console.log(`ok ${spec.role.padEnd(12)} ${spec.email}`);
  }

  // Лёгкий демо-контент, чтобы кабинет не был пустым
  const demoProject = await prisma.project.findFirst({ where: { title: 'Демо-проект установки' } });
  if (!demoProject) {
    await prisma.project.create({
      data: {
        title: 'Демо-проект установки',
        description: '<p>Создан seed-install-roles при чистой установке.</p>',
        status: 'ACTIVE',
        isDemoData: true,
      },
    });
  }

  const lines = [
    'YoungPortal — первичные учётки (install seed)',
    `Domain suffix: @${DOMAIN}`,
    `Password (all): ${PASS}`,
    `Reset passwords: ${RESET}`,
    '',
    ...created.map((c) => `${c.role.padEnd(12)}  ${c.email}`),
    '',
    'TECH: задайте в .env TECH_EMAIL + TECH_BOOTSTRAP_PASSWORD (вход без записи в БД).',
  ];
  const text = lines.join('\n') + '\n';
  console.log('\n' + text);
  if (outFile) {
    fs.writeFileSync(outFile, text, { mode: 0o600 });
    console.log('Wrote', outFile);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
