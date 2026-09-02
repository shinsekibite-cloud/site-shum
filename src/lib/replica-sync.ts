import { spawn } from 'child_process';
import { access } from 'fs/promises';
import { constants } from 'fs';
import { prisma } from '@/lib/prisma';
import {
  parseReplicaJson,
  serializeReplicaJson,
  type ReplicaConfig,
} from '@/lib/replica-config';

async function loadCfg(): Promise<ReplicaConfig> {
  const settings = await prisma.siteSettings.findUnique({ where: { id: '1' } });
  return parseReplicaJson((settings as { replicaJson?: string | null } | null)?.replicaJson);
}

async function saveCfg(cfg: ReplicaConfig) {
  await prisma.siteSettings.upsert({
    where: { id: '1' },
    update: { replicaJson: serializeReplicaJson(cfg) } as Record<string, unknown>,
    create: { id: '1', replicaJson: serializeReplicaJson(cfg) } as Record<string, unknown>,
  });
}

async function findHaBinary(): Promise<string | null> {
  const candidates = [
    '/usr/local/sbin/yp-ha-sync',
    '/opt/sochi-portal/scripts/yp-ha-sync.sh',
    `${process.cwd()}/scripts/yp-ha-sync.sh`,
  ];
  for (const p of candidates) {
    try {
      await access(p, constants.X_OK);
      return p;
    } catch {
      try {
        await access(p, constants.R_OK);
        return p;
      } catch {
        /* next */
      }
    }
  }
  return null;
}

function runCmd(bin: string, args: string[], timeoutMs = 120_000): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(bin.endsWith('.sh') ? 'bash' : bin, bin.endsWith('.sh') ? [bin, ...args] : args, {
      env: process.env,
      cwd: process.cwd(),
    });
    let out = '';
    const t = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ code: 124, out: out + '\n[timeout]' });
    }, timeoutMs);
    child.stdout?.on('data', (d) => {
      out += String(d);
    });
    child.stderr?.on('data', (d) => {
      out += String(d);
    });
    child.on('close', (code) => {
      clearTimeout(t);
      resolve({ code: code ?? 1, out: out.slice(-4000) });
    });
  });
}

/**
 * Manual or automatic HA sync. Updates lastSync* in replicaJson.
 * Prefer host worker `/usr/local/sbin/yp-ha-sync`; otherwise records a dry status.
 */
export async function runReplicaSync(opts?: {
  mode?: 'manual' | 'auto';
  dryRun?: boolean;
}): Promise<{ ok: boolean; message: string; config: ReplicaConfig }> {
  const mode = opts?.mode || 'manual';
  let cfg = await loadCfg();

  if (!cfg.enabled) {
    return { ok: false, message: 'Репликация выключена в настройках', config: cfg };
  }
  if (cfg.role === 'standalone') {
    return { ok: false, message: 'Роль standalone — синк не нужен', config: cfg };
  }
  if (!cfg.peerHost) {
    return { ok: false, message: 'Не указан peer host', config: cfg };
  }
  if (mode === 'auto' && !cfg.autoSyncEnabled) {
    return { ok: false, message: 'Автосинхронизация выключена', config: cfg };
  }

  cfg = {
    ...cfg,
    lastSyncStatus: 'running',
    lastHeartbeatAt: new Date().toISOString(),
    lastSyncMessage: `${mode}: starting…`,
  };
  await saveCfg(cfg);

  const bin = await findHaBinary();
  if (!bin) {
    cfg = {
      ...cfg,
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: 'error',
      lastSyncMessage:
        'Worker yp-ha-sync не найден на этом хосте. Установите scripts/setup-replica-ha.sh на VPS, затем повторите.',
    };
    await saveCfg(cfg);
    return { ok: false, message: cfg.lastSyncMessage!, config: cfg };
  }

  const args = opts?.dryRun ? ['--dry-run'] : [];
  const result = await runCmd(bin, args);
  const ok = result.code === 0;
  cfg = {
    ...cfg,
    lastSyncAt: new Date().toISOString(),
    lastHeartbeatAt: new Date().toISOString(),
    lastSyncStatus: ok ? 'ok' : 'error',
    lastSyncMessage: (ok ? 'OK: ' : `exit ${result.code}: `) + result.out.trim().slice(0, 500),
  };
  await saveCfg(cfg);
  return { ok, message: cfg.lastSyncMessage || (ok ? 'ok' : 'error'), config: cfg };
}
