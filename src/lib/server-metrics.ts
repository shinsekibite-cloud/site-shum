import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { getSharedRedis } from '@/lib/rateLimit';
import { MODULE_FLAG_KEYS, MODULE_FLAG_META, getModuleFlagsBundle } from '@/lib/module-flags';

const execFileAsync = promisify(execFile);

export type DiskSample = {
  target: string;
  exists: boolean;
  totalBytes: number | null;
  usedBytes: number | null;
  availableBytes: number | null;
  usedPercent: number | null;
  mount: string | null;
  filesystem: string | null;
};

export type ServiceCheck = {
  id: string;
  label: string;
  ok: boolean;
  latencyMs: number | null;
  detail?: string | null;
};

function bytes(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

async function dfPath(target: string): Promise<DiskSample> {
  const exists = fs.existsSync(target);
  if (!exists) {
    return {
      target,
      exists: false,
      totalBytes: null,
      usedBytes: null,
      availableBytes: null,
      usedPercent: null,
      mount: null,
      filesystem: null,
    };
  }
  try {
    const { stdout } = await execFileAsync('df', ['-kP', target], { timeout: 4000 });
    const lines = String(stdout).trim().split('\n');
    const row = lines[lines.length - 1];
    // Filesystem 1024-blocks Used Available Capacity Mounted on
    const parts = row.split(/\s+/);
    if (parts.length < 6) throw new Error('df parse');
    const totalKb = Number(parts[1]);
    const usedKb = Number(parts[2]);
    const availKb = Number(parts[3]);
    const cap = String(parts[4] || '').replace('%', '');
    return {
      target,
      exists: true,
      totalBytes: bytes(totalKb * 1024),
      usedBytes: bytes(usedKb * 1024),
      availableBytes: bytes(availKb * 1024),
      usedPercent: Number.isFinite(Number(cap)) ? Number(cap) : null,
      filesystem: parts[0] || null,
      mount: parts.slice(5).join(' ') || null,
    };
  } catch {
    return {
      target,
      exists: true,
      totalBytes: null,
      usedBytes: null,
      availableBytes: null,
      usedPercent: null,
      mount: null,
      filesystem: null,
    };
  }
}

async function dirSizeBytes(dir: string): Promise<number | null> {
  if (!fs.existsSync(dir)) return null;
  try {
    const { stdout } = await execFileAsync('du', ['-sk', dir], { timeout: 8000 });
    const kb = Number(String(stdout).trim().split(/\s+/)[0]);
    if (!Number.isFinite(kb)) return null;
    return bytes(kb * 1024);
  } catch {
    return null;
  }
}

function readLoadavg(): number[] {
  try {
    return os.loadavg().map((n) => Math.round(n * 100) / 100);
  } catch {
    return [0, 0, 0];
  }
}

function memInfo() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const proc = process.memoryUsage();
  return {
    host: {
      totalBytes: bytes(total),
      freeBytes: bytes(free),
      usedBytes: bytes(used),
      usedPercent: total > 0 ? Math.round((used / total) * 1000) / 10 : null,
    },
    process: {
      rssBytes: bytes(proc.rss),
      heapTotalBytes: bytes(proc.heapTotal),
      heapUsedBytes: bytes(proc.heapUsed),
      externalBytes: bytes(proc.external),
      arrayBuffersBytes: bytes(proc.arrayBuffers),
    },
  };
}

async function checkDb(): Promise<ServiceCheck & { sizeBytes?: number | null }> {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    let sizeBytes: number | null = null;
    try {
      const rows = await prisma.$queryRaw<Array<{ size: bigint | number }>>`
        SELECT pg_database_size(current_database()) AS size
      `;
      sizeBytes = bytes(Number(rows?.[0]?.size ?? 0));
    } catch {
      sizeBytes = null;
    }
    return {
      id: 'db',
      label: 'PostgreSQL',
      ok: true,
      latencyMs: Date.now() - started,
      detail: sizeBytes != null ? `size=${sizeBytes}` : null,
      sizeBytes,
    };
  } catch (e) {
    return {
      id: 'db',
      label: 'PostgreSQL',
      ok: false,
      latencyMs: Date.now() - started,
      detail: e instanceof Error ? e.message.slice(0, 160) : 'unavailable',
      sizeBytes: null,
    };
  }
}

