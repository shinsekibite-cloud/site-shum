/**
 * Unified QA runner: modules toggle + deep roles + optional UI matrix.
 * Usage:
 *   node scripts/qa-all.mjs [baseUrl]
 *   QA_SKIP_UI=1 node scripts/qa-all.mjs
 *   QA_REFRESH_PRESENTATION=1 node scripts/qa-all.mjs
 */
import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BASE = (process.argv[2] || process.env.BASE_URL || 'https://young.idivles.ru').replace(/\/$/, '');
const SKIP_UI = process.env.QA_SKIP_UI === '1';
const REFRESH = process.env.QA_REFRESH_PRESENTATION === '1';

const steps = [
  { name: 'modules-toggle', script: 'qa-modules-toggle.mjs', soft: false },
  { name: 'deep-roles-ux', script: 'qa-deep-roles-ux.mjs', soft: false },
  { name: 'full-roles', script: 'qa-full-roles.mjs', soft: true },
  { name: 'role-matrix', script: 'qa-role-matrix.mjs', soft: true },
  { name: 'ui-roles', script: 'qa-ui-roles.mjs', soft: true, skip: SKIP_UI },
];

function run(name, script, soft) {
  console.log(`\n══ ${name} ══`);
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', script), BASE], {
    env: { ...process.env, BASE_URL: BASE, QA_BASE: BASE },
    encoding: 'utf8',
    timeout: 300_000,
  });
  if (r.stdout) process.stdout.write(r.stdout.slice(-4000));
  if (r.stderr) process.stderr.write(r.stderr.slice(-2000));
  const ok = r.status === 0;
  if (!ok && soft) {
    console.log(`[soft] ${name} exit=${r.status}`);
    return { name, ok: true, soft: true, status: r.status };
  }
  return { name, ok, soft: false, status: r.status ?? 1 };
}

const results = [];
for (const s of steps) {
  if (s.skip) {
    results.push({ name: s.name, ok: true, skipped: true });
    continue;
  }
  results.push(run(s.name, s.script, s.soft));
}

if (REFRESH) {
  console.log('\n══ refresh-presentation ══');
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'refresh-presentation.mjs'), BASE], {
    env: process.env,
    encoding: 'utf8',
    timeout: 180_000,
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  results.push({ name: 'refresh-presentation', ok: r.status === 0, status: r.status ?? 1 });
}

const failed = results.filter((r) => !r.ok && !r.skipped);
const outDir = join(ROOT, 'docs', 'perf');
mkdirSync(outDir, { recursive: true });
const report = {
  base: BASE,
  at: new Date().toISOString(),
  passed: results.filter((r) => r.ok).length,
  failed: failed.length,
  results,
};
const file = join(outDir, `qa-all-${Date.now()}.json`);
writeFileSync(file, JSON.stringify(report, null, 2));
console.log(`\n==== qa-all passed=${report.passed} failed=${report.failed} → ${file}`);
process.exit(failed.length ? 1 : 0);
