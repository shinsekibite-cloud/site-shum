#!/usr/bin/env node
/**
 * Configurable HTTP load test with ramp levels and a clear report.
 *
 * Usage:
 *   node scripts/load-test.mjs
 *   BASE_URL=https://young.idivles.ru LEVEL=3 node scripts/load-test.mjs
 *   node scripts/load-test.mjs --url https://young.idivles.ru --level 4 --duration 20
 *
 * Levels (override with --concurrency / --rps):
 *   1 = smoke   ~5 concurrent,  ~2 rps
 *   2 = light   ~15 concurrent, ~8 rps
 *   3 = medium  ~40 concurrent, ~25 rps
 *   4 = heavy   ~80 concurrent, ~50 rps
 *   5 = stress  ~120 concurrent,~80 rps
 *
 * Env: BASE_URL, LEVEL, DURATION_SEC, CONCURRENCY, RPS, PATHS (comma), OUT_JSON
 */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const LEVELS = {
  1: { name: 'smoke', concurrency: 5, rps: 2 },
  2: { name: 'light', concurrency: 15, rps: 8 },
  3: { name: 'medium', concurrency: 40, rps: 25 },
  4: { name: 'heavy', concurrency: 80, rps: 50 },
  5: { name: 'stress', concurrency: 120, rps: 80 },
};

const BASE = String(arg('--url', process.env.BASE_URL || 'https://young.idivles.ru')).replace(/\/$/, '');
const LEVEL = Math.min(5, Math.max(1, Number(arg('--level', process.env.LEVEL || 2))));
const preset = LEVELS[LEVEL];
const CONCURRENCY = Math.min(
  200,
  Math.max(1, Number(arg('--concurrency', process.env.CONCURRENCY || preset.concurrency)))
);
const RPS = Math.min(500, Math.max(1, Number(arg('--rps', process.env.RPS || preset.rps))));
const DURATION_SEC = Math.min(
  600,
  Math.max(5, Number(arg('--duration', process.env.DURATION_SEC || 15)))
);
const PATHS = String(
  arg(
    '--paths',
    process.env.PATHS ||
      '/,/api/health,/api/public/status,/events,/projects,/clubs,/news,/places,/login,/faq'
  )
)
  .split(',')
  .map((p) => (p.trim().startsWith('/') ? p.trim() : `/${p.trim()}`))
  .filter(Boolean);

