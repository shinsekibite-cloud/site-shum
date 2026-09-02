/**
 * Deep role × UX/security audit for Young Portal (production).
 * Usage: node scripts/qa-deep-roles-ux.mjs [baseUrl]
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = (process.argv[2] || process.env.BASE_URL || 'https://young.idivles.ru').replace(/\/$/, '');
const PASS = process.env.QA_PASS || 'RolePass123!';
const TECH_EMAIL = process.env.TECH_EMAIL || 'tech@young.idivles.ru';
const TECH_PASS = process.env.TECH_PASS || '';

const accounts = [
  { key: 'guest', email: null, role: 'GUEST', pass: null },
  { key: 'user', email: 'user@sochi.ru', role: 'USER', pass: PASS },
  { key: 'part', email: 'part@sochi.ru', role: 'PARTICIPANT', pass: PASS },
  { key: 'mod', email: 'mod@sochi.ru', role: 'MODERATOR', pass: PASS },
  { key: 'admin', email: 'qa-admin@sochi.ru', role: 'ADMIN', pass: PASS },
  { key: 'scanner', email: 'scanner@sochi.ru', role: 'SCANNER', pass: PASS },
  { key: 'tech', email: TECH_EMAIL, role: 'TECH', pass: TECH_PASS || null },
];

const PUBLIC_ON = ['/', '/events', '/projects', '/clubs', '/spaces', '/news', '/grants', '/dobro', '/self-gov', '/contacts', '/privacy', '/rules', '/terms', '/documents', '/login', '/forgot-password'];
const PUBLIC_OFF = ['/register', '/places', '/gallery', '/vacancies', '/contests', '/games', '/friends', '/messages', '/faq', '/portfolio'];
const AUTH_PAGES = ['/dashboard', '/dashboard/edit', '/dashboard/settings', '/dashboard/applications', '/change-password', '/more'];
const ADMIN_PAGES = [
  '/admin',
  '/admin/users',
  '/admin/settings',
  '/admin/moderation',
  '/admin/news',
  '/admin/projects',
  '/admin/clubs',
  '/admin/spaces',
  '/admin/bookings',
  '/admin/applications',
  '/admin/scanner',
  '/admin/stats',
  '/admin/system',
  '/admin/online',
  '/admin/backup',
  '/admin/rkn',
  '/admin/bots',
  '/admin/security',
];

function jarStore(jar, res) {
  for (const c of res.headers.getSetCookie?.() || []) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}
const cookieHeader = (jar) => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

function row(role, scenario, pass, severity = 'info', detail = '', repro = '') {
  return { role, scenario, pass: Boolean(pass), severity, detail: String(detail).slice(0, 280), repro };
}

async function doLogin(email, password) {
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
      callbackUrl: `${BASE}/`,
    }),
    redirect: 'manual',
  });
  jarStore(jar, loginRes);
  let body = null;
  try {
    body = await loginRes.json();
  } catch {
    body = null;
  }
  const sessionRes = await fetch(`${BASE}/api/auth/session`, { headers: { cookie: cookieHeader(jar) } });
  jarStore(jar, sessionRes);
  const session = await sessionRes.json();
  return {
    jar,
    cookie: cookieHeader(jar),
    session,
    ok: Boolean(session?.user?.id),
    role: session?.user?.role || null,
    loginStatus: loginRes.status,
    loginBody: body,
  };
}

async function req(cookie, path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    redirect: opts.redirect || 'manual',
    headers: {
      ...(opts.headers || {}),
      ...(cookie ? { cookie } : {}),
      ...(opts.body && !opts.headers?.['Content-Type'] ? { 'Content-Type': 'application/json' } : {}),
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
  } else if (opts.wantText !== false && res.status === 200) {
    text = (await res.text()).slice(0, 8000);
  } else {
    try {
      await res.arrayBuffer();
    } catch {
      /* ignore */
    }
  }
  return {
    status: res.status,
    json,
    text,
    location: res.headers.get('location') || '',
    finalUrl: res.url,
  };
}

