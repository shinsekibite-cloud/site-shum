/**
 * UI/UX fixes verification under all roles — one session cookie per role.
 * Usage: node scripts/qa-ui-roles.mjs [baseUrl]
 * Password: RolePass123! (QA seed accounts, same as qa-role-matrix.mjs)
 */
const BASE = (process.argv[2] || process.env.QA_BASE || 'https://young.idivles.ru').replace(/\/$/, '');
const PASS = process.env.QA_PASS || 'RolePass123!';
const LOGIN_DELAY_MS = Number(process.env.QA_LOGIN_DELAY_MS || 400);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const accounts = [
  { key: 'guest', email: null },
  { key: 'admin', email: 'qa-admin@sochi.ru', role: 'ADMIN' },
  { key: 'mod', email: 'mod@sochi.ru', role: 'MODERATOR' },
  { key: 'user', email: 'user@sochi.ru', role: 'USER' },
  { key: 'part', email: 'part@sochi.ru', role: 'PARTICIPANT' },
  { key: 'scanner', email: 'scanner@sochi.ru', role: 'SCANNER' },
];

/** Public pages with UI fixes — checked for guest and each role */
const uiPages = [
  { path: '/projects', markers: ['page-hero-title', 'catalog-page-header', 'filter-bar'] },
  { path: '/clubs', markers: ['page-hero-title', 'catalog-page-header', 'filter-bar'] },
  { path: '/spaces', markers: ['page-hero-title', 'space-filter-bar'] },
  { path: '/news', markers: ['page-hero-title', 'page-hero-subtitle'] },
  { path: '/contacts', markers: ['page-hero-title'] },
  { path: '/events', markers: ['page-hero-title'] },
];

function jarStore(jar, res) {
  for (const c of res.headers.getSetCookie?.() || []) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}
const cookieStr = (jar) => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

async function login(email) {
  const jar = new Map();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { cookie: cookieStr(jar) } });
  jarStore(jar, csrfRes);
  const { csrfToken } = await csrfRes.json();
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: cookieStr(jar) },
    body: new URLSearchParams({ csrfToken, email, password: PASS, json: 'true', callbackUrl: `${BASE}/` }),
    redirect: 'manual',
  });
  jarStore(jar, loginRes);
  const sessionRes = await fetch(`${BASE}/api/auth/session`, { headers: { cookie: cookieStr(jar) } });
  jarStore(jar, sessionRes);
  const session = await sessionRes.json();
  return { jar, cookie: cookieStr(jar), session, ok: Boolean(session?.user?.id), role: session?.user?.role };
}

async function fetchPage(cookie, path) {
  const res = await fetch(`${BASE}${path}`, {
    redirect: 'follow',
    headers: cookie ? { cookie } : {},
  });
  const text = await res.text();
  const finalUrl = res.url.replace(BASE, '');
  return { status: res.status, text, finalUrl };
}

async function api(cookie, path) {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie } });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function row(name, pass, detail = '') {
  return { name, pass: Boolean(pass), detail: String(detail).slice(0, 120) };
}

function hasMarkers(text, markers) {
  return markers.every((m) => text.includes(m));
}

async function checkUiPages(key, cookie) {
  const out = [];
  for (const { path, markers } of uiPages) {
    const r = await fetchPage(cookie, path);
    out.push(row(`${key}:ui${path}`, r.status === 200 && hasMarkers(r.text, markers), `HTTP ${r.status}`));
    if (cookie && r.status === 200) {
      const slot = (r.text.match(/nav-auth-slot/g) || []).length;
      const bells = (r.text.match(/yp-notif-bell/g) || []).length;
      out.push(row(`${key}:nav${path}`, slot >= 1 && bells <= 2, `slot=${slot} bells=${bells}`));
    }
  }
  return out;
}

async function checkGuestOnly() {
  const out = [];
  const loginPage = await fetchPage(null, '/login');
  out.push(row('guest:login-ui', loginPage.status === 200 && loginPage.text.includes('auth-form-title'), 'login form'));
  const nf = await fetchPage(null, '/__qa-404-test__');
  out.push(row('guest:404-ui', nf.text.includes('error-page__title'), '404'));
  for (const p of ['/dashboard', '/admin', '/messages']) {
    const r = await fetchPage(null, p);
    out.push(row(`guest:block${p}`, r.finalUrl.includes('/login') || r.status === 401, `url=${r.finalUrl}`));
  }
  return out;
}

async function checkRoleAccess(key, expectedRole, cookie) {
  const out = [];
  const session = await api(cookie, '/api/auth/session');
  out.push(row(`${key}:session-role`, session.json?.user?.role === expectedRole, session.json?.user?.role || 'none'));

  const profile = await api(cookie, '/api/user/profile');
  out.push(row(`${key}:profile-api`, profile.status === 200, `HTTP ${profile.status}`));

  const dash = await fetchPage(cookie, '/dashboard');
  out.push(row(`${key}:dashboard-page`, dash.status === 200, `url=${dash.finalUrl}`));

  if (expectedRole === 'ADMIN' || expectedRole === 'MODERATOR') {
    const admin = await fetchPage(cookie, '/admin');
    out.push(
      row(
        `${key}:admin-page`,
        admin.status === 200 && admin.text.includes('admin-page-shell'),
        `url=${admin.finalUrl}`
      )
    );
    const stats = await api(cookie, '/api/admin/stats');
    out.push(row(`${key}:admin-stats-api`, stats.status === 200, `HTTP ${stats.status}`));
  } else if (expectedRole === 'SCANNER') {
    const admin = await fetchPage(cookie, '/admin');
    out.push(
      row(
        `${key}:admin-blocked`,
        admin.finalUrl.includes('/scanner') || admin.status === 403,
        `url=${admin.finalUrl}`
      )
    );
    const scan = await api(cookie, '/api/scanner/events');
    out.push(row(`${key}:scanner-api`, scan.status === 200, `HTTP ${scan.status}`));
  } else {
    const admin = await fetchPage(cookie, '/admin');
    out.push(
      row(
        `${key}:admin-blocked`,
        admin.finalUrl.includes('/login') || admin.finalUrl.includes('/dashboard') || admin.status === 403,
        `url=${admin.finalUrl}`
      )
    );
  }

  return out;
}

async function main() {
  const all = [];
  all.push(...(await checkGuestOnly()));
  all.push(...(await checkUiPages('guest', null)));

  for (const acc of accounts.filter((a) => a.email)) {
    await sleep(LOGIN_DELAY_MS);
    const auth = await login(acc.email);
    all.push(row(`${acc.key}:login`, auth.ok, auth.role || 'fail'));
    if (!auth.ok) continue;
    all.push(...(await checkUiPages(acc.key, auth.cookie)));
    all.push(...(await checkRoleAccess(acc.key, acc.role, auth.cookie)));
  }

  const failed = all.filter((r) => !r.pass);
  console.log(
    JSON.stringify(
      { base: BASE, total: all.length, passed: all.length - failed.length, failed: failed.length, failures: failed },
      null,
      2
    )
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