const OUT_JSON =
  process.env.OUT_JSON ||
  join(ROOT, 'docs/perf', `load-test-L${LEVEL}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);

const latencies = [];
const byStatus = Object.create(null);
const byPath = Object.create(null);
const errors = [];
let started = 0;
let finished = 0;
let inFlight = 0;
let pathIdx = 0;
let stopAt = 0;

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[i];
}

async function hit(path) {
  const t0 = Date.now();
  started += 1;
  inFlight += 1;
  try {
    const res = await fetch(`${BASE}${path}`, {
      redirect: 'manual',
      headers: { 'user-agent': `YoungPortal-LoadTest/1.0 L${LEVEL}` },
      signal: AbortSignal.timeout(20000),
    });
    const ms = Date.now() - t0;
    latencies.push(ms);
    byStatus[res.status] = (byStatus[res.status] || 0) + 1;
    if (!byPath[path]) byPath[path] = { n: 0, ok: 0, fail: 0, msSum: 0 };
    byPath[path].n += 1;
    byPath[path].msSum += ms;
    if (res.status >= 200 && res.status < 500) byPath[path].ok += 1;
    else {
      byPath[path].fail += 1;
      if (errors.length < 40) errors.push({ path, status: res.status, ms });
    }
  } catch (e) {
    const ms = Date.now() - t0;
    latencies.push(ms);
    byStatus[0] = (byStatus[0] || 0) + 1;
    if (!byPath[path]) byPath[path] = { n: 0, ok: 0, fail: 0, msSum: 0 };
    byPath[path].n += 1;
    byPath[path].fail += 1;
    byPath[path].msSum += ms;
    if (errors.length < 40) errors.push({ path, error: e.message || String(e), ms });
  } finally {
    inFlight -= 1;
    finished += 1;
  }
}

function nextPath() {
  const p = PATHS[pathIdx % PATHS.length];
  pathIdx += 1;
  return p;
}

async function worker(intervalMs) {
  while (Date.now() < stopAt) {
    if (inFlight >= CONCURRENCY) {
      await new Promise((r) => setTimeout(r, 5));
      continue;
    }
    void hit(nextPath());
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

function printReport(report) {
  const line = (s = '') => console.log(s);
  line('');
  line('══════════════════════════════════════════════════');
  line(` LOAD TEST  ${report.base}`);
  line(` level=${report.level} (${report.levelName})  concurrency=${report.concurrency}  rps≈${report.targetRps}`);
  line(` duration=${report.durationSec}s  paths=${report.paths.length}`);
  line('──────────────────────────────────────────────────');
  line(` requests: ${report.requests}   ok≈2xx-4xx: ${report.ok}   hard-fail: ${report.hardFail}`);
  line(` RPS actual: ${report.actualRps}`);
  line(
    ` latency ms: p50=${report.latency.p50}  p95=${report.latency.p95}  p99=${report.latency.p99}  max=${report.latency.max}  avg=${report.latency.avg}`
  );
  line(' status codes:');
  for (const [code, n] of Object.entries(report.status).sort((a, b) => Number(b[0]) - Number(a[0]) || Number(a[0]) - Number(b[0]))) {
    line(`   ${code}: ${n}`);
  }
  line(' by path (avg ms):');
  for (const [path, s] of Object.entries(report.byPath)) {
    const avg = s.n ? Math.round(s.msSum / s.n) : 0;
    line(`   ${path.padEnd(28)} n=${s.n} ok=${s.ok} fail=${s.fail} avg=${avg}ms`);
  }
  if (report.errors.length) {
    line(' sample errors:');
    for (const e of report.errors.slice(0, 8)) {
      line(`   ${JSON.stringify(e)}`);
    }
  }
  line('──────────────────────────────────────────────────');
  line(' Raise load:  LEVEL=4 node scripts/load-test.mjs');
  line('              node scripts/load-test.mjs --level 5 --duration 30');
  line(` Report JSON: ${report.outJson}`);
  line('══════════════════════════════════════════════════');
  line('');
}

async function main() {
  const intervalMs = Math.max(5, Math.floor(1000 / RPS));
  const workers = Math.min(CONCURRENCY, Math.max(1, Math.ceil(RPS / 2)));
  console.log(
    `load-test start base=${BASE} level=${LEVEL}/${preset.name} concurrency=${CONCURRENCY} targetRps=${RPS} duration=${DURATION_SEC}s workers=${workers}`
  );
  stopAt = Date.now() + DURATION_SEC * 1000;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: workers }, () => worker(intervalMs)));
  // drain in-flight
  while (inFlight > 0) await new Promise((r) => setTimeout(r, 50));
  const elapsedSec = Math.max(0.001, (Date.now() - t0) / 1000);
  const sorted = [...latencies].sort((a, b) => a - b);
  const hardFail = (byStatus[0] || 0) + Object.entries(byStatus)
    .filter(([c]) => Number(c) >= 500)
    .reduce((s, [, n]) => s + n, 0);
  const ok = finished - hardFail;
  const report = {
    base: BASE,
    level: LEVEL,
    levelName: preset.name,
    concurrency: CONCURRENCY,
    targetRps: RPS,
    durationSec: DURATION_SEC,
    paths: PATHS,
    startedAt: new Date(t0).toISOString(),
    requests: finished,
    ok,
    hardFail,
    actualRps: Math.round((finished / elapsedSec) * 10) / 10,
    latency: {
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      max: sorted[sorted.length - 1] || 0,
      avg: sorted.length ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0,
    },
    status: byStatus,
    byPath,
    errors,
    outJson: OUT_JSON,
  };
  mkdirSync(dirname(OUT_JSON), { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  // also latest symlink-style copy
  writeFileSync(join(ROOT, 'docs/perf/load-test-latest.json'), JSON.stringify(report, null, 2));
  printReport(report);
  if (hardFail > finished * 0.05) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
