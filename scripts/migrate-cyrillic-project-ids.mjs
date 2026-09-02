/**
 * Rename Project rows with non-ASCII ids → latin crm_proj_* ids.
 * Moves Application.projectId, merges if latin id already exists.
 *
 *   node scripts/migrate-cyrillic-project-ids.mjs
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hasNonAsciiId, latinProjectIdFromAny } from './lib/slug-latin.mjs';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function moveApplications(fromId, toId) {
  const apps = await prisma.application.findMany({ where: { projectId: fromId } });
  for (const app of apps) {
    const clash = await prisma.application.findFirst({
      where: { userId: app.userId, projectId: toId },
    });
    if (clash) {
      await prisma.application.delete({ where: { id: app.id } });
      console.log('  drop duplicate app', app.id, '→ keep', clash.id);
    } else {
      await prisma.application.update({
        where: { id: app.id },
        data: { projectId: toId },
      });
      console.log('  move app', app.id, fromId, '→', toId);
    }
  }
}

async function renameOrMerge(oldId, newId) {
  if (oldId === newId) return;
  const old = await prisma.project.findUnique({ where: { id: oldId } });
  if (!old) return;

  const existing = await prisma.project.findUnique({ where: { id: newId } });
  if (existing) {
    console.log('merge', oldId, '→', newId, `(${old.title})`);
    await moveApplications(oldId, newId);
    // Prefer keeping a real cover on the latin row if it still has stock KVN
    if (
      (!existing.image || existing.image.includes('project-kvn')) &&
      old.image &&
      !old.image.includes('project-kvn')
    ) {
      await prisma.project.update({ where: { id: newId }, data: { image: old.image } });
    }
    await prisma.project.delete({ where: { id: oldId } });
    return;
  }

  console.log('rename', oldId, '→', newId, `(${old.title})`);
  const { id: _id, createdAt, updatedAt, ...rest } = old;
  await prisma.project.create({
    data: {
      ...rest,
      id: newId,
      createdAt,
      updatedAt,
    },
  });
  await moveApplications(oldId, newId);
  await prisma.project.delete({ where: { id: oldId } });
}

async function main() {
  const projects = await prisma.project.findMany({ orderBy: { createdAt: 'asc' } });
  let n = 0;
  for (const p of projects) {
    if (!hasNonAsciiId(p.id)) continue;
    const newId = latinProjectIdFromAny(p.id.startsWith('crm_proj_') ? p.id : p.title);
    await renameOrMerge(p.id, newId);
    n++;
  }
  console.log(`Done. Migrated ${n} project(s) with non-ASCII ids.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
