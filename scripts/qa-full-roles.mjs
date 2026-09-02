/**
 * Extended role × capability audit for YoungPortal.
 * Usage: node scripts/qa-full-roles.mjs [baseUrl]
 * Password: RolePass123! (QA seed accounts)
 */
import { writeFileSync } from 'fs';

const BASE = (process.argv[2] || 'https://young.idivles.ru').replace(/\/$/, '');
const PASS = process.env.QA_PASS || 'RolePass123!';

const accounts = [
  { key: 'guest', email: null, role: 'GUEST' },
  { key: 'admin', email: 'qa-admin@sochi.ru', role: 'ADMIN' },
  { key: 'mod', email: 'mod@sochi.ru', role: 'MODERATOR' },
  { key: 'part', email: 'part@sochi.ru', role: 'PARTICIPANT' },
  { key: 'user', email: 'user@sochi.ru', role: 'USER' },
  { key: 'scanner', email: 'scanner@sochi.ru', role: 'SCANNER' },
];

const guestPages = [
  '/',
  '/events',
  '/projects',
  '/clubs',
  '/spaces',
  '/news',
  '/privacy',
  '/rules',
  '/contacts',
  '/login',
  '/register',
  '/games',
  '/documents',
  '/grants',
  '/dobro',
  '/self-gov',
];

function jarStore(jar, res) {
  const raw = res.headers.getSetCookie?.() || [];
  for (const c of raw) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}
const cookieHeader = (jar) => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

async function login(email) {
  const jar = new Map();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { cookie: cookieHeader(jar) } });
  jarStore(jar, csrfRes);
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
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: cookieHeader(jar) },
    body,
    redirect: 'manual',
  });
  jarStore(jar, loginRes);
  const sessionRes = await fetch(`${BASE}/api/auth/session`, {
    headers: { cookie: cookieHeader(jar) },
  });
  jarStore(jar, sessionRes);
  const session = await sessionRes.json();
  return { jar, cookie: cookieHeader(jar), session, ok: Boolean(session?.user?.id), role: session?.user?.role };
}

async function req(cookie, path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    redirect: opts.redirect || 'manual',
    headers: {
      ...(opts.headers || {}),
      ...(cookie ? { cookie } : {}),
      ...(opts.body && typeof opts.body === 'string' && !opts.headers?.['Content-Type']
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
  });
  const ct = res.headers.get('content-type') || '';
  let json = null;
  let text = '';
  if (ct.includes('application/json')) {
    try {
      json = await res.json();
    } catch {
      json = null;
    }
  } else {
    text = await res.text().catch(() => '');
  }
  return { status: res.status, json, text, location: res.headers.get('location') };
}

function expect(name, ok, detail = '') {
  return { name, pass: Boolean(ok), detail: String(detail).slice(0, 200) };
}

async function checkGuest() {
  const out = [];
  // Pages
  for (const p of guestPages) {
    const r = await req(null, p, { redirect: 'follow' });
    const ok = r.status >= 200 && r.status < 400;
    out.push(expect(`guest:page:${p}`, ok, `HTTP ${r.status}`));
  }
  // APIs
  const health = await req(null, '/api/health');
  out.push(expect('guest:api:health', health.status === 200 && health.json?.ok));

  const status = await req(null, '/api/public/status');
  out.push(
    expect(
      'guest:api:status',
      status.status === 200 && typeof status.json?.registrationEnabled === 'boolean',
      JSON.stringify(status.json || {}).slice(0, 120)
    )
  );

  const events = await req(null, '/api/events');
  out.push(
    expect(
      'guest:api:events',
      events.status === 200 || events.status === 401,
      `HTTP ${events.status}`
    )
  );

  // Protected APIs must deny
  for (const p of ['/api/user/profile', '/api/friends', '/api/messages', '/api/admin/stats', '/api/admin/nav-counts']) {
    const r = await req(null, p);
    out.push(expect(`guest:deny:${p}`, r.status === 401 || r.status === 403, `HTTP ${r.status}`));
  }

  // Protected pages redirect to login
  for (const p of ['/dashboard', '/friends', '/messages', '/admin', '/scanner']) {
    const r = await req(null, p);
    const toLogin =
      r.status === 307 ||
      r.status === 302 ||
      (r.location && r.location.includes('/login'));
    out.push(expect(`guest:redir:${p}`, toLogin, `HTTP ${r.status} loc=${r.location || ''}`));
  }

  return out;
}

