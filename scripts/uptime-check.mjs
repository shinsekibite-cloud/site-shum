#!/usr/bin/env node
/**
 * External-friendly uptime probe. Exit 0 = OK, 2 = down.
 * Usage:
 *   node scripts/uptime-check.mjs
 *   BASE_URL=https://young.idivles.ru node scripts/uptime-check.mjs
 * Cron (every 2 min) + Healthchecks.io ping — use install-uptime-cron.sh
 * or: every-2-min HEALTHCHECKS_PING_URL=https://hc-ping.com/UUID node .../uptime-check.mjs
 */
const BASE = String(process.env.BASE_URL || 'https://young.idivles.ru').replace(/\/$/, '');
const PING = (process.env.HEALTHCHECKS_PING_URL || '').trim();
const paths = (process.env.UPTIME_PATHS || '/api/health,/').split(',').map((s) => s.trim()).filter(Boolean);

async function pingHc(suffix = '') {
  if (!PING) return;
  try {
    await fetch(`${PING}${suffix}`, { method: 'GET', signal: AbortSignal.timeout(8000) });
  } catch {
    /* ignore */
  }
}

async function check(path) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      redirect: 'manual',
      headers: { 'user-agent': 'YoungPortal-Uptime/1.0' },
      signal: AbortSignal.timeout(12000),
    });
    const ms = Date.now() - t0;
    const ok = res.status > 0 && res.status < 500;
    return { path, status: res.status, ms, ok };
  } catch (e) {
    return { path, status: 0, ms: Date.now() - t0, ok: false, error: e.message || String(e) };
  }
}

const results = [];
for (const p of paths) results.push(await check(p.startsWith('/') ? p : `/${p}`));
const failed = results.filter((r) => !r.ok);
const line = results.map((r) => `${r.path}:${r.status}/${r.ms}ms`).join(' ');
console.log(`${new Date().toISOString()} ${failed.length ? 'DOWN' : 'OK'} ${line}`);

if (failed.length) {
  await pingHc('/fail');
  process.exit(2);
}
await pingHc('');
process.exit(0);
