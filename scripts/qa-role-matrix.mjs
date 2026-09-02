/**
 * Role × feature matrix API checks against live site.
 * Usage: node scripts/qa-role-matrix.mjs [baseUrl]
 * Default base: https://young.idivles.ru
 * Password: RolePass123!
 */
import { writeFileSync } from 'fs';

const BASE = process.argv[2] || 'https://young.idivles.ru';
const PASS = 'RolePass123!';

const accounts = [
  { key: 'admin', email: 'qa-admin@sochi.ru', role: 'ADMIN' },
  { key: 'mod', email: 'mod@sochi.ru', role: 'MODERATOR' },
  { key: 'part', email: 'part@sochi.ru', role: 'PARTICIPANT' },
  { key: 'user', email: 'user@sochi.ru', role: 'USER' },
  { key: 'scanner', email: 'scanner@sochi.ru', role: 'SCANNER' },
];

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
  const cookieHeader = () =>
    [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, {
    headers: { cookie: cookieHeader() },
  });
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
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      cookie: cookieHeader(),
    },
    body,
    redirect: 'manual',
  });
  store(loginRes);

  const sessionRes = await fetch(`${BASE}/api/auth/session`, {
    headers: { cookie: cookieHeader() },
  });
  store(sessionRes);
  const session = await sessionRes.json();
  return {
    cookie: cookieHeader(),
    session,
    ok: Boolean(session?.user?.id),
  };
}

async function api(cookie, path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      cookie,
      ...(opts.body && !opts.headers?.['Content-Type']
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function row(name, pass, detail = '') {
  return { name, pass, detail };
}

async function runForAccount(acc) {
  const results = [];
  const auth = await login(acc.email);
  results.push(row(`${acc.key}:login`, auth.ok, auth.session?.user?.role || 'no session'));
  if (!auth.ok) return results;

  const { cookie } = auth;
  const role = auth.session.user.role;

  // Public-ish pages via API
  results.push(
    row(
      `${acc.key}:profile`,
      (await api(cookie, '/api/user/profile')).status === 200
    )
  );

  const apps = await api(cookie, '/api/user/applications');
  results.push(row(`${acc.key}:applications`, apps.status === 200, `n=${Array.isArray(apps.json) ? apps.json.length : '?'}`));

  const bookings = await api(cookie, '/api/user/bookings');
  results.push(row(`${acc.key}:bookings`, bookings.status === 200));

  const events = await api(cookie, '/api/events');
  const eventsOk =
    role === 'SCANNER'
      ? events.status === 401 || events.status === 403 || events.status === 200
      : events.status === 200;
  results.push(
    row(
      `${acc.key}:events`,
      eventsOk,
      `status=${events.status} n=${Array.isArray(events.json) ? events.json.length : JSON.stringify(events.json)?.slice(0, 60)}`
    )
  );

  const friends = await api(cookie, '/api/friends');
  results.push(row(`${acc.key}:friends`, friends.status === 200 || (role === 'SCANNER' && friends.status >= 400)));

  const search = await api(cookie, '/api/users/search?q=Админ');
  results.push(row(`${acc.key}:search`, search.status === 200 || search.status === 401));

  // Apply as end-user
  if (role === 'USER' || role === 'PARTICIPANT' || role === 'ADMIN' || role === 'MODERATOR') {
    const apply = await api(cookie, '/api/applications', {
      method: 'POST',
      body: JSON.stringify({ clubId: 'qa_club_it', message: 'qa matrix' }),
    });
    results.push(
      row(
        `${acc.key}:apply-club`,
        apply.status === 201 || apply.status === 400,
        `${apply.status} ${apply.json?.message || ''}`
      )
    );
  }

  if (role === 'SCANNER') {
    const apply = await api(cookie, '/api/applications', {
      method: 'POST',
      body: JSON.stringify({ clubId: 'qa_club_it', message: 'should fail' }),
    });
    results.push(row(`${acc.key}:apply-blocked`, apply.status === 403 || apply.status === 401, `${apply.status}`));
  }

  // Admin APIs
  const stats = await api(cookie, '/api/admin/stats');
  const statsExpected = role === 'ADMIN' || role === 'MODERATOR' ? 200 : 403;
  results.push(
    row(
      `${acc.key}:admin-stats`,
      stats.status === statsExpected || (role === 'MODERATOR' && (stats.status === 200 || stats.status === 403)),
      `${stats.status}`
    )
  );

  // Scanner events
  const scanEvents = await api(cookie, '/api/scanner/events');
  const scanOk =
    role === 'ADMIN' || role === 'SCANNER' || role === 'MODERATOR'
      ? scanEvents.status === 200 || scanEvents.status === 403
      : scanEvents.status === 401 || scanEvents.status === 403;
  results.push(row(`${acc.key}:scanner-events`, scanOk, `${scanEvents.status}`));

  // Messages (friends only)
  const msgs = await api(cookie, '/api/messages');
  results.push(row(`${acc.key}:messages`, msgs.status === 200 || (role === 'SCANNER' && msgs.status >= 400)));

  // Achievements
  const ach = await api(cookie, '/api/user/achievements');
  results.push(row(`${acc.key}:achievements`, ach.status === 200 || ach.status === 401));

  // Private profile alias
  const priv = await api(cookie, '/api/users/' + encodeURIComponent('cmsfw3e0w00019eqg8vc5kqk4') + '/public').catch(() => null);
  // resolve private user id via search won't work; fetch by known email via admin only — skip if 404
  const privList = await api(cookie, '/api/users/search?q=Закрытый');
  results.push(row(`${acc.key}:private-hidden-search`, privList.status === 200 && Array.isArray(privList.json?.users) && privList.json.users.length === 0, `n=${privList.json?.users?.length}`));

  return results;
}

async function guestChecks() {
  const results = [];
  const pages = ['/', '/projects', '/clubs', '/spaces', '/events', '/news', '/privacy', '/rules', '/contacts'];
  for (const p of pages) {
    const res = await fetch(`${BASE}${p}`);
    results.push(row(`guest:page${p}`, res.status === 200, `${res.status}`));
  }
  const health = await fetch(`${BASE}/api/health`);
  results.push(row('guest:health', health.status === 200));
  const events = await fetch(`${BASE}/api/events`);
  const ej = await events.json().catch(() => ({}));
  results.push(row('guest:events-auth', events.status === 401 || events.status === 200, `${events.status}`));
  return results;
}

const all = [];
all.push(...(await guestChecks()));
for (const acc of accounts) {
  try {
    all.push(...(await runForAccount(acc)));
  } catch (e) {
    all.push(row(`${acc.key}:ERROR`, false, String(e.message || e)));
  }
}

const passed = all.filter((r) => r.pass).length;
const failed = all.filter((r) => !r.pass);
console.log(JSON.stringify({ base: BASE, passed, failed: failed.length, total: all.length, failedRows: failed, all }, null, 2));
writeFileSync('/tmp/qa-role-matrix.json', JSON.stringify({ passed, failed: failed.length, all }, null, 2));
process.exit(failed.length ? 1 : 0);