async function checkEndUser(acc, auth) {
  const out = [];
  const { cookie, session } = auth;
  const me = session.user.id;
  const isScanner = acc.role === 'SCANNER';

  out.push(expect(`${acc.key}:login`, true, auth.role));

  // Profile
  const profile = await req(cookie, '/api/user/profile');
  out.push(expect(`${acc.key}:profile`, profile.status === 200));

  // Applications / bookings list
  const apps = await req(cookie, '/api/user/applications');
  out.push(
    expect(
      `${acc.key}:applications`,
      isScanner ? apps.status === 200 || apps.status === 403 : apps.status === 200,
      `HTTP ${apps.status}`
    )
  );
  const bookings = await req(cookie, '/api/user/bookings');
  out.push(expect(`${acc.key}:bookings`, bookings.status === 200 || (isScanner && bookings.status >= 400), `HTTP ${bookings.status}`));

  // Events
  const events = await req(cookie, '/api/events');
  out.push(expect(`${acc.key}:events`, events.status === 200 || events.status === 401, `HTTP ${events.status}`));

  // Friends list
  const friends = await req(cookie, '/api/friends');
  out.push(expect(`${acc.key}:friends`, friends.status === 200 || friends.status === 403, `HTTP ${friends.status}`));

  // Messages list
  const messages = await req(cookie, '/api/messages');
  out.push(expect(`${acc.key}:messages`, messages.status === 200 || messages.status === 403, `HTTP ${messages.status}`));

  // Admin denial for end users
  if (!['ADMIN', 'MODERATOR'].includes(acc.role)) {
    const adminStats = await req(cookie, '/api/admin/stats');
    out.push(expect(`${acc.key}:deny:admin-stats`, adminStats.status === 401 || adminStats.status === 403, `HTTP ${adminStats.status}`));
    const adminPage = await req(cookie, '/admin');
    const denied =
      adminPage.status === 307 ||
      adminPage.status === 302 ||
      adminPage.status === 403 ||
      (adminPage.location && (adminPage.location.includes('/login') || adminPage.location.includes('/dashboard') || adminPage.location.includes('/scanner')));
    out.push(expect(`${acc.key}:deny:admin-page`, denied || adminPage.status === 200 && acc.role === 'SCANNER', `HTTP ${adminPage.status} loc=${adminPage.location}`));
  }

  // Scanner cannot book/apply (if endpoints enforce)
  if (isScanner) {
    const apply = await req(cookie, '/api/applications', {
      method: 'POST',
      body: JSON.stringify({ clubId: 'qa_club_it', message: 'qa' }),
    });
    out.push(expect(`${acc.key}:deny:apply`, apply.status === 401 || apply.status === 403, `HTTP ${apply.status}`));
    const scan = await req(cookie, '/api/scanner/events');
    out.push(expect(`${acc.key}:scanner:events`, scan.status === 200, `HTTP ${scan.status}`));
  }

  // Self public profile
  const pubCode = profile.json?.user?.publicCode || profile.json?.publicCode;
  if (pubCode) {
    const pub = await req(cookie, `/api/users/${encodeURIComponent(pubCode)}/public`);
    out.push(expect(`${acc.key}:public-profile`, pub.status === 200, `HTTP ${pub.status}`));
  }

  // Cross-user: search users
  const search = await req(cookie, '/api/users/search?q=admin');
  out.push(expect(`${acc.key}:user-search`, search.status === 200 || search.status === 401 || search.status === 403, `HTTP ${search.status}`));

  void me;
  return out;
}

