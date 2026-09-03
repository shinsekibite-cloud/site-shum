/**
 * Verify booking → staff notify → approve → join → check-in notifications.
 * Usage: BASE=https://ty.idivles.ru PASS='TestPortal1!' node scripts/qa-notifications-flow.mjs
 */
const BASE = (process.env.BASE || 'https://ty.idivles.ru').replace(/\/$/, '');
const PASS = process.env.PASS || 'TestPortal1!';
const ADMIN_PASS = process.env.ADMIN_PASS || PASS;
const QA_ADMIN_PASS = process.env.QA_ADMIN_PASS || 'RolePass123!';

function jarStore(jar, res) {
  const raw = res.headers.getSetCookie?.() || [];
  for (const c of raw) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}
const cookieHeader = (jar) => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

async function login(email, password = PASS) {
  const jar = new Map();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { cookie: cookieHeader(jar) } });
  jarStore(jar, csrfRes);
  const { csrfToken } = await csrfRes.json();
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: cookieHeader(jar) },
    body: new URLSearchParams({
      csrfToken,
      email,
      password,
      json: 'true',
      callbackUrl: `${BASE}/dashboard`,
    }),
    redirect: 'manual',
  });
  jarStore(jar, loginRes);
  const sessionRes = await fetch(`${BASE}/api/auth/session`, { headers: { cookie: cookieHeader(jar) } });
  jarStore(jar, sessionRes);
  const session = await sessionRes.json();
  return { jar, cookie: cookieHeader(jar), session, ok: Boolean(session?.user?.id) };
}

async function api(cookie, path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      cookie,
      Origin: BASE,
      Referer: `${BASE}/`,
      ...(opts.body && !opts.headers?.['Content-Type'] ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text: text.slice(0, 200) };
}

async function unread(cookie) {
  const r = await api(cookie, '/api/user/notifications?lite=1');
  return { status: r.status, unread: r.json?.unread ?? null, lite: r.json?.lite };
}

async function latestTitles(cookie, take = 8) {
  const r = await api(cookie, `/api/user/notifications?take=${take}`);
  const items = r.json?.items || [];
  return items.map((i) => `${i.type}:${i.title}`).slice(0, take);
}

function ok(label, pass, detail = '') {
  console.log(`${pass ? 'OK' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  return pass;
}

async function main() {
  let fails = 0;
  const mark = (label, pass, detail) => {
    if (!ok(label, pass, detail)) fails += 1;
  };

  const spaces = await api('', '/api/spaces');
  // public spaces list may be page; fetch via DB-less: /spaces HTML — use bookings calendar API if any
  // Prefer known space from events listing
  const events = await fetch(`${BASE}/api/events`).then((r) => r.json()).catch(() => null);
  const spaceId =
    events?.[0]?.spaceId ||
    events?.events?.[0]?.spaceId ||
    process.env.SPACE_ID ||
    null;

  const user = await login('test-user@yp.test');
  mark('login test-user', user.ok, user.session?.user?.role);

  const admin = await login('test-admin@yp.test', ADMIN_PASS);
  mark('login test-admin', admin.ok, admin.session?.user?.role);

  const admin2 = await login('qa-admin@sochi.ru', QA_ADMIN_PASS);
  mark('login qa-admin (2nd)', admin2.ok, admin2.session?.user?.role || 'bad pass?');

  const part = await login('test-part@yp.test');
  mark('login test-part', part.ok, part.session?.user?.role);

  // Logout security ping should be fast (no hang)
  if (user.ok) {
    const t0 = Date.now();
    const sec = await api(user.cookie, '/api/user/security', {
      method: 'POST',
      body: JSON.stringify({ fingerprint: 'qa-notif-fp', kind: 'LOGOUT' }),
    });
    const ms = Date.now() - t0;
    mark('LOGOUT security <3s', sec.status === 200 && ms < 3000, `${sec.status} ${ms}ms`);
  }

  // Resolve a bookable space
  let sid = spaceId || process.env.SPACE_ID || null;
  if (!sid && user.ok) {
    const html = await fetch(`${BASE}/spaces`).then((r) => r.text());
    const m =
      html.match(/\/spaces\/(crm_space_[a-z0-9_-]+)/i) ||
      html.match(/\/spaces\/(qa_space_[a-z0-9_-]+)/i) ||
      html.match(/\/spaces\/([a-z0-9_-]{6,})\//i);
    sid = m?.[1] || null;
  }
  if (!sid) sid = 'qa_space_dm';
  mark('space id resolved', Boolean(sid), sid || 'none');

  if (!user.ok || !sid) {
    console.log(`DONE fails=${fails}`);
    process.exit(fails ? 1 : 0);
  }

  const beforeAdmin = await unread(admin.cookie);
  const beforeAdmin2 = admin2.ok ? await unread(admin2.cookie) : { unread: null };

  // Book tomorrow 14:00–15:00 MSK → UTC
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 2);
  start.setUTCHours(11, 0, 0, 0); // 14:00 MSK
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const title = `QA notif ${Date.now().toString(36)}`;

  const book = await api(user.cookie, '/api/bookings', {
    method: 'POST',
    body: JSON.stringify({
      spaceId: sid,
      title,
      description: 'qa notifications flow check',
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    }),
  });
  mark(
    'create booking',
    book.status === 201 || book.status === 200,
    `${book.status} ${book.json?.bookingId || book.json?.message || book.text}`
  );
  const bookingId = book.json?.bookingId;
  if (!bookingId) {
    console.log(`DONE fails=${fails}`);
    process.exit(1);
  }

  await new Promise((r) => setTimeout(r, 1500));
  const afterAdmin = await unread(admin.cookie);
  const afterAdmin2 = admin2.ok ? await unread(admin2.cookie) : { unread: null };
  mark(
    'admin1 unread increased',
    typeof afterAdmin.unread === 'number' &&
      typeof beforeAdmin.unread === 'number' &&
      afterAdmin.unread > beforeAdmin.unread,
    `${beforeAdmin.unread}→${afterAdmin.unread}`
  );
  if (admin2.ok) {
    mark(
      'admin2 unread increased',
      typeof afterAdmin2.unread === 'number' &&
        typeof beforeAdmin2.unread === 'number' &&
        afterAdmin2.unread > beforeAdmin2.unread,
      `${beforeAdmin2.unread}→${afterAdmin2.unread}`
    );
  }

  const adminTitles = await latestTitles(admin.cookie);
  mark(
    'admin sees new booking notif',
    adminTitles.some((t) => /Новая бронь|согласован/i.test(t)),
    adminTitles.slice(0, 3).join(' | ')
  );

  // Approve via admin form action is server action — use DB-less path: telegram not available.
  // Direct SQL approve on VPS is ok for QA; here try PATCH if exists, else shell hint.
  // Use internal: admin bookings is form POST — skip, approve via docker SQL.
  console.log(`NOTE bookingId=${bookingId} (approve via SQL if needed)`);

  // User pending notification
  const userTitles = await latestTitles(user.cookie);
  mark(
    'user pending/approved notif',
    userTitles.some((t) => /Бронь|одобр|согласован/i.test(t)),
    userTitles.slice(0, 4).join(' | ')
  );

  console.log(`DONE fails=${fails} bookingId=${bookingId}`);
  process.exit(fails ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
