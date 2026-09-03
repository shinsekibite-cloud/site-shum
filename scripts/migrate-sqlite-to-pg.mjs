/**
 * One-shot SQLite → PostgreSQL data copy.
 *
 * Usage (inside web container after `prisma db push`):
 *   SQLITE_PATH=/app/data/dev.db node scripts/migrate-sqlite-to-pg.mjs
 *
 * Skips if PostgreSQL already has users (unless FORCE=1).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const require = createRequire(import.meta.url);

const sqlitePath =
  process.env.SQLITE_PATH ||
  process.env.DB_PATH ||
  (process.env.DATABASE_URL?.startsWith('file:')
    ? process.env.DATABASE_URL.replace(/^file:/, '')
    : '/app/data/dev.db');

const pgUrl = process.env.DATABASE_URL;
if (!pgUrl || pgUrl.startsWith('file:')) {
  console.error('DATABASE_URL must be a PostgreSQL connection string');
  process.exit(1);
}

if (!fs.existsSync(sqlitePath)) {
  console.error('SQLite file not found:', sqlitePath);
  process.exit(1);
}

const Database = require(process.env.BETTER_SQLITE3_PATH || 'better-sqlite3');
const sqlite = new Database(sqlitePath, { readonly: true });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: pgUrl }),
});

const BOOL_FIELDS = new Set([
  'isDemoData',
  'publicEventsVisibility',
  'vkEnabled',
  'tgEnabled',
  'okEnabled',
  'whatsappEnabled',
  'rutubeEnabled',
  'vkSyncEnabled',
  'autoApproveBookings',
  'maintenanceMode',
]);

const DATE_FIELDS = new Set([
  'emailVerified',
  'phoneVerified',
  'expires',
  'createdAt',
  'updatedAt',
  'startTime',
  'endTime',
  'vkLastSync',
  'reminderSentAt',
  'publishedAt',
]);

function tableExists(name) {
  const row = sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
    .get(name);
  return Boolean(row);
}

function readAll(table) {
  if (!tableExists(table)) return [];
  return sqlite.prepare(`SELECT * FROM "${table}"`).all();
}

function convertRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      out[key] = null;
      continue;
    }
    if (BOOL_FIELDS.has(key)) {
      out[key] = value === 1 || value === true || value === '1' || value === 'true';
      continue;
    }
    if (DATE_FIELDS.has(key)) {
      out[key] = value instanceof Date ? value : new Date(value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

async function insertMany(label, rows, insertFn) {
  if (!rows.length) {
    console.log(`${label}: 0`);
    return;
  }
  let ok = 0;
  for (const row of rows) {
    try {
      await insertFn(convertRow(row));
      ok += 1;
    } catch (e) {
      console.warn(`${label} skip ${row.id || row.token || '?'}:`, e?.message || e);
    }
  }
  console.log(`${label}: ${ok}/${rows.length}`);
}

async function main() {
  const existing = await prisma.user.count();
  if (existing > 0 && process.env.FORCE !== '1') {
    console.log(`PostgreSQL already has ${existing} users — skip (FORCE=1 to override)`);
    return;
  }

  if (process.env.FORCE === '1' && existing > 0) {
    console.log('FORCE=1: truncating app tables…');
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "TicketCheckIn",
        "BookingWaitlist",
        "BookingParticipant",
        "Booking",
        "Application",
        "Account",
        "Session",
        "PendingUser",
        "VerificationToken",
        "News",
        "PageContent",
        "Project",
        "Club",
        "Space",
        "User",
        "SiteSettings"
      RESTART IDENTITY CASCADE
    `);
  }

  console.log('Migrating from', sqlitePath, '→', pgUrl.replace(/:[^:@/]+@/, ':***@'));

  await insertMany('SiteSettings', readAll('SiteSettings'), (data) =>
    prisma.siteSettings.create({ data })
  );
  await insertMany('User', readAll('User'), (data) => prisma.user.create({ data }));
  await insertMany('PendingUser', readAll('PendingUser'), (data) =>
    prisma.pendingUser.create({ data })
  );
  await insertMany('VerificationToken', readAll('VerificationToken'), (data) =>
    prisma.verificationToken.create({ data })
  );
  await insertMany('Account', readAll('Account'), (data) => prisma.account.create({ data }));
  await insertMany('Session', readAll('Session'), (data) => prisma.session.create({ data }));
  await insertMany('Project', readAll('Project'), (data) => prisma.project.create({ data }));
  await insertMany('Club', readAll('Club'), (data) => prisma.club.create({ data }));
  await insertMany('Space', readAll('Space'), (data) => prisma.space.create({ data }));
  await insertMany('Application', readAll('Application'), (data) =>
    prisma.application.create({ data })
  );
  await insertMany('Booking', readAll('Booking'), (data) => prisma.booking.create({ data }));
  await insertMany('BookingParticipant', readAll('BookingParticipant'), (data) =>
    prisma.bookingParticipant.create({ data })
  );
  await insertMany('BookingWaitlist', readAll('BookingWaitlist'), (data) =>
    prisma.bookingWaitlist.create({ data })
  );
  await insertMany('TicketCheckIn', readAll('TicketCheckIn'), (data) =>
    prisma.ticketCheckIn.create({ data })
  );
  await insertMany('PageContent', readAll('PageContent'), (data) =>
    prisma.pageContent.create({ data })
  );
  await insertMany('News', readAll('News'), (data) => prisma.news.create({ data }));

  const summary = {
    users: await prisma.user.count(),
    spaces: await prisma.space.count(),
    projects: await prisma.project.count(),
    bookings: await prisma.booking.count(),
    news: await prisma.news.count(),
    pages: await prisma.pageContent.count(),
  };
  console.log('Done:', summary);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    sqlite.close();
    await prisma.$disconnect();
  });