async function checkRedis(): Promise<ServiceCheck & { usedMemoryBytes?: number | null; maxMemoryBytes?: number | null }> {
  const started = Date.now();
  const redis = getSharedRedis();
  if (!redis) {
    return {
      id: 'redis',
      label: 'Redis',
      ok: false,
      latencyMs: null,
      detail: 'REDIS_URL не задан',
      usedMemoryBytes: null,
      maxMemoryBytes: null,
    };
  }
  try {
    const pong = await redis.ping();
    let usedMemoryBytes: number | null = null;
    let maxMemoryBytes: number | null = null;
    try {
      const info = await redis.info('memory');
      const used = /used_memory:(\d+)/.exec(info)?.[1];
      const max = /maxmemory:(\d+)/.exec(info)?.[1];
      usedMemoryBytes = used ? bytes(Number(used)) : null;
      maxMemoryBytes = max ? bytes(Number(max)) : null;
    } catch {
      /* ignore */
    }
    return {
      id: 'redis',
      label: 'Redis',
      ok: String(pong).toUpperCase() === 'PONG',
      latencyMs: Date.now() - started,
      detail: usedMemoryBytes != null ? `used=${usedMemoryBytes}` : null,
      usedMemoryBytes,
      maxMemoryBytes,
    };
  } catch (e) {
    return {
      id: 'redis',
      label: 'Redis',
      ok: false,
      latencyMs: Date.now() - started,
      detail: e instanceof Error ? e.message.slice(0, 160) : 'unavailable',
      usedMemoryBytes: null,
      maxMemoryBytes: null,
    };
  }
}


function readTgBackupMeta(): {
  lastRequestAt: string | null;
  lastRequestFileMtime: string | null;
  pendingId: string | null;
} {
  const dir = path.join(process.cwd(), 'data', 'backup-requests');
  let lastRequestAt: string | null = null;
  let lastRequestFileMtime: string | null = null;
  let pendingId: string | null = null;
  try {
    const lastPath = path.join(dir, '.last');
    if (fs.existsSync(lastPath)) {
      const st = fs.statSync(lastPath);
      lastRequestFileMtime = st.mtime.toISOString();
      const raw = fs.readFileSync(lastPath, 'utf8').trim();
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) lastRequestAt = new Date(n).toISOString();
    }
  } catch {
    /* ignore */
  }
  try {
    const pendingPath = path.join(dir, '.pending');
    if (fs.existsSync(pendingPath)) {
      pendingId = fs.readFileSync(pendingPath, 'utf8').trim() || null;
    }
  } catch {
    /* ignore */
  }
  return { lastRequestAt, lastRequestFileMtime, pendingId };
}

