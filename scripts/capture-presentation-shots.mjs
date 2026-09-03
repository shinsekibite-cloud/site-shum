#!/usr/bin/env node
/**
 * Capture clean desktop screenshots (no DevTools, menu visible).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public/presentation/deck/media');
const BASE = (process.env.BASE_URL || 'https://young.idivles.ru').replace(/\/$/, '');

const SHOTS = [
  { file: '01-home.png', path: '/', wait: 'text=Твой город' },
  { file: '02-clubs.png', path: '/clubs', wait: 'text=Клубы' },
  { file: '03-spaces.png', path: '/spaces', wait: 'text=Пространства' },
  { file: '04-news.png', path: '/news', wait: 'text=Новости' },
  { file: '05-projects.png', path: '/projects', wait: 'text=Проекты' },
  { file: '12-about.png', path: '/p/about', wait: null },
  { file: '13-grants.png', path: '/grants', wait: null },
  { file: '14-dobro.png', path: '/dobro', wait: null },
  { file: '15-contacts.png', path: '/contacts', wait: null },
  { file: '16-documents.png', path: '/documents', wait: null },
  { file: '10-games.png', path: '/games', wait: null },
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  locale: 'ru-RU',
});
const page = await context.newPage();

for (const shot of SHOTS) {
  const url = `${BASE}${shot.path}`;
  process.stdout.write(`shot ${shot.file} ${url}… `);
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    // Dismiss cookie/consent banners if present
    for (const sel of [
      'button:has-text("Принять")',
      'button:has-text("Согласен")',
      'button:has-text("Сохранить")',
      'button:has-text("Хорошо")',
      'button:has-text("Понятно")',
      'button:has-text("OK")',
      '[data-consent-accept]',
      '.cookie-banner button',
      '.yp-consent button',
    ]) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 600 }).catch(() => false)) {
        await btn.click({ timeout: 2000 }).catch(() => undefined);
        await page.waitForTimeout(300);
      }
    }
    // Hide leftover overlays that block clean shots
    await page.addStyleTag({
      content: `
        .cookie-banner, .yp-consent, .pwa-install, .pwa-update, [class*="consent"], [class*="cookie"] {
          display: none !important; visibility: hidden !important;
        }
      `,
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    if (shot.wait) {
      await page.waitForSelector(shot.wait, { timeout: 12000 }).catch(() => undefined);
    }
    await page.waitForTimeout(500);
    await page.screenshot({
      path: join(OUT, shot.file),
      type: 'png',
      fullPage: false,
    });
    console.log('ok');
  } catch (e) {
    console.log('FAIL', e.message || e);
  }
}

await browser.close();
console.log('done →', OUT);
