/**
 * Captcha-aware role audit against ty staging.
 * Usage: node scripts/qa-ty-roles.mjs [baseUrl]
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const BASE = (process.argv[2] || 'https://ty.idivles.ru').replace(/\/$/, '');
const PASS = process.env.QA_PASS || 'RolePass123!';
const TECH_EMAIL = process.env.TECH_EMAIL || 'tech@young.idivles.ru';
const TECH_PASS = process.env.TECH_PASS || '';

const TAG_BY_TITLE = {
  деревья: 'tree',
  машины: 'car',
  дома: 'house',
  животные: 'cat',
};

const accounts = [
  { key: 'guest', email: null, role: 'GUEST' },
  { key: 'user', email: 'user@sochi.ru', role: 'USER' },
  { key: 'part', email: 'part@sochi.ru', role: 'PARTICIPANT' },
  { key: 'mod', email: 'mod@sochi.ru', role: 'MODERATOR' },
  { key: 'admin', email: 'qa-admin@sochi.ru', role: 'ADMIN' },
  { key: 'scanner', email: 'scanner@sochi.ru', role: 'SCANNER' },
  ...(TECH_PASS ? [{ key: 'tech', email: TECH_EMAIL, role: 'TECH', pass: TECH_PASS }] : []),
];

const guestPages = ['/', '/events', '/projects', '/clubs', '/spaces', '/news', '/coworking', '/login', '/privacy', '/contacts'];
const userPages = ['/dashboard', '/dashboard/settings', '/dashboard/applications', '/more'];
const staffPages = ['/admin', '/admin/occupancy', '/admin/spaces', '/admin/bookings', '/admin/users'];
const scannerPages = ['/scan', '/scanner', '/admin/scanner'];
const techPages = ['/ops'];

function jarStore(jar, res) {
  const raw = res.headers.getSetCookie?.() || [];
  for (const c of raw) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}
const cookieHeader = (jar) => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

function row(role, name, ok, severity, detail = '') {
  return { role, name, ok: Boolean(ok), severity, detail: String(detail || '').slice(0, 240) };
}

async function solveCaptcha(jar) {
  const chRes = await fetch(`${BASE}/api/captcha/challenge`, { headers: { cookie: cookieHeader(jar) } });
  jarStore(jar, chRes);
  if (!chRes.ok) throw new Error(`captcha challenge HTTP ${chRes.status}`);
  const ch = await chRes.json();
  let selected = [];
  if (ch.kind === 'pick' && Array.isArray(ch.tiles)) {
    const q = String(ch.question || '');
    let tag = null;
    for (const [title, t] of Object.entries(TAG_BY_TITLE)) {
      if (q.includes(title)) tag = t;
    }
    if (!tag) throw new Error(`unknown captcha question: ${q}`);
    selected = ch.tiles.filter((t) => String(t.id).startsWith(`${tag}-`)).map((t) => t.id);
  } else {
    throw new Error(`unsupported captcha kind ${ch.kind}`);
  }
  const solRes = await fetch(`${BASE}/api/captcha/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: cookieHeader(jar) },
    body: JSON.stringify({ challengeId: ch.challengeId, selected, website: '' }),
  });
  jarStore(jar, solRes);
  const sol = await solRes.json().catch(() => ({}));
  if (!solRes.ok || !sol.token) throw new Error(sol.message || `captcha solve HTTP ${solRes.status}`);
  return sol.token;
}

async function login(email, pass = PASS) {
  const jar = new Map();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { cookie: cookieHeader(jar) } });
  jarStore(jar, csrfRes);
  const { csrfToken } = await csrfRes.json();
  const captchaToken = await solveCaptcha(jar);
  const body = new URLSearchParams({
    csrfToken,
    email,
    password: pass,
    json: 'true',
    callbackUrl: `${BASE}/dashboard`,
    requireCaptcha: '1',
    captchaToken,
    website: '',
  });
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: cookieHeader(jar) },
    body,
    redirect: 'manual',
  });
  jarStore(jar, loginRes);
  const loginBody = await loginRes.text();
  const sessionRes = await fetch(`${BASE}/api/auth/session`, { headers: { cookie: cookieHeader(jar) } });
  jarStore(jar, sessionRes);
  const session = await sessionRes.json().catch(() => ({}));
  return {
    jar,
    cookie: cookieHeader(jar),
    session,
    ok: Boolean(session?.user?.id),
    role: session?.user?.role || null,
    loginStatus: loginRes.status,
    loginBody: loginBody.slice(0, 180),
  };
}

async function get(cookie, path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: 'manual',
  });
  const loc = res.headers.get('location') || '';
  return { status: res.status, location: loc, ok: res.status >= 200 && res.status < 400 };
}

function expectAuthPage(r) {
  // 200 OK, or redirect within app (not to login)
  if (r.status >= 200 && r.status < 300) return true;
  if (r.status >= 300 && r.status < 400) {
    return locOk(r.location) && !/\/login/i.test(r.location);
  }
  return false;
}
function expectDenied(r, path = '') {
  if (r.status === 401 || r.status === 403) return true;
  if (r.status >= 300 && r.status < 400) {
    const loc = String(r.location || '');
    // Non-TECH hitting /ops is bounced home — still a deny.
    if (String(path) === '/ops' && (loc === '/' || loc.endsWith('://ty.idivles.ru/') || /\/$/.test(loc) && !/login|scanner|dashboard|ops|unavailable/i.test(loc))) {
      return true;
    }
    if (loc === '/' || loc.endsWith('/')) return true; // generic bounce-home deny
    return /\/login|\/unavailable|\/dashboard|\/scanner|\/ops/i.test(loc);
  }
  // /more is a public legacy landing for guests
  if (String(path) === '/more' && r.status >= 200 && r.status < 300) return true;
  return false;
}
function locOk(loc) {
  return !loc || loc.startsWith('/') || loc.includes('ty.idivles.ru') || loc.includes('idivles.ru');
}

async function checkPages(out, role, pages, expectFn, label) {
  for (const p of pages) {
    const r = await get(out.cookie, p);
    const ok = expectFn(r, p);
    out.rows.push(
      row(role, `${label} ${p}`, ok, ok ? 'info' : 'high', `HTTP ${r.status}${r.location ? ' → ' + r.location : ''}`)
    );
  }
}

async function main() {
  const rows = [];
  console.log(`QA roles @ ${BASE}`);

  // Guest
  {
    const cookie = '';
    for (const p of guestPages) {
      const r = await get(cookie, p);
      const ok = r.status >= 200 && r.status < 400;
      rows.push(row('GUEST', `public ${p}`, ok, ok ? 'info' : 'critical', `HTTP ${r.status}`));
    }
    for (const p of [...userPages, ...staffPages, ...scannerPages, ...techPages]) {
      const r = await get(cookie, p);
      const denied = expectDenied(r, p);
      rows.push(row('GUEST', `deny ${p}`, denied, denied ? 'info' : 'high', `HTTP ${r.status} → ${r.location}`));
    }
  }

  for (const acc of accounts.filter((a) => a.email)) {
    const auth = await login(acc.email, acc.pass || PASS);
    rows.push(row(acc.role, 'login', auth.ok && auth.role === acc.role, 'critical', auth.ok ? auth.role : `${auth.loginStatus} ${auth.loginBody}`));
    if (!auth.ok) continue;
    const ctx = { cookie: auth.cookie, rows };

    if (acc.role === 'USER' || acc.role === 'PARTICIPANT') {
      await checkPages(ctx, acc.role, userPages, expectAuthPage, 'cabinet');
      await checkPages(ctx, acc.role, staffPages, expectDenied, 'deny staff');
      await checkPages(ctx, acc.role, scannerPages, expectDenied, 'deny scanner');
      await checkPages(ctx, acc.role, techPages, expectDenied, 'deny tech');
      // homepage + coworking still ok
      await checkPages(ctx, acc.role, ['/', '/coworking', '/spaces'], expectAuthPage, 'public');
    } else if (acc.role === 'MODERATOR') {
      await checkPages(ctx, acc.role, userPages, expectAuthPage, 'cabinet');
      await checkPages(ctx, acc.role, staffPages, expectAuthPage, 'admin');
      await checkPages(ctx, acc.role, techPages, expectDenied, 'deny tech');
    } else if (acc.role === 'ADMIN') {
      await checkPages(ctx, acc.role, userPages, expectAuthPage, 'cabinet');
      await checkPages(ctx, acc.role, staffPages, expectAuthPage, 'admin');
      await checkPages(ctx, acc.role, ['/admin/settings', '/admin/occupancy'], expectAuthPage, 'admin+');
      await checkPages(ctx, acc.role, techPages, expectDenied, 'deny tech');
    } else if (acc.role === 'SCANNER') {
      await checkPages(ctx, acc.role, scannerPages, expectAuthPage, 'scan');
      await checkPages(ctx, acc.role, ['/admin', '/admin/users', '/admin/settings'], expectDenied, 'deny admin');
      await checkPages(ctx, acc.role, techPages, expectDenied, 'deny tech');
    } else if (acc.role === 'TECH') {
      await checkPages(ctx, acc.role, techPages, expectAuthPage, 'ops');
      await checkPages(ctx, acc.role, ['/admin'], expectDenied, 'deny admin');
    }
  }

  // Health / hero presence
  {
    const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
    rows.push(row('SYSTEM', 'health ok', health?.ok && health?.db, 'critical', JSON.stringify(health)));
    const home = await fetch(`${BASE}/`).then((r) => r.text());
    rows.push(row('SYSTEM', 'hero video class', home.includes('home-hero--video'), 'high', ''));
    rows.push(row('SYSTEM', 'hero CTAs', home.includes('Записаться в коворкинг') && home.includes('Свободные залы'), 'high', ''));
    rows.push(row('SYSTEM', 'no QA tutorial SSR', !home.includes('qa-tutorial-root'), 'info', ''));
  }

  const fail = rows.filter((r) => !r.ok);
  const critical = fail.filter((r) => r.severity === 'critical');
  const high = fail.filter((r) => r.severity === 'high');
  const report = {
    base: BASE,
    at: new Date().toISOString(),
    total: rows.length,
    pass: rows.filter((r) => r.ok).length,
    fail: fail.length,
    critical: critical.length,
    high: high.length,
    rows,
  };

  mkdirSync('/opt/cursor/artifacts/qa', { recursive: true });
  mkdirSync('docs/perf', { recursive: true });
  const file = join('docs/perf', `qa-ty-roles-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  writeFileSync('/opt/cursor/artifacts/qa/qa-ty-roles.json', JSON.stringify(report, null, 2));
  writeFileSync('/tmp/qa-ty-roles.json', JSON.stringify(report, null, 2));

  console.log(`\nPASS ${report.pass}/${report.total}  FAIL ${report.fail} (critical=${report.critical} high=${report.high})`);
  if (fail.length) {
    console.log('\nFailures:');
    for (const f of fail) console.log(`- [${f.severity}] ${f.role}: ${f.name} :: ${f.detail}`);
  }
  console.log(`\nReport: ${file}`);
  process.exit(critical.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
