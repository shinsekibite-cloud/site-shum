/**
 * Purge test/demo/junk bookings so public Афиша stays clean.
 * Keeps only APPROVED future bookings that do not look like tests.
 *
 *   node scripts/purge-test-bookings.mjs
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const JUNK_TITLE =
  /(тест|test|qa\b|e2e|auto verify|within hours|шумко|хуй|бронь mse|participant mse|согласование ронь)/i;

async function main() {
  const all = await prisma.booking.findMany({
    select: {
      id: true,
      title: true,
      status: true,
      isDemoData: true,
      startTime: true,
      endTime: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const toDelete = all.filter((b) => {
    if (b.isDemoData) return true;
    if (b.id.startsWith('qa_') || b.id.startsWith('seed_')) return true;
    if (JUNK_TITLE.test(b.title || '')) return true;
    // Do not mass-delete every REJECTED row — only junk titles / demo above
    return false;
  });

  const keep = all.filter((b) => !toDelete.some((d) => d.id === b.id));

  console.log(`Bookings total=${all.length}, delete=${toDelete.length}, keep=${keep.length}`);
  for (const b of toDelete.slice(0, 30)) {
    console.log('  DEL', b.status, b.title);
  }
  for (const b of keep) {
    console.log('  KEEP', b.status, b.title, b.startTime.toISOString());
  }

  if (toDelete.length) {
    const ids = toDelete.map((b) => b.id);
    // Cascades remove participants / waitlist / check-ins
    const res = await prisma.booking.deleteMany({ where: { id: { in: ids } } });
    console.log(`Deleted ${res.count} bookings`);
  } else {
    console.log('Nothing to delete');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
