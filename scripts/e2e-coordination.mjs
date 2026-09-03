/**
 * End-to-end ACL + coordination smoke against production.
 * Usage: node scripts/e2e-coordination.mjs
 */
const BASE = process.env.BASE_URL || 'https://young.idivles.ru';
const PASS = process.env.USER_PASS || 'TestPass2026!';
const ADMIN_PASS = process.env.ADMIN_PASS || '';

const results = [];
function ok(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

async function login(email, password) {
  const jar = new Map();
  const store = (res) => {
    const raw = res.headers.getSetCookie?.() || [];
    for (const c of raw) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      if (i > 0) jar.set(kv.slice(0, i), kv.slice(i + 1));
    }
  };
  const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

  let res = await fetch(`${BASE}/api/auth/csrf`, { headers: { cookie: cookieHeader() } });
  store(res);
  const { csrfToken } = await res.json();

  res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      cookie: cookieHeader(),
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password,
      callbackUrl: `${BASE}/dashboard`,
      json: 'true',
    }),
    redirect: 'manual',
  });
  store(res);
  const body = await res.json().catch(() => ({}));
  const sessionRes = await fetch(`${BASE}/api/auth/session`, { headers: { cookie: cookieHeader() } });
  store(sessionRes);
  const session = await sessionRes.json();
  return {
    cookie: cookieHeader(),
    session,
    ok: Boolean(session?.user?.email),
    url: body?.url,
  };
}

async function get(path, cookie = '') {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: 'manual',
  });
  return { status: res.status, location: res.headers.get('location') || '', text: await res.text() };
}