export async function collectServerStatus() {
  const collectedAt = new Date().toISOString();
  const cwd = process.cwd();
  const uploadsDir = path.join(cwd, 'public', 'uploads');
  const dataDir = path.join(cwd, 'data');
  const coversPhotoDir = path.join(uploadsDir, 'covers', 'photo');

  const [db, redis, rootDisk, uploadsDisk, dataDisk, uploadsSize, dataSize, coversSize, settings, lastBackup, counts, moduleBundle] =
    await Promise.all([
      checkDb(),
      checkRedis(),
      dfPath('/'),
      dfPath(uploadsDir),
      dfPath(fs.existsSync(dataDir) ? dataDir : cwd),
      dirSizeBytes(uploadsDir),
      dirSizeBytes(dataDir),
      dirSizeBytes(coversPhotoDir),
      prisma.siteSettings
        .findUnique({
          where: { id: '1' },
          select: {
            siteName: true,
            maintenanceMode: true,
            maintenanceMessage: true,
            registrationEnabled: true,
            messagingEnabled: true,
          },
        })
        .catch(() => null),
      prisma.projectBackup
        .findFirst({
          orderBy: { createdAt: 'desc' },
          select: { id: true, label: true, byteSize: true, createdAt: true, schemaVersion: true },
        })
        .catch(() => null),
      Promise.all([
        prisma.user.count({ where: { deletedAt: null } }).catch(() => 0),
        prisma.project.count().catch(() => 0),
        prisma.club.count().catch(() => 0),
        prisma.space.count().catch(() => 0),
        prisma.news.count().catch(() => 0),
        prisma.booking.count({ where: { status: 'PENDING' } }).catch(() => 0),
        prisma.application.count({ where: { status: 'PENDING' } }).catch(() => 0),
        prisma.userNotification.count({ where: { readAt: null } }).catch(() => 0),
      ]),
      getModuleFlagsBundle().catch(() => ({ flags: null as any, offModes: {} })),
    ]);

  const [users, projects, clubs, spaces, news, pendingBookings, pendingApplications, unreadNotifications] = counts;
  const load = readLoadavg();
  const cpuCount = os.cpus()?.length || 1;
  const mem = memInfo();
  const tgBackup = readTgBackupMeta();

  const warnings: string[] = [];
  if (!db.ok) warnings.push('База данных недоступна');
  if (!redis.ok) warnings.push('Redis недоступен или не настроен');
  if ((rootDisk.usedPercent ?? 0) >= 90) warnings.push(`Корень диска заполнен на ${rootDisk.usedPercent}%`);
  else if ((rootDisk.usedPercent ?? 0) >= 80) warnings.push(`Корень диска заполнен на ${rootDisk.usedPercent}%`);
  if ((mem.host.usedPercent ?? 0) >= 90) warnings.push(`Память контейнера занята на ${mem.host.usedPercent}%`);
  if (load[0] > cpuCount * 1.5) warnings.push(`Высокая нагрузка: load ${load[0]} при ${cpuCount} CPU`);
  if (settings?.maintenanceMode) warnings.push('Включён режим обслуживания');
  if (!lastBackup) warnings.push('Нет сохранённых бэкапов в панели');
  else {
    const ageH = (Date.now() - new Date(lastBackup.createdAt).getTime()) / 3600000;
    if (ageH > 72) warnings.push('Последний бэкап старше 72 часов');
  }

  const overallOk = db.ok && redis.ok && (rootDisk.usedPercent == null || rootDisk.usedPercent < 95);

  return {
    collectedAt,
    overall: {
      ok: overallOk,
      status: !db.ok || !redis.ok ? 'critical' : warnings.length ? 'warn' : 'ok',
      warnings,
    },
    app: {
      siteName: settings?.siteName || null,
      maintenanceMode: Boolean(settings?.maintenanceMode),
      maintenanceMessage: settings?.maintenanceMessage || null,
      registrationOpen: settings?.registrationEnabled !== false,
      messagingEnabled: settings?.messagingEnabled !== false,
      nodeEnv: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      pid: process.pid,
      uptimeSec: Math.floor(process.uptime()),
      cwd,
      publicOrigin: process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || null,
    },
    host: {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpuCount,
      loadAvg: { '1m': load[0], '5m': load[1], '15m': load[2] },
      memory: mem.host,
    },
    process: {
      memory: mem.process,
      uptimeSec: Math.floor(process.uptime()),
    },
    disk: {
      root: rootDisk,
      uploads: uploadsDisk,
      data: dataDisk,
      uploadsDirBytes: uploadsSize,
      dataDirBytes: dataSize,
      coversPhotoDirBytes: coversSize,
    },
    services: {
      db: {
        ok: db.ok,
        latencyMs: db.latencyMs,
        sizeBytes: db.sizeBytes ?? null,
        detail: db.detail,
      },
      redis: {
        ok: redis.ok,
        latencyMs: redis.latencyMs,
        usedMemoryBytes: redis.usedMemoryBytes ?? null,
        maxMemoryBytes: redis.maxMemoryBytes ?? null,
        detail: redis.detail,
      },
    },
    catalog: {
      users,
      projects,
      clubs,
      spaces,
      news,
      pendingBookings,
      pendingApplications,
      unreadNotifications,
    },
    backup: lastBackup
      ? {
          id: lastBackup.id,
          label: lastBackup.label,
          byteSize: lastBackup.byteSize,
          schemaVersion: lastBackup.schemaVersion,
          createdAt: lastBackup.createdAt.toISOString(),
          ageHours: Math.round(((Date.now() - lastBackup.createdAt.getTime()) / 3600000) * 10) / 10,
        }
      : null,
    tgBackup,
    modules: (() => {
      const flags = moduleBundle.flags;
      if (!flags) return { offCount: 0, total: 0, items: [] as Array<{ key: string; label: string; enabled: boolean; offMode: string | null }> };
      const items = MODULE_FLAG_KEYS.filter((k) => k !== 'maintenance').map((key) => ({
        key,
        label: MODULE_FLAG_META[key]?.label || key,
        enabled: flags[key] !== false,
        offMode: (moduleBundle.offModes as any)?.[key] || null,
      }));
      return { offCount: items.filter((m) => !m.enabled).length, total: items.length, items };
    })(),
  };
}

export type ServerStatusPayload = Awaited<ReturnType<typeof collectServerStatus>>;
