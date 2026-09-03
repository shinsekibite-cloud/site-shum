#!/usr/bin/env node
/**
 * Site-wide HTTP / link / timing audit for young.idivles.ru (reusable local base).
 *
 * Usage:
 *   node scripts/qa-site-audit.mjs [baseUrl]
 *   BASE_URL=https://young.idivles.ru node scripts/qa-site-audit.mjs
 *
 * Writes:
 *   docs/perf/qa-site-audit-<stamp>.json
 *   docs/perf/qa-site-audit-latest.json
 *
 * Exit code = number of failed HTTP checks (capped 125).
 */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BASE = (process.env.BASE_URL || process.argv[2] || 'https://young.idivles.ru').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.QA_TIMEOUT_MS || 20000);

/** Core public + auth + staff surfaces to always probe as guest */
const ROUTES = [
  // public
  '/',
  '/api/health',
  '/api/public/status',
  '/projects',
  '/clubs',
  '/spaces',
  '/places',
  '/events',
  '/news',
  '/documents',
  '/contacts',
  '/search',
  '/gallery',
  '/grants',
  '/dobro',
  '/self-gov',
  '/games',
  '/games/snake',
  '/games/tetris',
  '/games/checkers',
  '/games/breakout',
  '/games/memory',
  '/games/fifteen',
  '/presentation',
  '/vacancies',
  '/contests',
  '/privacy',
  '/rules',
  '/terms',
  '/p/about',
  // auth
  '/login',
  '/register',
  '/forgot-password',
  // gated (expect redirect/401 for guest)
  '/dashboard',
  '/messages',
  '/tickets',
  '/admin',
  '/admin/activity',
  '/admin/pii-access',
  '/ops',
  '/ops/topology',
  '/scanner',
];

/** Sensitive APIs as guest — expect 401/403/404, never 200 with data */
const GUEST_FORBIDDEN_APIS = [
  { path: '/api/admin/activity', expect: [401, 403, 404] },
  { path: '/api/admin/pii-access', expect: [401, 403, 404] },
  { path: '/api/ops/topology', expect: [401, 403, 404] },
  { path: '/api/ops/flags', expect: [401, 403, 404] },
  { path: '/api/user/eco', expect: [401, 403] },
  { path: '/api/games/leaderboard?game=snake&limit=5', expect: [401, 403] },
  { path: '/api/pii/reveal', method: 'POST', body: {}, expect: [401, 403, 400, 404] },
];

const results = {
  base: BASE,
  startedAt: new Date().toISOString(),
  routes: [],
  apis: [],
  links: { checked: 0, broken: [] },
  timings: { slow: [] },
  summary: {},
};

function okStatus(status, expectOk = true) {
  if (!expectOk) return status >= 200 && status < 500;
  return status >= 200 && status < 400;
}

async function fetchTimed(path, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...opts,
      redirect: 'manual',
      signal: ctrl.signal,
      headers: {
        'user-agent': 'YoungPortal-QA-SiteAudit/1.0',
        ...(opts.headers || {}),
      },
    });
    const ms = Date.now() - started;
    const text = await res.text().catch(() => '');
    return { status: res.status, ms, text, headers: res.headers, ok: res.ok };
  } catch (e) {
    return { status: 0, ms: Date.now() - started, text: '', error: e.message, ok: false };
  } finally {
    clearTimeout(t);
  }
}

function extractLinks(html, pagePath) {
  const out = [];
  const re = /href=["']([^"'#]+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    let href = m[1].trim();
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;
    if (href.startsWith('http')) {
      if (!href.startsWith(BASE)) continue;
      href = href.slice(BASE.length) || '/';
    }
    if (!href.startsWith('/')) continue;
    out.push({ from: pagePath, href: href.split('?')[0] });
  }
  return out;
}

async function main() {
  console.log(`QA site audit → ${BASE}`);

  for (const path of ROUTES) {
    const r = await fetchTimed(path);
    const gated = ['/dashboard', '/messages', '/tickets', '/admin', '/ops', '/scanner'].some((p) =>
      path.startsWith(p)
    );
    // Guest: gated pages often 307/302 to login — that is OK
    const pass =
      r.status === 0
        ? false
        : gated
          ? [200, 301, 302, 303, 307, 308, 401, 403, 404].includes(r.status)
          : okStatus(r.status);

    const row = {
      path,
      status: r.status,
      ms: r.ms,
      pass,
      error: r.error || null,
      location: r.headers?.get?.('location') || null,
    };
    results.routes.push(row);
    const mark = pass ? 'OK  ' : 'FAIL';
    console.log(`${mark} ${String(r.status).padStart(3)} ${String(r.ms).padStart(5)}ms  ${path}${row.location ? ` → ${row.location}` : ''}`);
    if (r.ms > 3000) results.timings.slow.push({ path, ms: r.ms });

    // Sample internal links from a few HTML pages
    if (pass && r.text && r.text.includes('<html') && ['/', '/events', '/clubs', '/games', '/contacts'].includes(path)) {
      const links = extractLinks(r.text, path);
      for (const link of links.slice(0, 40)) {
        results.links.checked += 1;
        const lr = await fetchTimed(link.href);
        if (!(lr.status >= 200 && lr.status < 400) && ![301, 302, 303, 307, 308].includes(lr.status)) {
          results.links.broken.push({ ...link, status: lr.status, ms: lr.ms });
          console.log(`  BROKEN LINK ${lr.status} ${link.href} (from ${link.from})`);
        }
      }
    }
  }

  for (const api of GUEST_FORBIDDEN_APIS) {
    const r = await fetchTimed(api.path, {
      method: api.method || 'GET',
      headers: api.method === 'POST' ? { 'content-type': 'application/json' } : undefined,
      body: api.method === 'POST' ? JSON.stringify(api.body || {}) : undefined,
    });
    const pass = api.expect.includes(r.status);
    results.apis.push({ path: api.path, status: r.status, expect: api.expect, pass, ms: r.ms });
    console.log(`${pass ? 'OK  ' : 'FAIL'} API guest ${api.path} → ${r.status} (expect ${api.expect.join('/')})`);
  }

  const failedRoutes = results.routes.filter((x) => !x.pass).length;
  const failedApis = results.apis.filter((x) => !x.pass).length;
  const broken = results.links.broken.length;
  results.finishedAt = new Date().toISOString();
  results.summary = {
    routes: results.routes.length,
    failedRoutes,
    failedApis,
    brokenLinks: broken,
    slowOver3s: results.timings.slow.length,
    failTotal: failedRoutes + failedApis + broken,
  };

  const outDir = join(ROOT, 'docs/perf');
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const latest = join(outDir, 'qa-site-audit-latest.json');
  const stamped = join(outDir, `qa-site-audit-${stamp}.json`);
  writeFileSync(latest, JSON.stringify(results, null, 2));
  writeFileSync(stamped, JSON.stringify(results, null, 2));
  console.log(`\nWrote ${latest}`);
  console.log(`Summary: ${JSON.stringify(results.summary)}`);
  process.exit(Math.min(125, results.summary.failTotal));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
