#!/usr/bin/env node
/**
 * Move sensitive archives / VAPID keys out of public/uploads into data/private,
 * and rewrite DB storagePath for ProjectBackup / LeaDataExport.
 *
 * Safe to re-run. Intended for deploy-vps.sh post-start.
 */
import { mkdirSync, renameSync, existsSync, readdirSync, copyFileSync, unlinkSync } from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const root = process.cwd();
const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://sochi:sochi@127.0.0.1:5432/sochi_portal?schema=public';
const uploads = process.env.UPLOAD_DIR?.trim()
  ? path.resolve(process.env.UPLOAD_DIR.trim())
  : path.join(root, 'public', 'uploads');
const privateRoot = process.env.PRIVATE_DIR?.trim()
  ? path.resolve(process.env.PRIVATE_DIR.trim())
  : path.join(root, 'data', 'private');

function moveTree(srcDir, destDir) {
  if (!existsSync(srcDir)) return { moved: 0 };
  mkdirSync(destDir, { recursive: true });
  let moved = 0;
  for (const name of readdirSync(srcDir)) {
    const from = path.join(srcDir, name);
    const to = path.join(destDir, name);
    if (existsSync(to)) {
      // keep dest, drop public copy
      try {
        unlinkSync(from);
      } catch {
        /* ignore */
      }
      continue;
    }
    try {
      renameSync(from, to);
      moved += 1;
    } catch {
      try {
        copyFileSync(from, to);
        unlinkSync(from);
        moved += 1;
      } catch (e) {
        console.warn('skip', from, e.message);
      }
    }
  }
  return { moved };
}

async function main() {
  mkdirSync(path.join(privateRoot, 'backups'), { recursive: true });
  mkdirSync(path.join(privateRoot, 'lea'), { recursive: true });

  const b = moveTree(path.join(uploads, 'backups'), path.join(privateRoot, 'backups'));
  const l = moveTree(path.join(uploads, 'lea'), path.join(privateRoot, 'lea'));
  console.log(`moved backups=${b.moved} lea=${l.moved}`);

  const legacyVapid = path.join(uploads, '.vapid-keys.json');
  const destVapid = path.join(root, 'data', '.vapid-keys.json');
  if (existsSync(legacyVapid)) {
    mkdirSync(path.dirname(destVapid), { recursive: true });
    if (!existsSync(destVapid)) {
      try {
        renameSync(legacyVapid, destVapid);
        console.log('migrated VAPID keys → data/.vapid-keys.json');
      } catch {
        copyFileSync(legacyVapid, destVapid);
        unlinkSync(legacyVapid);
        console.log('copied VAPID keys → data/.vapid-keys.json');
      }
    } else {
      try {
        unlinkSync(legacyVapid);
      } catch {
        /* ignore */
      }
      console.log('removed legacy public VAPID file (data/ already has keys)');
    }
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    const backups = await prisma.projectBackup.findMany({
      where: { storagePath: { startsWith: '/uploads/backups/' } },
      select: { id: true, storagePath: true },
    });
    for (const row of backups) {
      const name = path.basename(row.storagePath);
      await prisma.projectBackup.update({
        where: { id: row.id },
        data: { storagePath: `private/backups/${name}` },
      });
    }
    const leas = await prisma.leaDataExport.findMany({
      where: { storagePath: { startsWith: '/uploads/lea/' } },
      select: { id: true, storagePath: true },
    });
    for (const row of leas) {
      const name = path.basename(row.storagePath);
      await prisma.leaDataExport.update({
        where: { id: row.id },
        data: { storagePath: `private/lea/${name}` },
      });
    }
    console.log(`db paths updated: backups=${backups.length} lea=${leas.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
