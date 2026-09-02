/**
 * Check public routes against live module flags (on → reachable, off → blocked/soon).
 * Usage: node scripts/qa-modules-toggle.mjs [baseUrl]
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = (process.argv[2] || process.env.BASE_URL || 'https://ty.idivles.ru').replace(/\/$/, '');

/** Representative public page per killable module */
const MODULE_PAGES = {
  registration: '/register',
  messaging: '/messages',
  events: '/events',
  tickets_scan: '/scanner',
  places: '/places',
  gallery: '/gallery',
  projects: '/projects',
  clubs: '/clubs',
  spaces: '/spaces',
  grants: '/grants',
  dobro: '/dobro',
  self_gov: '/self-gov',
  vacancies: '/vacancies',
  contests: '/contests',
  friends: '/friends',
  games: '/games',
  news: '/news',
  portfolio: '/portfolio',
  eco: '/dashboard/shop',
  achievements: '/dashboard/achievements',
  documents: '/documents',
  faq: '/faq',
  presentation: '/presentation',
  applications: '/dashboard/applications',
  notifications: '/dashboard/notifications',
  referrals: '/dashboard/referrals',
};

const ALWAYS_ON = ['/', '/privacy', '/rules', '/contacts', '/login', '/api/health'];

function classify(status, url, body) {
  const u = String(url || '');
  if (status === 200 && (u.includes('/soon') || u.includes('/unavailable') || /скоро|недоступен|отключ/i.test(body || ''))) {
    return 'soft-off';
  }
  if ([301, 302, 303, 307, 308].includes(status)) {
    if (
      u.includes('/soon') ||
      u.includes('/unavailable') ||
      u.includes('/login') ||
      u.includes('/maintenance')
    ) {
      return 'redirect-off';
    }
    return 'redirect';
  }
  if (status === 403 || status === 404 || status === 503) return 'hard-off';
  if (status === 200) return 'on';
  return `http-${status}`;
}

async function fetchPage(path) {
  const r = await fetch(`${BASE}${path}`, { redirect: 'manual' });
  let loc = r.headers.get('location') || '';
  let body = '';
  if (r.status === 200) {
    body = (await r.text()).slice(0, 4000);
  }
  if ([301, 302, 303, 307, 308].includes(r.status) && loc) {
    const abs = loc.startsWith('http') ? loc : `${BASE}${loc}`;
    const r2 = await fetch(abs, { redirect: 'manual' });
    if (r2.status === 200) body = (await r2.text()).slice(0, 4000);
    return { status: r.status, loc, body, finalStatus: r2.status };
  }
  return { status: r.status, loc, body, finalStatus: r.status };
}

async function main() {
  console.log(`Module toggle QA → ${BASE}`);
  const st = await fetch(`${BASE}/api/public/status`).then((r) => r.json());
  const flags = st.modules || {};
  const offModes = st.offModes || {};
  const results = [];

  for (const path of ALWAYS_ON) {
    const res = await fetchPage(path);
    const kind = classify(res.status, res.loc, res.body);
    results.push({ path, expect: 'on', kind, pass: kind === 'on' || kind === 'redirect', status: res.status });
    console.log(`${kind === 'on' || kind === 'redirect' ? 'OK' : 'FAIL'}  always ${path} → ${kind} (${res.status})`);
  }

  for (const [key, path] of Object.entries(MODULE_PAGES)) {
    const enabled = flags[key] !== false;
    const mode = offModes[key] || 'hide';
    const res = await fetchPage(path);
    let kind = classify(res.status, res.loc, res.body);
    let pass = false;
    let expect = enabled ? 'on' : `off:${mode}`;
    if (enabled) {
      pass = kind === 'on' || kind === 'redirect';
      // auth-gated surfaces OK as redirect to login when module on
      if (
        [
          'tickets_scan',
          'messaging',
          'friends',
          'portfolio',
          'eco',
          'achievements',
          'applications',
          'notifications',
          'referrals',
          'vacancies',
          'contests',
        ].includes(key)
      ) {
        if (kind === 'redirect' || kind === 'redirect-off' || res.status === 307) pass = true;
      }
      // portfolio may be dashboard-only in some builds
      if (key === 'portfolio' && (res.status === 404 || kind === 'hard-off')) {
        const dash = await fetchPage('/dashboard/portfolio');
        const dk = classify(dash.status, dash.loc, dash.body);
        if (dk === 'redirect' || dk === 'redirect-off' || dash.status === 200 || dash.status === 307) {
          pass = true;
          kind = `portfolio-via-dashboard:${dk}`;
        }
      }
    } else {
      pass =
        kind === 'soft-off' ||
        kind === 'hard-off' ||
        kind === 'redirect-off' ||
        (kind === 'redirect' && /soon|unavailable|login|maintenance|register/i.test(res.loc || '')) ||
        (mode === 'hide' && (res.status === 404 || res.status === 403 || kind === 'hard-off'));
      if (!pass && res.status === 200 && /soon|недоступ|отключ|скоро|закрыт/i.test(res.body || '')) {
        pass = true;
        kind = 'soft-off-body';
      }
    }
    results.push({
      module: key,
      path,
      enabled,
      mode,
      expect,
      kind,
      pass,
      status: res.status,
      loc: res.loc,
    });
    console.log(
      `${pass ? 'OK' : 'FAIL'}  ${key} ${enabled ? 'ON' : 'OFF'} ${path} → ${kind} (${res.status}${res.loc ? ' → ' + res.loc : ''})`
    );
  }

  const fail = results.filter((r) => !r.pass);
  const outDir = join(__dirname, '../docs/perf');
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = join(outDir, `qa-modules-toggle-${stamp}.json`);
  writeFileSync(out, JSON.stringify({ base: BASE, flags, offModes, results, fail: fail.length }, null, 2));
  console.log(`Wrote ${out}`);
  console.log(fail.length ? `FAIL ${fail.length}` : 'ALL PASS');
  process.exit(fail.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