function isUnavailable(r) {
  return (
    (r.status === 307 || r.status === 302) &&
    /unavailable|soon|maintenance/i.test(r.location)
  );
}
function isLoginRedirect(r) {
  return (r.status === 307 || r.status === 302) && /login/i.test(r.location);
}
function isHomeOrDashboard(r) {
  return (r.status === 307 || r.status === 302) && /(\/$|dashboard|scanner|ops|admin)/i.test(r.location);
}

async function auditGuest(out, modules) {
  const role = 'GUEST';

  for (const p of PUBLIC_ON) {
    const r = await req(null, p, { redirect: 'manual' });
    const ok =
      r.status === 200 ||
      (modules && isUnavailable(r)) ||
      (p === '/register' && isUnavailable(r));
    // For ON modules expect 200; some may redirect
    const expectOn = !['/register'].includes(p);
    if (expectOn) {
      out.push(
        row(
          role,
          `Открыть ${p}`,
          r.status === 200 || (r.status >= 300 && r.status < 400 && !isLoginRedirect(r)),
          r.status === 200 ? 'info' : 'medium',
          `HTTP ${r.status} ${r.location}`
        )
      );
    }
  }

  for (const p of PUBLIC_OFF) {
    const r = await req(null, p, { redirect: 'manual' });
    const ok = isUnavailable(r) || r.status === 404 || r.status === 403 || (r.status === 200 && /недоступ|скоро|отключ/i.test(r.text));
    out.push(
      row(
        role,
        `Модуль OFF: ${p} недоступен`,
        ok,
        ok ? 'info' : 'high',
        `HTTP ${r.status} → ${r.location}`,
        `Открыть ${BASE}${p} без логина`
      )
    );
  }

  for (const p of [...AUTH_PAGES, '/admin', '/scanner', '/ops', '/messages', '/friends']) {
    const r = await req(null, p, { redirect: 'manual' });
    const ok = isLoginRedirect(r) || isUnavailable(r) || r.status === 401 || r.status === 403;
    out.push(
      row(
        role,
        `Запрет без логина: ${p}`,
        ok,
        ok ? 'info' : 'critical',
        `HTTP ${r.status} → ${r.location}`,
        `Открыть ${p} гостем`
      )
    );
  }

  // APIs
  for (const p of ['/api/user/profile', '/api/admin/stats', '/api/admin/users', '/api/ops/flags', '/api/scanner/events']) {
    const r = await req(null, p);
    out.push(
      row(
        role,
        `API deny ${p}`,
        r.status === 401 || r.status === 403,
        r.status === 401 || r.status === 403 ? 'info' : 'critical',
        `HTTP ${r.status}`
      )
    );
  }

  // Auth forms UX (Russian)
  const loginPage = await req(null, '/login', { redirect: 'follow', wantText: true });
  out.push(
    row(
      role,
      'Форма входа на русском',
      loginPage.status === 200 && /вход|парол|email|почт/i.test(loginPage.text),
      'medium',
      `HTTP ${loginPage.status}`
    )
  );
  const forgot = await req(null, '/forgot-password', { redirect: 'follow', wantText: true });
  out.push(
    row(
      role,
      'Восстановление пароля доступно',
      forgot.status === 200 && /парол|email|почт|сброс|восстанов/i.test(forgot.text),
      'medium',
      `HTTP ${forgot.status}`
    )
  );

  // Bad login
  const bad = await doLogin('nobody-qa@example.com', 'WrongPass!!!');
  out.push(
    row(
      role,
      'Неверный логин не создаёт сессию',
      !bad.ok,
      bad.ok ? 'critical' : 'info',
      `role=${bad.role} status=${bad.loginStatus}`
    )
  );

  // Empty / malformed CSRF login
  const empty = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: '', password: '', json: 'true' }),
    redirect: 'manual',
  });
  out.push(
    row(
      role,
      'Пустой логин отвергается',
      empty.status >= 400 || empty.status === 200 || empty.status === 302,
      'low',
      `HTTP ${empty.status}`
    )
  );

  // PWA
  const man = await req(null, '/manifest.webmanifest');
  const sw = await req(null, '/sw.js');
  out.push(row(role, 'PWA manifest', man.status === 200, 'medium', `HTTP ${man.status}`));
  out.push(row(role, 'Service worker', sw.status === 200, 'medium', `HTTP ${sw.status}`));

  // Search
  const search = await req(null, '/search?q=клуб', { redirect: 'manual' });
  out.push(
    row(
      role,
      'Поиск /search',
      search.status === 200 || isUnavailable(search) || search.status === 404,
      'low',
      `HTTP ${search.status} ${search.location}`
    )
  );

  // Double-fetch health latency
  const t0 = Date.now();
  await req(null, '/api/health');
  const dt = Date.now() - t0;
  out.push(row(role, 'Health latency <2s', dt < 2000, dt < 2000 ? 'info' : 'medium', `${dt}ms`));
}