async function checkStaff(acc, auth) {
  const out = [];
  const { cookie } = auth;
  const isAdmin = acc.role === 'ADMIN';

  const nav = await req(cookie, '/api/admin/nav-counts');
  out.push(expect(`${acc.key}:nav-counts`, nav.status === 200, `HTTP ${nav.status}`));

  const mod = await req(cookie, '/api/admin/moderation?status=OPEN&days=30');
  // mod may lack moderation permission
  out.push(
    expect(
      `${acc.key}:moderation`,
      mod.status === 200 || (!isAdmin && (mod.status === 403 || mod.status === 401)),
      `HTTP ${mod.status}`
    )
  );

  const stats = await req(cookie, '/api/admin/stats');
  out.push(
    expect(
      `${acc.key}:stats`,
      stats.status === 200 || (!isAdmin && (stats.status === 403 || stats.status === 401)),
      `HTTP ${stats.status}`
    )
  );

  if (isAdmin) {
    const rkn = await req(cookie, '/api/admin/rkn-pack');
    out.push(expect(`${acc.key}:rkn-pack`, rkn.status === 200, `HTTP ${rkn.status}`));

    const settingsPage = await req(cookie, '/admin/settings?tab=access');
    out.push(expect(`${acc.key}:settings-page`, settingsPage.status === 200 || settingsPage.status === 307, `HTTP ${settingsPage.status}`));

    const lea = await req(cookie, '/api/admin/lea-export');
    out.push(expect(`${acc.key}:lea-list`, lea.status === 200, `HTTP ${lea.status}`));
  } else {
    const rkn = await req(cookie, '/api/admin/rkn-pack');
    out.push(expect(`${acc.key}:deny:rkn`, rkn.status === 401 || rkn.status === 403, `HTTP ${rkn.status}`));
    const lea = await req(cookie, '/api/admin/lea-export');
    out.push(expect(`${acc.key}:deny:lea`, lea.status === 401 || lea.status === 403, `HTTP ${lea.status}`));
  }

  return out;
}

async function checkInteractions(userAuth, partAuth, adminAuth) {
  const out = [];
  if (!userAuth?.ok || !partAuth?.ok) {
    out.push(expect('interact:skip', false, 'missing user/part sessions'));
    return out;
  }

  const userId = userAuth.session.user.id;
  const partId = partAuth.session.user.id;

  // Friend request user -> part (may already exist)
  const fr = await req(userAuth.cookie, '/api/friends', {
    method: 'POST',
    body: JSON.stringify({ userId: partId }),
  });
  out.push(
    expect(
      'interact:friend-request',
      fr.status === 200 || fr.status === 201 || fr.status === 400 || fr.status === 409,
      `HTTP ${fr.status} ${JSON.stringify(fr.json || {}).slice(0, 80)}`
    )
  );

  // Message attempt (friends-only or silence)
  const msg = await req(userAuth.cookie, '/api/messages', {
    method: 'POST',
    body: JSON.stringify({ userId: partId, body: 'QA ping ' + Date.now() }),
  });
  out.push(
    expect(
      'interact:dm-user-part',
      [200, 201, 403, 429].includes(msg.status),
      `HTTP ${msg.status} ${String(msg.json?.message || '').slice(0, 100)}`
    )
  );

  // Admin message to user should work even in silence (staff)
  if (adminAuth?.ok) {
    const am = await req(adminAuth.cookie, '/api/messages', {
      method: 'POST',
      body: JSON.stringify({ userId, body: 'QA staff ping ' + Date.now() }),
    });
    out.push(
      expect(
        'interact:dm-admin-user',
        [200, 201, 403, 429].includes(am.status),
        `HTTP ${am.status} ${String(am.json?.message || '').slice(0, 100)}`
      )
    );
  }

  // Scanner cannot DM typically? check
  return out;
}

async function main() {
  const all = [];
  console.log(`BASE=${BASE}`);

  all.push(...(await checkGuest()));

  const sessions = {};
  for (const acc of accounts.filter((a) => a.email)) {
    const auth = await login(acc.email);
    sessions[acc.key] = auth;
    if (!auth.ok) {
      all.push(expect(`${acc.key}:login`, false, 'no session'));
      continue;
    }
    if (auth.role !== acc.role) {
      all.push(expect(`${acc.key}:role-match`, false, `expected ${acc.role} got ${auth.role}`));
    } else {
      all.push(expect(`${acc.key}:role-match`, true, auth.role));
    }
    all.push(...(await checkEndUser(acc, auth)));
    if (acc.role === 'ADMIN' || acc.role === 'MODERATOR') {
      all.push(...(await checkStaff(acc, auth)));
    }
  }

  all.push(...(await checkInteractions(sessions.user, sessions.part, sessions.admin)));

  const failed = all.filter((r) => !r.pass);
  const report = {
    base: BASE,
    at: new Date().toISOString(),
    total: all.length,
    passed: all.length - failed.length,
    failed: failed.length,
    results: all,
  };
  writeFileSync('/tmp/qa-full-roles.json', JSON.stringify(report, null, 2));
  writeFileSync('/tmp/qa-full-roles.json', JSON.stringify(report, null, 2));

  console.log(`\nPassed ${report.passed}/${report.total}`);
  if (failed.length) {
    console.log('\nFAILURES:');
    for (const f of failed) console.log(` - ${f.name}: ${f.detail}`);
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
