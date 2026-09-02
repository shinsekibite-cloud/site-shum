#!/usr/bin/env node
/**
 * Lightweight concurrent activity simulation (≈100 actors) against public + auth surfaces.
 * Does NOT create spam content by default — read-heavy + gated write probes.
 *
 * Usage:
 *   node scripts/qa-load-sim.mjs [baseUrl]
 *   ACTORS=100 WRITE_PROBES=0 node scripts/qa-load-sim.mjs
 *
 * Writes docs/perf/qa-load-sim-latest.json
 */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BASE = (process.env.BASE_URL || process.argv[2] || 'https://young.idivles.ru').replace(/\/$/, '');
const ACTORS = Math.min(200, Math.max(10, Number(process.env.ACTORS || 100)));
const CONCURRENCY = Math.min(40, Math.max(5, Number(process.env.CONCURRENCY || 25)));
const WRITE_PROBES = process.env.WRITE_PROBES === '1';

const BROWSE = ['/', '/events', '/clubs', '/projects', '/news', '/games', '/search?q=сочи', '/places', '/spaces'];
const FORBIDDEN_POST = [
  { path: '/api/bookings/x/join', body: {} },
  { path: '/api/messages', body: { body: 'qa-load-probe' } },
  { path: '/api/friends', body: { userId: 'x', action: 'request' } },
];

const stats = {
  base: BASE,
  actors: ACTORS,
  startedAt: new Date().toISOString(),
  requests: 0,
  ok: 0,
  fail: 0,
  status: {},
  slow: [],
  errors: [],
  roles: {
    browsers: 0,
    registrants: 0,
    writers: 0,
    violators: 0,
    staffProbes: 0,
  },
};

async function one(path, opts = {}) {
  const started = Date.now();
  stats.requests += 1;
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...opts,
      redirect: 'manual',
      headers: {
        'user-agent': 'YoungPortal-QA-LoadSim/1.0',
        ...(opts.headers || {}),
      },
    });
    const ms = Date.now() - started;
    const key = String(res.status);
    stats.status[key] = (stats.status[key] || 0) + 1;
    if (res.status >= 200 && res.status < 500) stats.ok += 1;
    else {
      stats.fail += 1;
      stats.errors.push({ path, status: res.status, ms });
    }
    if (ms > 2500) stats.slow.push({ path, status: res.status, ms });
    return res.status;
  } catch (e) {
    stats.fail += 1;
    stats.errors.push({ path, error: e.message, ms: Date.now() - started });
    return 0;
  }
}

async function pool(items, limit, worker) {
  let i = 0;
  const runners = Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

function planActors(n) {
  const plan = [];
  const browsers = Math.round(n * 0.7);
  const registrants = Math.round(n * 0.1);
  const writers = Math.round(n * 0.08);
  const violators = Math.round(n * 0.05);
  const staff = Math.max(0, n - browsers - registrants - writers - violators);
  for (let i = 0; i < browsers; i++) plan.push({ role: 'browser' });
  for (let i = 0; i < registrants; i++) plan.push({ role: 'registrant' });
  for (let i = 0; i < writers; i++) plan.push({ role: 'writer' });
  for (let i = 0; i < violators; i++) plan.push({ role: 'violator' });
  for (let i = 0; i < staff; i++) plan.push({ role: 'staffProbe' });
  return plan;
}

async function runActor(actor, idx) {
  if (actor.role === 'browser') {
    stats.roles.browsers += 1;
    const path = BROWSE[idx % BROWSE.length];
    await one(path);
    if (idx % 7 === 0) await one('/api/health');
    return;
  }
  if (actor.role === 'registrant') {
    stats.roles.registrants += 1;
    await one('/register');
    await one('/login');
    // Soft probe only — do not create accounts unless WRITE_PROBES=1
    if (WRITE_PROBES) {
      await one('/api/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: `qa-load-${Date.now()}-${idx}@example.invalid`,
          password: 'Short1',
          name: 'QA',
        }),
      });
    }
    return;
  }
  if (actor.role === 'writer') {
    stats.roles.writers += 1;
    await one('/events');
    await one('/api/games/leaderboard?game=snake&limit=3');
    return;
  }
  if (actor.role === 'violator') {
    stats.roles.violators += 1;
    // Burst same endpoint — expect rate limits / auth walls, not 500
    await Promise.all([
      one('/api/views', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'GAME', id: 'snake', deviceId: 'a'.repeat(32) }),
      }),
      one('/api/views', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'GAME', id: 'snake', deviceId: 'a'.repeat(32) }),
      }),
      one('/api/views', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'GAME', id: 'snake', deviceId: 'a'.repeat(32) }),
      }),
    ]);
    return;
  }
  stats.roles.staffProbes += 1;
  await one('/admin');
  await one('/api/admin/activity');
  await one('/api/ops/topology');
  if (WRITE_PROBES) {
    for (const p of FORBIDDEN_POST) {
      await one(p.path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(p.body),
      });
    }
  }
}

async function main() {
  console.log(`Load sim ${ACTORS} actors → ${BASE} (concurrency ${CONCURRENCY})`);
  const plan = planActors(ACTORS);
  const t0 = Date.now();
  await pool(plan, CONCURRENCY, runActor);
  stats.finishedAt = new Date().toISOString();
  stats.elapsedMs = Date.now() - t0;
  stats.rps = Number((stats.requests / (stats.elapsedMs / 1000)).toFixed(2));

  const outDir = join(ROOT, 'docs/perf');
  mkdirSync(outDir, { recursive: true });
  const latest = join(outDir, 'qa-load-sim-latest.json');
  writeFileSync(latest, JSON.stringify(stats, null, 2));
  console.log(JSON.stringify(stats.summary || stats, null, 2));
  console.log(`Wrote ${latest}`);
  // Fail if too many hard errors
  const hard = stats.errors.filter((e) => e.status === 500 || e.status === 0).length;
  process.exit(hard > Math.ceil(ACTORS * 0.05) ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