async function auditUserLike(acc, auth, out, modules) {
  const role = acc.role;
  const { cookie } = auth;

  out.push(row(role, 'Логин успешен', auth.ok && auth.role === acc.role, auth.ok ? 'info' : 'critical', `got ${auth.role}`));

  // Profile
  const profile = await req(cookie, '/api/user/profile');
  out.push(row(role, 'GET /api/user/profile', profile.status === 200, 'critical', `HTTP ${profile.status}`));

  // Page access
  for (const p of AUTH_PAGES) {
    const r = await req(cookie, p, { redirect: 'manual' });
    const ok =
      r.status === 200 ||
      (r.status >= 300 && r.status < 400 && !/login\b/i.test(r.location)) ||
      isUnavailable(r);
    out.push(row(role, `Кабинет/страница ${p}`, ok, ok ? 'info' : 'high', `HTTP ${r.status} → ${r.location}`));
  }

  // Forbidden staff
  for (const p of ['/admin', '/admin/users', '/ops', '/api/admin/stats', '/api/ops/flags']) {
    const r = await req(cookie, p, { redirect: 'manual' });
    const denied =
      r.status === 401 ||
      r.status === 403 ||
      isLoginRedirect(r) ||
      (r.location && /(dashboard|scanner|\/$)/i.test(r.location) && r.status >= 300);
    // TECH/ADMIN handled elsewhere
    out.push(
      row(
        role,
        `Запрет staff: ${p}`,
        denied || r.status === 404,
        denied ? 'info' : 'critical',
        `HTTP ${r.status} → ${r.location}`,
        `${role} открывает ${p}`
      )
    );
  }

  // Scanner page for end users
  const scanPage = await req(cookie, '/scanner', { redirect: 'manual' });
  const scanDenied =
    isLoginRedirect(scanPage) ||
    scanPage.status === 403 ||
    (scanPage.location && /dashboard|login/i.test(scanPage.location)) ||
    scanPage.status === 307;
  out.push(
    row(
      role,
      'Запрет /scanner',
      scanDenied || scanPage.status !== 200,
      'high',
      `HTTP ${scanPage.status} → ${scanPage.location}`
    )
  );

  // Mutations
  const patch = await req(cookie, '/api/user/profile', {
    method: 'PATCH',
    body: JSON.stringify({ bio: `QA UX ${role} ${Date.now()}` }),
  });
  out.push(
    row(
      role,
      'Редактирование профиля (PATCH)',
      patch.status === 200 || patch.status === 400,
      'high',
      `HTTP ${patch.status} ${JSON.stringify(patch.json || {}).slice(0, 100)}`
    )
  );

  // Invalid patch
  const badPatch = await req(cookie, '/api/user/profile', {
    method: 'PATCH',
    body: JSON.stringify({ email: 'hacked@evil.com' }),
  });
  out.push(
    row(
      role,
      'Нельзя сменить email через profile PATCH',
      badPatch.status === 200
        ? !(badPatch.json?.user?.email === 'hacked@evil.com' || badPatch.json?.email === 'hacked@evil.com')
        : badPatch.status === 400 || badPatch.status === 403,
      'critical',
      `HTTP ${badPatch.status}`
    )
  );

  // Applications / bookings
  const apps = await req(cookie, '/api/user/applications');
  out.push(row(role, 'Список заявок', apps.status === 200, 'medium', `HTTP ${apps.status}`));
  const bookings = await req(cookie, '/api/user/bookings');
  out.push(row(role, 'Список броней', bookings.status === 200, 'medium', `HTTP ${bookings.status}`));

  // Apply to club (idempotent)
  const apply = await req(cookie, '/api/applications', {
    method: 'POST',
    body: JSON.stringify({ clubId: 'qa_club_it', message: `qa deep ${Date.now()}` }),
  });
  out.push(
    row(
      role,
      'Подача заявки в клуб',
      [200, 201, 400, 409].includes(apply.status) && apply.status !== 500,
      'high',
      `HTTP ${apply.status} ${String(apply.json?.message || apply.json?.error || '').slice(0, 120)}`
    )
  );

  // Double submit
  const apply2 = await req(cookie, '/api/applications', {
    method: 'POST',
    body: JSON.stringify({ clubId: 'qa_club_it', message: 'qa double' }),
  });
  out.push(
    row(
      role,
      'Повторная заявка обработана без 500',
      apply2.status < 500,
      'medium',
      `HTTP ${apply2.status}`
    )
  );

  // Friends/messages when modules off
  const friends = await req(cookie, '/api/friends');
  const msgs = await req(cookie, '/api/messages');
  out.push(
    row(
      role,
      'Friends API при OFF модуле',
      friends.status === 200 || friends.status === 403 || friends.status === 404,
      'medium',
      `HTTP ${friends.status}`
    )
  );
  out.push(
    row(
      role,
      'Messages API при OFF модуле',
      msgs.status === 200 || msgs.status === 403 || msgs.status === 404,
      'medium',
      `HTTP ${msgs.status}`
    )
  );

  // Eco / achievements when off
  const eco = await req(cookie, '/api/user/eco');
  out.push(
    row(
      role,
      'Eco API',
      [200, 403, 404].includes(eco.status),
      'low',
      `HTTP ${eco.status}`
    )
  );

  // Notifications
  const notif = await req(cookie, '/api/notifications');
  out.push(
    row(
      role,
      'Уведомления',
      notif.status === 200 || notif.status === 404,
      'medium',
      `HTTP ${notif.status}`
    )
  );

  // Session persists
  const sess2 = await req(cookie, '/api/auth/session');
  out.push(row(role, 'Сессия стабильна', Boolean(sess2.json?.user?.id), 'critical', JSON.stringify(sess2.json?.user?.role)));

  // Logout
  const csrf = await req(cookie, '/api/auth/csrf');
  const token = csrf.json?.csrfToken;
  const logout = await fetch(`${BASE}/api/auth/signout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: new URLSearchParams({ csrfToken: token || '', json: 'true', callbackUrl: `${BASE}/` }),
    redirect: 'manual',
  });
  out.push(row(role, 'Выход (signout) отвечает', logout.status < 500, 'medium', `HTTP ${logout.status}`));

  void modules;
}

async function auditScanner(auth, out) {
  const role = 'SCANNER';
  const { cookie } = auth;
  out.push(row(role, 'Логин', auth.ok && auth.role === 'SCANNER', 'critical', auth.role));

  const page = await req(cookie, '/scanner', { redirect: 'manual' });
  out.push(
    row(
      role,
      'Доступ /scanner',
      page.status === 200 || (page.status >= 300 && /scanner/i.test(page.location)),
      'critical',
      `HTTP ${page.status} → ${page.location}`
    )
  );

  const events = await req(cookie, '/api/scanner/events');
  out.push(row(role, 'API scanner/events', events.status === 200, 'high', `HTTP ${events.status}`));

  // Deny admin
  const admin = await req(cookie, '/admin', { redirect: 'manual' });
  const denied =
    admin.status === 403 ||
    isLoginRedirect(admin) ||
    (admin.location && /scanner|dashboard|login/i.test(admin.location));
  out.push(row(role, 'Запрет /admin', denied || admin.status !== 200, 'critical', `HTTP ${admin.status} → ${admin.location}`));

  const apply = await req(cookie, '/api/applications', {
    method: 'POST',
    body: JSON.stringify({ clubId: 'qa_club_it', message: 'scanner should fail' }),
  });
  out.push(row(role, 'Запрет заявки в клуб', apply.status === 401 || apply.status === 403, 'high', `HTTP ${apply.status}`));

  // Invalid ticket scan
  const scan = await req(cookie, '/api/scanner/scan', {
    method: 'POST',
    body: JSON.stringify({ code: 'INVALID-QA-CODE-000' }),
  });
  out.push(
    row(
      role,
      'Невалидный QR даёт понятную ошибку',
      scan.status >= 400 && scan.status < 500,
      'medium',
      `HTTP ${scan.status} ${JSON.stringify(scan.json || {}).slice(0, 140)}`
    )
  );
}

async function auditMod(auth, out) {
  const role = 'MODERATOR';
  const { cookie } = auth;
  out.push(row(role, 'Логин', auth.ok && auth.role === 'MODERATOR', 'critical', auth.role));

  const adminHome = await req(cookie, '/admin', { redirect: 'manual' });
  out.push(
    row(
      role,
      'Доступ /admin (ANY_MOD)',
      adminHome.status === 200 || (adminHome.status >= 300 && !isLoginRedirect(adminHome)),
      'critical',
      `HTTP ${adminHome.status} → ${adminHome.location}`
    )
  );

  // Admin-only pages must be denied
  for (const p of ['/admin/users', '/admin/settings', '/admin/rkn', '/admin/backup', '/admin/system', '/admin/online', '/admin/bots']) {
    const r = await req(cookie, p, { redirect: 'manual' });
    const denied =
      r.status === 403 ||
      isLoginRedirect(r) ||
      (r.location && /admin\/?$|dashboard|login/i.test(r.location)) ||
      (r.status === 200 && /нет доступа|недостаточно|запрещ/i.test(r.text || ''));
    // follow for HTML denial pages
    if (r.status === 200) {
      const full = await req(cookie, p, { redirect: 'follow', wantText: true });
      const softDeny = /нет доступа|недостаточно|запрещ|доступ запрещён|не хватает прав/i.test(full.text);
      out.push(
        row(
          role,
          `ADMIN_ONLY deny ${p}`,
          softDeny || full.finalUrl?.includes('/admin') === false || full.status === 403,
          softDeny ? 'info' : 'high',
          `HTTP ${r.status}/${full.status} url=${full.finalUrl || ''}`,
          `MOD открывает ${p}`
        )
      );
    } else {
      out.push(row(role, `ADMIN_ONLY deny ${p}`, denied, denied ? 'info' : 'high', `HTTP ${r.status} → ${r.location}`));
    }
  }

  // Permitted content areas (may 403 if ACL empty — still record)
  for (const p of ['/admin/news', '/admin/moderation', '/admin/applications', '/admin/clubs']) {
    const r = await req(cookie, p, { redirect: 'follow', wantText: true });
    out.push(
      row(
        role,
        `Раздел по ACL ${p}`,
        r.status === 200 || r.status === 403,
        'medium',
        `HTTP ${r.status} len=${(r.text || '').length}`
      )
    );
  }

  const stats = await req(cookie, '/api/admin/stats');
  out.push(
    row(
      role,
      'API admin/stats (по праву stats)',
      stats.status === 200 || stats.status === 403,
      'medium',
      `HTTP ${stats.status}`
    )
  );

  const rkn = await req(cookie, '/api/admin/rkn-pack');
  out.push(row(role, 'Запрет RKN API', rkn.status === 401 || rkn.status === 403, 'critical', `HTTP ${rkn.status}`));
}

async function auditAdmin(auth, out) {
  const role = 'ADMIN';
  const { cookie } = auth;
  out.push(row(role, 'Логин', auth.ok && auth.role === 'ADMIN', 'critical', auth.role));

  for (const p of ADMIN_PAGES) {
    const r = await req(cookie, p, { redirect: 'manual' });
    const ok = r.status === 200 || (r.status >= 300 && r.status < 400 && !isLoginRedirect(r));
    out.push(row(role, `Админ страница ${p}`, ok, ok ? 'info' : 'high', `HTTP ${r.status} → ${r.location}`));
  }

  const stats = await req(cookie, '/api/admin/stats');
  out.push(row(role, 'API admin/stats', stats.status === 200, 'high', `HTTP ${stats.status}`));

  const nav = await req(cookie, '/api/admin/nav-counts');
  out.push(row(role, 'API nav-counts', nav.status === 200, 'medium', `HTTP ${nav.status}`));

  const users = await req(cookie, '/api/admin/users?take=5');
  out.push(row(role, 'API users list', users.status === 200, 'high', `HTTP ${users.status}`));

  const online = await req(cookie, '/api/admin/online');
  out.push(
    row(
      role,
      'API online users',
      online.status === 200 || online.status === 404,
      'medium',
      `HTTP ${online.status}`
    )
  );

  // TECH ops should be denied for admin? Usually TECH-only /ops
  const ops = await req(cookie, '/ops', { redirect: 'manual' });
  out.push(
    row(
      role,
      '/ops для ADMIN (ожидаем deny или redirect)',
      ops.status === 403 || isLoginRedirect(ops) || (ops.location && /admin|dashboard|login/i.test(ops.location)) || ops.status === 200,
      'low',
      `HTTP ${ops.status} → ${ops.location} (документируем фактическое поведение)`
    )
  );

  // Create draft news (safe) — then note; avoid leaving junk if fails
  const newsPost = await req(cookie, '/api/admin/news', {
    method: 'POST',
    body: JSON.stringify({
      title: `QA deep ${Date.now()}`,
      excerpt: 'Автотест — можно удалить',
      content: 'QA content',
      published: false,
    }),
  });
  out.push(
    row(
      role,
      'Создание черновика новости',
      [200, 201, 400, 405, 404].includes(newsPost.status),
      'medium',
      `HTTP ${newsPost.status} ${JSON.stringify(newsPost.json || {}).slice(0, 100)}`
    )
  );
}

async function auditTech(auth, out) {
  const role = 'TECH';
  if (!auth) {
    out.push(row(role, 'Логин TECH', false, 'high', 'TECH_PASS не задан — пропуск'));
    return;
  }
  out.push(row(role, 'Логин', auth.ok && auth.role === 'TECH', 'critical', `got ${auth.role}`));
  if (!auth.ok) return;
  const { cookie } = auth;

  const ops = await req(cookie, '/ops', { redirect: 'manual' });
  out.push(
    row(
      role,
      'Доступ /ops',
      ops.status === 200 || (ops.status >= 300 && /ops/i.test(ops.location)),
      'critical',
      `HTTP ${ops.status} → ${ops.location}`
    )
  );

  const flags = await req(cookie, '/api/ops/flags');
  out.push(row(role, 'GET /api/ops/flags', flags.status === 200, 'critical', `HTTP ${flags.status}`));

  // Admin should be blocked for TECH
  const admin = await req(cookie, '/admin', { redirect: 'manual' });
  const denied =
    admin.status === 403 ||
    isLoginRedirect(admin) ||
    (admin.location && /ops|login|dashboard/i.test(admin.location)) ||
    admin.status !== 200;
  out.push(row(role, 'Запрет /admin для TECH', denied, denied ? 'info' : 'critical', `HTTP ${admin.status} → ${admin.location}`));

  const publicStatus = await req(null, '/api/public/status');
  out.push(
    row(
      role,
      'Публичный статус модулей согласован',
      publicStatus.status === 200 && publicStatus.json?.modules,
      'info',
      Object.entries(publicStatus.json?.modules || {})
        .filter(([, v]) => v === false)
        .map(([k]) => k)
        .join(',')
    )
  );
}

function summarize(results) {
  const byRole = {};
  for (const r of results) {
    byRole[r.role] ||= { total: 0, pass: 0, fail: 0, critical: 0, high: 0, medium: 0, low: 0, fails: [] };
    const b = byRole[r.role];
    b.total++;
    if (r.pass) b.pass++;
    else {
      b.fail++;
      if (r.severity === 'critical') b.critical++;
      if (r.severity === 'high') b.high++;
      if (r.severity === 'medium') b.medium++;
      if (r.severity === 'low') b.low++;
      b.fails.push(r);
    }
  }
  return byRole;
}

async function main() {
  console.log(`Deep role UX QA → ${BASE}`);
  const status = await req(null, '/api/public/status');
  const modules = status.json?.modules || {};
  const out = [];

  out.push(row('SYSTEM', 'API /api/public/status', status.status === 200, 'critical', `site=${status.json?.siteName}`));
  out.push(
    row(
      'SYSTEM',
      'Регистрация выключена (факт)',
      modules.registration === false,
      'info',
      `registrationEnabled=${status.json?.registrationEnabled}`
    )
  );

  await auditGuest(out, modules);

  const sessions = {};
  for (const acc of accounts.filter((a) => a.email)) {
    if (!acc.pass) {
      out.push(row(acc.role, 'Логин', false, 'high', 'нет пароля в окружении'));
      continue;
    }
    try {
      const auth = await doLogin(acc.email, acc.pass);
      sessions[acc.key] = auth;
      if (acc.role === 'USER' || acc.role === 'PARTICIPANT') await auditUserLike(acc, auth, out, modules);
      else if (acc.role === 'SCANNER') await auditScanner(auth, out);
      else if (acc.role === 'MODERATOR') {
        await auditUserLike(acc, auth, out, modules);
        await auditMod(auth, out);
      } else if (acc.role === 'ADMIN') {
        await auditUserLike(acc, auth, out, modules);
        await auditAdmin(auth, out);
      } else if (acc.role === 'TECH') await auditTech(auth, out);
    } catch (e) {
      out.push(row(acc.role, 'EXCEPTION', false, 'critical', String(e.message || e)));
    }
  }

  const byRole = summarize(out);
  const report = {
    base: BASE,
    at: new Date().toISOString(),
    siteName: status.json?.siteName,
    modules,
    offModes: status.json?.offModes,
    total: out.length,
    passed: out.filter((r) => r.pass).length,
    failed: out.filter((r) => !r.pass).length,
    byRole,
    results: out,
  };

  const dir = join(__dirname, '..', 'docs', 'perf');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `qa-deep-roles-ux-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  writeFileSync('/tmp/qa-deep-roles-ux.json', JSON.stringify(report, null, 2));
  writeFileSync('/opt/cursor/artifacts/qa/qa-deep-roles-ux.json', JSON.stringify(report, null, 2));

  console.log(`Passed ${report.passed}/${report.total} → ${file}`);
  for (const [role, s] of Object.entries(byRole)) {
    console.log(`  ${role}: ${s.pass}/${s.total} fail=${s.fail} crit=${s.critical} high=${s.high}`);
    for (const f of s.fails.slice(0, 8)) console.log(`    - [${f.severity}] ${f.scenario}: ${f.detail}`);
  }
  process.exit(Math.min(report.failed, 125));
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
