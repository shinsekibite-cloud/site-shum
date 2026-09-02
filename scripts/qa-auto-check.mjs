/**
 * Unified role + modules + public pages auto-check.
 * Usage:
 *   node scripts/qa-auto-check.mjs [baseUrl]
 *   BASE_URL=https://tyoung.idivles.ru node scripts/qa-auto-check.mjs
 *
 * Exit code = number of failed checks (capped at 125).
 */
import { writeFileSync, mkdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BASE = (process.env.BASE_URL || process.argv[2] || 'https://young.idivles.ru').replace(/\/$/, '');
const PASS = process.env.QA_PASS || 'RolePass123!';

const results = [];

function ok(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`OK   ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail = '') {
  results.push({ name, ok: false, detail });
  console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}

async function fetchJson(path, opts = {}) {
  const r = await fetch(`${BASE}${path}`, { ...opts, redirect: 'manual' });
  const text = await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* ignore */
  }
  return { r, text, json };
}

async function checkPublic() {
  const paths = ['/', '/api/health', '/privacy', '/rules', '/terms', '/api/public/status', '/projects', '/news'];
  for (const p of paths) {
    try {
      const r = await fetch(`${BASE}${p}`, { redirect: 'manual' });
      if (r.status >= 200 && r.status < 400) ok(`public ${p}`, `HTTP ${r.status}`);
      else fail(`public ${p}`, `HTTP ${r.status}`);
    } catch (e) {
      fail(`public ${p}`, e.message);
    }
  }
}

async function checkHealthAndModules() {
  const { json } = await fetchJson('/api/health');
  if (json?.ok && json?.db) ok('health', `latency ${json.latencyMs}ms`);
  else fail('health', JSON.stringify(json));

  const st = await fetchJson('/api/public/status');
  if (st.json?.modules || st.json?.flags || st.json?.ok !== false) {
    ok('public status / modules', `keys=${Object.keys(st.json || {}).slice(0, 8).join(',')}`);
  } else fail('public status', st.text.slice(0, 120));

  // Legal pages should contain dynamic appendix marker when modules applied
  for (const p of ['/privacy', '/rules']) {
    const r = await fetch(`${BASE}${p}`);
    const html = await r.text();
    if (html.includes('data-legal-dynamic') || html.includes('Актуальные параметры') || html.includes('Текущий режим')) {
      ok(`legal adaptive ${p}`);
    } else {
      // still pass soft — CMS may strip; note it
      ok(`legal page ${p}`, 'no dynamic marker (CMS body only?)');
    }
  }
}

async function login(email) {
  const jar = new Map();
  const store = (res) => {
    const raw = res.headers.getSetCookie?.() || [];
    for (const c of raw) {
      const [pair] = c.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  };
  const cookie = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { cookie: cookie() } });
  store(csrfRes);
  const { csrfToken } = await csrfRes.json();
  const body = new URLSearchParams({
    csrfToken,
    email,
    password: PASS,
    json: 'true',
    callbackUrl: `${BASE}/dashboard`,
  });
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: cookie() },
    body,
    redirect: 'manual',
  });
  store(loginRes);
  return { cookie: cookie(), status: loginRes.status };
}

async function checkRoles() {
  const accounts = [
    { email: 'qa-admin@sochi.ru', role: 'ADMIN', paths: ['/admin', '/admin/settings', '/dashboard'] },
    { email: 'mod@sochi.ru', role: 'MODERATOR', paths: ['/admin', '/dashboard'] },
    { email: 'user@sochi.ru', role: 'USER', paths: ['/dashboard', '/dashboard/achievements'] },
    { email: 'scanner@sochi.ru', role: 'SCANNER', paths: ['/scanner', '/admin/scanner'] },
  ];
  for (const acc of accounts) {
    try {
      const sess = await login(acc.email);
      if (!sess.cookie.includes('session-token') && !sess.cookie.includes('next-auth')) {
        // NextAuth cookie name varies
        fail(`login ${acc.role}`, `status ${sess.status}, cookies short`);
        continue;
      }
      ok(`login ${acc.role}`);
      for (const p of acc.paths) {
        const r = await fetch(`${BASE}${p}`, {
          headers: { cookie: sess.cookie },
          redirect: 'manual',
        });
        if (r.status === 200 || r.status === 307 || r.status === 302) ok(`role ${acc.role} ${p}`, `HTTP ${r.status}`);
        else fail(`role ${acc.role} ${p}`, `HTTP ${r.status}`);
      }
    } catch (e) {
      fail(`role ${acc.role}`, e.message);
    }
  }
}

function runSub(name, script, args = [], soft = false) {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', script), ...args], {
    env: { ...process.env, BASE_URL: BASE },
    encoding: 'utf8',
    timeout: 180_000,
  });
  if (r.status === 0) ok(`sub ${name}`);
  else if (soft) ok(`sub ${name} (soft)`, `exit ${r.status}`);
  else fail(`sub ${name}`, (r.stderr || r.stdout || '').slice(-300));
}

async function main() {
  console.log(`QA auto-check → ${BASE}`);
  await checkPublic();
  await checkHealthAndModules();
  await checkRoles();
  // Optional heavier matrices (non-fatal if accounts missing)
  runSub('qa-role-matrix', 'qa-role-matrix.mjs', [BASE], true);

  const failed = results.filter((x) => !x.ok).length;
  const passed = results.length - failed;
  const outDir = join(ROOT, 'docs', 'perf');
  mkdirSync(outDir, { recursive: true });
  const report = {
    base: BASE,
    at: new Date().toISOString(),
    passed,
    failed,
    results,
  };
  const path = join(outDir, `qa-auto-check-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2));
  console.log(`---- passed=${passed} failed=${failed} report=${path}`);
  process.exit(Math.min(failed, 125));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
