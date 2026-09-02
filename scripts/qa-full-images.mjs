/**
 * Full functional + image link checker against production.
 * Usage: ADMIN_PASS=... node scripts/qa-full-images.mjs
 */
const BASE = process.env.BASE_URL || 'https://young.idivles.ru';
const PASS = process.env.USER_PASS || 'TestPass2026!';
const ADMIN_PASS = process.env.ADMIN_PASS || '';

const results = [];
function record(section, name, pass, detail = '') {
  results.push({ section, name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${section}] ${name}${detail ? ' — ' + detail : ''}`);
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
      redirect: 'false',
      json: 'true',
      callbackUrl: `${BASE}/dashboard`,
    }),
    redirect: 'manual',
  });
  store(res);
  const sessionRes = await fetch(`${BASE}/api/auth/session`, {
    headers: { cookie: cookieHeader() },
  });
  store(sessionRes);
  const session = await sessionRes.json();
  return { ok: !!session?.user, cookie: cookieHeader(), session };
}

async function get(path, cookie = '') {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: 'manual',
  });
  const text = await res.text().catch(() => '');
  return { status: res.status, location: res.headers.get('location') || '', text, headers: res.headers };
}

function extractUrls(html) {
  const urls = new Set();
  const patterns = [
    /(?:src|href)=["']([^"']+)["']/gi,
    /url\((?:&quot;|&\#39;|["']?)([^)"']+)(?:&quot;|&\#39;|["']?)\)/gi,
    /\/_next\/image\?url=([^&"']+)/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(html))) {
      let u = m[1];
      if (!u || u.startsWith('data:') || u.startsWith('blob:')) continue;
      u = u
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '')
        .replace(/&#39;/g, '')
        .replace(/&lt;/g, '')
        .replace(/&gt;/g, '')
        .replace(/\\\//g, '/')
        .replace(/["']+$/g, '')
        .trim();
      try {
        u = decodeURIComponent(u);
      } catch {
        /* keep */
      }
      if (!u || u === '/' || u.includes('<')) continue;
      urls.add(u);
    }
  }
  return [...urls];
}

function abs(u) {
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  if (u.startsWith('//')) return `https:${u}`;
  if (u.startsWith('/')) return `${BASE}${u}`;
  return `${BASE}/${u}`;
}

function isImageLike(u) {
  const path = u.split('?')[0].toLowerCase();
  return (
    /\.(jpe?g|png|gif|webp|avif|svg|ico|bmp)$/i.test(path) ||
    path.includes('/_next/image') ||
    path.includes('/uploads/') ||
    path.includes('/hero-bg') ||
    path.includes('/icons/')
  );
}

async function headOrGet(url) {
  try {
    let res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: 'GET', redirect: 'follow', headers: { Range: 'bytes=0-0' } });
    }
    // Some servers block HEAD; fallback GET
    if (!res.ok && res.status !== 206) {
      res = await fetch(url, { method: 'GET', redirect: 'follow' });
    }
    return { status: res.status, ok: res.ok || res.status === 206, ct: res.headers.get('content-type') || '' };
  } catch (e) {
    return { status: 0, ok: false, ct: '', err: String(e.message || e) };
  }
}

async function checkPageImages(label, path, cookie = '') {
  const page = await get(path, cookie);
  const okStatus = page.status === 200;
  record('pages', `${label} ${path}`, okStatus, `status=${page.status}${page.location ? ' → ' + page.location : ''}`);
  if (!okStatus) return { broken: [], checked: 0 };

  const urls = extractUrls(page.text).filter(isImageLike);
  const broken = [];
  let checked = 0;
  // de-dupe absolute
  const uniq = [...new Set(urls.map(abs))];
  for (const u of uniq) {
    // skip huge external analytics
    if (/mc\.yandex|google-analytics|doubleclick/i.test(u)) continue;
    checked++;
    const r = await headOrGet(u);
    if (!r.ok) {
      broken.push({ u, status: r.status, err: r.err });
      record('images', `${label}: ${u.replace(BASE, '')}`, false, `status=${r.status} ${r.err || r.ct}`);
    }
  }
  if (broken.length === 0) {
    record('images', `${label}: all image URLs OK`, true, `n=${checked}`);
  }
  return { broken, checked, urls: uniq };
}

async function main() {
  console.log(`QA full + images @ ${BASE}\n`);

  // Static assets
  for (const p of [
    '/hero-bg.jpg',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/apple-touch-icon.png',
    '/manifest.webmanifest',
    '/favicon.ico',
    '/sw.js',
    '/offline.html',
  ]) {
    const r = await headOrGet(`${BASE}${p}`);
    record('static', p, r.ok, `status=${r.status} ${r.ct}`);
  }

  // Public pages
  const publicPaths = [
    ['Home', '/'],
    ['Projects', '/projects'],
    ['Clubs', '/clubs'],
    ['Spaces', '/spaces'],
    ['News', '/news'],
    ['Events', '/events'],
    ['Contacts', '/contacts'],
    ['Privacy', '/privacy'],
    ['Dobro', '/dobro'],
    ['Self-gov', '/self-gov'],
    ['Grants', '/grants'],
    ['Search', '/search?q=молодеж'],
    ['Login', '/login'],
    ['Register', '/register'],
    ['Forgot', '/forgot-password'],
    ['About redirect', '/about'],
    ['Documents redirect', '/documents'],
  ];

  const allBroken = [];
  for (const [label, path] of publicPaths) {
    // redirects: accept 301/302/307/308
    if (['/about', '/documents'].includes(path)) {
      const page = await get(path);
      record(
        'pages',
        `${label} ${path}`,
        [301, 302, 307, 308].includes(page.status),
        `status=${page.status} → ${page.location}`
      );
      continue;
    }
    if (path === '/events') {
      const page = await get(path);
      // may be 200 or redirect to login depending on settings
      record(
        'pages',
        `${label} ${path}`,
        page.status === 200 || [301, 302, 307, 308].includes(page.status),
        `status=${page.status}${page.location ? ' → ' + page.location : ''}`
      );
      if (page.status === 200) {
        const r = await checkPageImages(label, path);
        allBroken.push(...r.broken);
      }
      continue;
    }
    const r = await checkPageImages(label, path);
    allBroken.push(...r.broken);
  }

  // Discover detail IDs from list HTML
  async function idsFrom(listPath, re) {
    const page = await get(listPath);
    const ids = new Set();
    let m;
    const rx = new RegExp(re, 'g');
    while ((m = rx.exec(page.text))) ids.add(m[1]);
    return [...ids].slice(0, 8);
  }

  const projectIds = await idsFrom('/projects', String.raw`/projects/([a-zA-Z0-9_-]+)`);
  const clubIds = await idsFrom('/clubs', String.raw`/clubs/([a-zA-Z0-9_-]+)`);
  const spaceIds = await idsFrom('/spaces', String.raw`/spaces/([a-zA-Z0-9_-]+)`);

  record('discover', `projects found`, projectIds.length > 0, projectIds.join(',') || 'none');
  record('discover', `clubs found`, clubIds.length > 0, clubIds.join(',') || 'none');
  record('discover', `spaces found`, spaceIds.length > 0, spaceIds.join(',') || 'none');

  for (const id of projectIds) {
    const r = await checkPageImages(`Project ${id}`, `/projects/${id}`);
    allBroken.push(...r.broken);
  }
  for (const id of clubIds) {
    const r = await checkPageImages(`Club ${id}`, `/clubs/${id}`);
    allBroken.push(...r.broken);
  }
  for (const id of spaceIds) {
    const r = await checkPageImages(`Space ${id}`, `/spaces/${id}`);
    allBroken.push(...r.broken);
  }

  // CMS pages from sitemap or known slugs
  const cmsSlugs = ['about', 'grants', 'documents'];
  const sitemap = await get('/sitemap.xml');
  const slugRe = /\/p\/([a-zA-Z0-9_-]+)/g;
  let m;
  while ((m = slugRe.exec(sitemap.text || ''))) cmsSlugs.push(m[1]);
  for (const slug of [...new Set(cmsSlugs)].slice(0, 12)) {
    const r = await checkPageImages(`CMS ${slug}`, `/p/${slug}`);
    allBroken.push(...r.broken);
  }

  // Auth flows
  const guestDash = await get('/dashboard');
  record('auth', 'Guest dashboard redirects', [301, 302, 307, 308].includes(guestDash.status), `→ ${guestDash.location}`);

  const user = await login('guestuser@test.sochi', PASS);
  record('auth', 'User login', user.ok, user.session?.user?.role || user.session?.user?.email);

  if (user.ok) {
    for (const [label, path] of [
      ['Dashboard', '/dashboard'],
      ['Book page', spaceIds[0] ? `/spaces/${spaceIds[0]}/book` : null],
    ].filter((x) => x[1])) {
      const r = await checkPageImages(label, path, user.cookie);
      allBroken.push(...r.broken);
    }
  }

  const participant = await login('participant@test.sochi', PASS);
  record('auth', 'Participant login', participant.ok, participant.session?.user?.role);

  const modOps = await login('mod.fullops@test.sochi', PASS);
  record('auth', 'Mod ops login', modOps.ok, modOps.session?.user?.permissions);

  if (modOps.ok) {
    for (const path of ['/admin', '/admin/bookings', '/admin/applications', '/admin/stats', '/scanner']) {
      const r = await checkPageImages(`ModOps ${path}`, path, modOps.cookie);
      allBroken.push(...r.broken);
    }
  }

  const modProj = await login('mod.projects@test.sochi', PASS);
  record('auth', 'Mod projects login', modProj.ok, modProj.session?.user?.permissions);
  if (modProj.ok) {
    for (const path of ['/admin/projects', '/admin/news', '/admin/clubs', '/admin/spaces']) {
      const page = await get(path, modProj.cookie);
      const allowed = path.includes('projects') || path.includes('news');
      if (allowed) {
        record('acl', `ModProj can ${path}`, page.status === 200, `status=${page.status}`);
        if (page.status === 200) {
          const r = await checkPageImages(`ModProj ${path}`, path, modProj.cookie);
          allBroken.push(...r.broken);
        }
      } else {
        record(
          'acl',
          `ModProj denied ${path}`,
          [301, 302, 307, 308].includes(page.status) || page.status === 403,
          `status=${page.status} → ${page.location}`
        );
      }
    }
  }

  if (ADMIN_PASS) {
    const admin = await login('admin@sochi.ru', ADMIN_PASS);
    record('auth', 'Admin login', admin.ok, admin.session?.user?.role);
    if (admin.ok) {
      for (const path of [
        '/admin',
        '/admin/users',
        '/admin/projects',
        '/admin/clubs',
        '/admin/spaces',
        '/admin/news',
        '/admin/pages',
        '/admin/bookings',
        '/admin/applications',
        '/admin/stats',
        '/admin/settings',
        '/scanner',
      ]) {
        const r = await checkPageImages(`Admin ${path}`, path, admin.cookie);
        allBroken.push(...r.broken);
      }
    }
  } else {
    record('auth', 'Admin login skipped (no ADMIN_PASS)', false);
  }

  // Health / maps
  const health = await get('/api/health');
  record('api', '/api/health', health.status === 200, health.text.slice(0, 120));

  const maps = await get('/api/maps/place?q=Сочи');
  record('api', '/api/maps/place redirect', [301, 302, 307, 308].includes(maps.status), `→ ${maps.location}`);

  // Collect unique broken
  console.log('\n=== SUMMARY ===');
  const failed = results.filter((r) => !r.pass);
  const bySection = {};
  for (const r of results) {
    bySection[r.section] = bySection[r.section] || { pass: 0, fail: 0 };
    bySection[r.section][r.pass ? 'pass' : 'fail']++;
  }
  for (const [s, c] of Object.entries(bySection)) {
    console.log(`${s}: ${c.pass} pass, ${c.fail} fail`);
  }
  console.log(`Total ${results.length}, failed ${failed.length}`);
  if (failed.length) {
    console.log('\nFAILURES:');
    for (const f of failed) console.log(` - [${f.section}] ${f.name} — ${f.detail}`);
  }
  if (allBroken.length) {
    console.log(`\nBroken image URLs (${allBroken.length}):`);
    for (const b of allBroken) console.log(` - ${b.u} (${b.status})`);
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