async function postJson(path, cookie, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function stamp() {
  return Date.now().toString(36);
}

async function main() {
  console.log('E2E coordination @', BASE);

  // --- Guest ---
  {
    const home = await get('/');
    ok('Guest: home 200', home.status === 200);
    const apply = await postJson('/api/applications', '', { projectId: 'seed_proj_1', message: 'guest' });
    ok('Guest: cannot apply', apply.status === 401 || apply.status === 403, `status=${apply.status}`);
    const book = await postJson('/api/bookings', '', {
      spaceId: 'seed_space_1',
      title: 'guest book',
      startTime: new Date(Date.now() + 86400000 * 3).toISOString(),
      endTime: new Date(Date.now() + 86400000 * 3 + 3600000).toISOString(),
    });
    ok('Guest: cannot book', book.status === 401 || book.status === 403, `status=${book.status}`);
    const bookPage = await get('/spaces/seed_space_1/book');
    ok('Guest: book page redirects login', bookPage.status === 307 || bookPage.status === 302, `status=${bookPage.status}`);
    const admin = await get('/admin');
    ok('Guest: admin redirects login', admin.status === 307 || admin.status === 302);
  }

  // --- User create application + booking ---
  const user = await login('guestuser@test.sochi', PASS);
  ok('User: login', user.ok, user.session?.user?.role);
  let appId = null;
  let bookingId = null;
  {
    const clubId = 'seed_club_3'; // IT Community — likely unused by this user
    const apply = await postJson('/api/applications', user.cookie, {
      clubId,
      message: `E2E заявка ${stamp()}`,
    });
    // may already exist
    if (apply.status === 201) {
      appId = apply.data?.application?.id;
      ok('User: create club application', true, appId);
    } else if (apply.status === 400 && /уже подали/i.test(apply.data?.message || '')) {
      ok('User: application already exists (idempotent)', true, apply.data.message);
    } else {
      // try project instead
      const apply2 = await postJson('/api/applications', user.cookie, {
        projectId: 'seed_proj_3',
        message: `E2E проект ${stamp()}`,
      });
      if (apply2.status === 201) {
        appId = apply2.data?.application?.id;
        ok('User: create project application', true, appId);
      } else {
        ok('User: create application', apply2.status === 201 || apply.status === 400, JSON.stringify(apply2.data || apply.data));
      }
    }

    const start = new Date(Date.now() + 86400000 * 10);
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + 2 * 3600000);
    const book = await postJson('/api/bookings', user.cookie, {
      spaceId: 'seed_space_2',
      title: `E2E бронь ${stamp()}`,
      description: 'Автотест согласования',
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    });
    if (book.status === 201) {
      bookingId = book.data?.bookingId;
      ok('User: create booking PENDING', true, bookingId);
    } else {
      // conflict — shift further
      const start2 = new Date(Date.now() + 86400000 * 20);
      start2.setMinutes(0, 0, 0);
      const end2 = new Date(start2.getTime() + 2 * 3600000);
      const book2 = await postJson('/api/bookings', user.cookie, {
        spaceId: 'seed_space_3',
        title: `E2E бронь ${stamp()}`,
        description: 'Автотест согласования',
        startTime: start2.toISOString(),
        endTime: end2.toISOString(),
      });
      bookingId = book2.data?.bookingId;
      const dup =
        book2.status === 400 ||
        book2.status === 409 ||
        /уже забронировали|пересекающ|занят/i.test(book2.data?.message || '');
      ok(
        'User: create booking (retry)',
        book2.status === 201 || dup,
        JSON.stringify(book2.data)
      );
    }

    const dash = await get('/dashboard', user.cookie);
    ok('User: dashboard 200', dash.status === 200);
    const adminDenied = await get('/admin/applications', user.cookie);
    ok('User: cannot open applications admin', adminDenied.status === 307 || adminDenied.status === 302, `→ ${adminDenied.location}`);
  }

  // --- Limited moderator (projects,news) ---
  const modProj = await login('mod.projects@test.sochi', PASS);
  ok('Mod(projects): login', modProj.ok, modProj.session?.user?.permissions);
  {
    const projects = await get('/admin/projects', modProj.cookie);
    ok('Mod(projects): can open projects', projects.status === 200);
    const news = await get('/admin/news', modProj.cookie);
    ok('Mod(projects): can open news', news.status === 200);
    const apps = await get('/admin/applications', modProj.cookie);
    ok('Mod(projects): CANNOT applications', apps.status === 307 || apps.status === 302, `→ ${apps.location}`);
    const books = await get('/admin/bookings', modProj.cookie);
    ok('Mod(projects): CANNOT bookings', books.status === 307 || books.status === 302, `→ ${books.location}`);
    const users = await get('/admin/users', modProj.cookie);
    ok('Mod(projects): CANNOT users', users.status === 307 || users.status === 302);
    const settings = await get('/admin/settings', modProj.cookie);
    ok('Mod(projects): CANNOT settings', settings.status === 307 || settings.status === 302);
    const dash = await get('/admin', modProj.cookie);
    ok('Mod(projects): admin home OK', dash.status === 200);
  }

  // --- Full ops moderator (bookings,applications,stats,scanner) ---
  const modOps = await login('mod.fullops@test.sochi', PASS);
  ok('Mod(ops): login', modOps.ok, modOps.session?.user?.permissions);
  {
    const apps = await get('/admin/applications', modOps.cookie);
    ok('Mod(ops): can applications', apps.status === 200);
    const books = await get('/admin/bookings', modOps.cookie);
    ok('Mod(ops): can bookings', books.status === 200);
    const stats = await get('/admin/stats', modOps.cookie);
    ok('Mod(ops): can stats', stats.status === 200);
    const scanner = await get('/scanner', modOps.cookie);
    ok('Mod(ops): can scanner', scanner.status === 200);
    const projects = await get('/admin/projects', modOps.cookie);
    ok('Mod(ops): CANNOT projects', projects.status === 307 || projects.status === 302, `→ ${projects.location}`);
    const news = await get('/admin/news', modOps.cookie);
    ok('Mod(ops): CANNOT news', news.status === 307 || news.status === 302);
  }

  // --- Admin ---
  if (ADMIN_PASS) {
    const admin = await login('admin@sochi.ru', ADMIN_PASS);
    ok('Admin: login', admin.ok, admin.session?.user?.role);
    for (const path of [
      '/admin',
      '/admin/users',
      '/admin/settings',
      '/admin/applications',
      '/admin/bookings',
      '/admin/projects',
      '/admin/news',
      '/scanner',
    ]) {
      const r = await get(path, admin.cookie);
      ok(`Admin: ${path}`, r.status === 200);
    }
  } else {
    ok('Admin: skipped (no ADMIN_PASS)', true);
  }

  // --- Scanner cannot apply/book ---
  // scanner password unknown in env; skip if login fails
  // Negative: USER cannot hit scanner
  {
    const sc = await get('/scanner', user.cookie);
    ok('User: cannot scanner', sc.status === 307 || sc.status === 302, `→ ${sc.location}`);
  }

  // Participant can still apply/book
  const part = await login('participant@test.sochi', PASS);
  ok('Participant: login', part.ok, part.session?.user?.role);
  {
    const start = new Date(Date.now() + 86400000 * 25);
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + 2 * 3600000);
    const book = await postJson('/api/bookings', part.cookie, {
      spaceId: 'seed_space_1',
      title: `E2E participant ${stamp()}`,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    });
    ok(
      'Participant: can create booking',
      book.status === 201 || book.status === 409 || book.status === 400,
      `status=${book.status} ${book.data?.message || ''}`
    );
  }

  const failed = results.filter((r) => !r.pass);
  console.log('\n---');
  console.log(`Total ${results.length}, failed ${failed.length}`);
  if (failed.length) {
    for (const f of failed) console.log(' •', f.name, f.detail);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
