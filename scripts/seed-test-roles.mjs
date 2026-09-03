#!/usr/bin/env node
/**
 * Тестовые учётки ролей (не трогает prod admin@sochi.ru и т.п.).
 *
 *   DATABASE_URL=… SEED_PASSWORD='TestPortal1!' node scripts/seed-test-roles.mjs
 *
 * Emails: test-admin@yp.test, test-mod@yp.test, test-part@yp.test,
 *         test-user@yp.test, test-scanner@yp.test
 */
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const PASS = String(process.env.SEED_PASSWORD || 'TestPortal1!').trim();
if (PASS.length < 10 || !/[A-Za-zА-Яа-я]/.test(PASS) || !/\d/.test(PASS)) {
  console.error('SEED_PASSWORD: мин. 10 символов, буквы и цифры');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const ACCOUNTS = [
  {
    email: 'test-admin@yp.test',
    name: 'Тест Админ',
    role: 'ADMIN',
    bio: 'Тестовая учётка администратора',
  },
  {
    email: 'test-mod@yp.test',
    name: 'Тест Модератор',
    role: 'MODERATOR',
    permissions: 'projects,clubs,spaces,bookings,applications,pages,programs,news,stats,scanner',
    bio: 'Тестовая модерация',
  },
  {
    email: 'test-part@yp.test',
    name: 'Тест Участник',
    role: 'PARTICIPANT',
    bio: 'Тестовый участник',
  },
  {
    email: 'test-user@yp.test',
    name: 'Тест Пользователь',
    role: 'USER',
    bio: 'Тестовый пользователь',
  },
  {
    email: 'test-scanner@yp.test',
    name: 'Тест Сканер',
    role: 'SCANNER',
    bio: 'Сервисная учётка сканирования билетов',
    phone: '+79005550101',
  },
];

async function upsert(spec, passwordHash) {
  const existing = await prisma.user.findUnique({ where: { email: spec.email } });
  const data = {
    name: spec.name,
    role: spec.role,
    bio: spec.bio || null,
    permissions: spec.permissions || null,
    phone: spec.phone || null,
    password: passwordHash,
    emailVerified: new Date(),
    blockedAt: null,
  };
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data });
    return { email: spec.email, role: spec.role, action: 'updated' };
  }
  await prisma.user.create({
    data: {
      email: spec.email,
      ...data,
    },
  });
  return { email: spec.email, role: spec.role, action: 'created' };
}

async function main() {
  const hash = await bcrypt.hash(PASS, 12);
  const rows = [];
  for (const a of ACCOUNTS) {
    rows.push(await upsert(a, hash));
  }
  console.log(JSON.stringify({ ok: true, password: PASS, accounts: rows }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
