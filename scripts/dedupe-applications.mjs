/**
 * Collapse duplicate Application rows before unique(userId, clubId/projectId).
 * Keep best status: APPROVED > PENDING > REJECTED, then newest.
 *
 *   docker-compose exec -T web node /app/scripts/dedupe-applications.mjs
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

const rank = { APPROVED: 3, PENDING: 2, REJECTED: 1 };

async function dedupe(kind) {
  const rows =
    kind === 'club'
      ? await prisma.$queryRaw`
          SELECT "userId", "clubId" AS target, array_agg(id) AS ids
          FROM "Application"
          WHERE "clubId" IS NOT NULL
          GROUP BY "userId", "clubId"
          HAVING count(*) > 1
        `
      : await prisma.$queryRaw`
          SELECT "userId", "projectId" AS target, array_agg(id) AS ids
          FROM "Application"
          WHERE "projectId" IS NOT NULL
          GROUP BY "userId", "projectId"
          HAVING count(*) > 1
        `;

  let removed = 0;
  for (const row of rows) {
    const apps = await prisma.application.findMany({
      where: { id: { in: row.ids } },
      select: { id: true, status: true, createdAt: true },
    });
    apps.sort((a, b) => {
      const rd = (rank[b.status] || 0) - (rank[a.status] || 0);
      if (rd !== 0) return rd;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    const drop = apps.slice(1).map((a) => a.id);
    if (drop.length) {
      await prisma.application.deleteMany({ where: { id: { in: drop } } });
      removed += drop.length;
      console.log(`${kind} dedupe keep`, apps[0].id, 'drop', drop.length);
    }
  }
  return removed;
}

const clubRemoved = await dedupe('club');
const projectRemoved = await dedupe('project');
console.log('dedupe done, removed', clubRemoved + projectRemoved);
await prisma.$disconnect();
