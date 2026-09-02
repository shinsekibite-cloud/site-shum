/**
 * HTTP latency bench for YoungPortal.
 *   node scripts/perf-bench.mjs [baseUrl] [label]
 * Writes docs/perf/bench-<label>.txt
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = (process.argv[2] || process.env.BASE_URL || 'https://young.idivles.ru').replace(/\/$/, '');
const LABEL = process.argv[3] || 'run';
const PATHS = ['/', '/api/health', '/projects', '/news', '/privacy', '/rules', '/api/public/status'];

async function sample(path) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}${path}`, { redirect: 'follow' });
  const buf = await r.arrayBuffer();
  const total = (Date.now() - t0) / 1000;
  return { path, code: r.status, total, bytes: buf.byteLength };
}

async function main() {
  const lines = [`# Perf ${LABEL} ${new Date().toISOString()} base=${BASE}`];
  for (const p of PATHS) {
    const samples = [];
    for (let i = 0; i < 3; i++) samples.push(await sample(p));
    const avg = samples.reduce((s, x) => s + x.total, 0) / samples.length;
    const best = Math.min(...samples.map((x) => x.total));
    const code = samples[samples.length - 1].code;
    const bytes = samples[samples.length - 1].bytes;
    lines.push(
      `${code} avg=${avg.toFixed(3)}s best=${best.toFixed(3)}s size=${bytes} ${p}`
    );
  }
  const outDir = join(__dirname, '..', 'docs', 'perf');
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `bench-${LABEL}.txt`);
  writeFileSync(file, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  console.log('wrote', file);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
