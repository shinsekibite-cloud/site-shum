#!/usr/bin/env node
/**
 * Guest SEO / CWV-oriented HTTP audit (no Chrome required).
 * Usage: node scripts/seo-guest-audit.mjs [https://ty.idivles.ru]
 */
const origin = (process.argv[2] || process.env.STAGING_ORIGIN || 'https://ty.idivles.ru').replace(/\/$/, '');

const PAGES = [
  '/',
  '/projects',
  '/clubs',
  '/spaces',
  '/places',
  '/news',
  '/events',
  '/documents',
  '/privacy',
  '/rules',
  '/terms',
];

function pick(html, re) {
  const m = html.match(re);
  return m ? m[1].trim() : '';
}

async function fetchPage(path) {
  const url = `${origin}${path}`;
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'YoungPortal-seo-audit/1.0', Accept: 'text/html' },
    signal: AbortSignal.timeout(20000),
  });
  const html = await res.text();
  return {
    path,
    url,
    status: res.status,
    envHeader: res.headers.get('x-yp-env') || '',
    title: pick(html, /<title>([^<]*)<\/title>/i),
    canonical: pick(html, /rel=["']canonical["'][^>]*href=["']([^"']+)/i) || pick(html, /href=["']([^"']+)["'][^>]*rel=["']canonical["']/i),
    description: pick(html, /name=["']description["'][^>]*content=["']([^"']*)/i) || pick(html, /content=["']([^"']*)["'][^>]*name=["']description["']/i),
    jsonLd: /application\/ld\+json/i.test(html),
    viewport: /name=["']viewport["']/i.test(html),
    h1: pick(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '),
  };
}

async function main() {
  const rows = [];
  for (const path of PAGES) {
    try {
      rows.push(await fetchPage(path));
    } catch (e) {
      rows.push({ path, url: `${origin}${path}`, status: 0, error: e instanceof Error ? e.message : String(e) });
    }
  }
  const titles = new Map();
  let failed = 0;
  for (const r of rows) {
    const problems = [];
    if (r.status !== 200) problems.push(`HTTP ${r.status || r.error || 'fail'}`);
    if (r.envHeader && /staging/i.test(r.envHeader)) problems.push(`x-yp-env=${r.envHeader}`);
    if (!r.title) problems.push('no title');
    if (r.title) {
      const prev = titles.get(r.title);
      if (prev) problems.push(`duplicate title with ${prev}`);
      else titles.set(r.title, r.path);
    }
    if (!r.canonical) problems.push('no canonical');
    if (!r.description) problems.push('no description');
    if (r.path === '/' && !r.jsonLd) problems.push('no JSON-LD');
    if (!r.viewport) problems.push('no viewport');
    if (problems.length) failed += 1;
    console.log(`${r.status || 'ERR'} ${r.path}  ${problems.length ? problems.join('; ') : 'ok'}  | ${r.title || ''}`);
  }
  console.log(failed ? `\nSEO_AUDIT_ISSUES=${failed}` : '\nSEO_AUDIT_OK');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
