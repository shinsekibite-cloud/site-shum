#!/usr/bin/env node
/**
 * Brand kit + PWA icons from the official CRM Sochi emblem (book + arrows).
 *
 * Source: public/brand/logo-crm-sochi.png (HQ lockup, transparent).
 * Square icons are cropped from the emblem (no wordmark) so 48–192px stay readable.
 *
 * Usage: node scripts/generate-pwa-icons.mjs
 */
import sharp from 'sharp';
import { mkdir, copyFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const brandDir = path.join(root, 'public/brand');
const iconsDir = path.join(root, 'public/icons');
const appDir = path.join(root, 'src/app');
const hqPath = path.join(brandDir, 'logo-crm-sochi.png');

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const NAVY = { r: 15, g: 39, b: 92, alpha: 1 };

/** Tight crop of the book+arrows emblem inside the HQ lockup (1144×1230). */
const EMBLEM = { left: 271, top: 0, width: 602, height: 650 };

async function emblemBuffer() {
  return sharp(hqPath).extract(EMBLEM).png().toBuffer();
}

async function fitSquare(srcBuf, size, outPath, { pad = 0.08, bg = null } = {}) {
  const inner = Math.max(1, Math.round(size * (1 - pad * 2)));
  const icon = await sharp(srcBuf)
    .resize(inner, inner, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const meta = await sharp(icon).metadata();
  const left = Math.round((size - (meta.width || inner)) / 2);
  const top = Math.round((size - (meta.height || inner)) / 2);
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: bg || { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: icon, left, top }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log('wrote', path.relative(root, outPath), `${size}x${size}`);
}

async function main() {
  await mkdir(brandDir, { recursive: true });
  await mkdir(iconsDir, { recursive: true });
  await mkdir(appDir, { recursive: true });

  const emblem = await emblemBuffer();

  // Canonical HQ names from the brand kit
  await copyFile(hqPath, path.join(brandDir, 'crm-sochi-logo-transparent.png'));
  const hqMeta = await sharp(hqPath).metadata();
  await sharp({
    create: {
      width: hqMeta.width || 1144,
      height: hqMeta.height || 1230,
      channels: 4,
      background: WHITE,
    },
  })
    .composite([{ input: hqPath, left: 0, top: 0 }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(brandDir, 'crm-sochi-logo.png'));
  console.log('wrote public/brand/crm-sochi-logo-transparent.png');
  console.log('wrote public/brand/crm-sochi-logo.png (white canvas)');

  // Square mark for header / generic logo.png (emblem only)
  await fitSquare(emblem, 716, path.join(brandDir, 'logo-mark.png'), { pad: 0.04 });
  await copyFile(path.join(brandDir, 'logo-mark.png'), path.join(brandDir, 'crm-sochi-mark.png'));
  await fitSquare(emblem, 512, path.join(brandDir, 'logo.png'), { pad: 0.06, bg: WHITE });

  // PWA / favicon — white canvas matches the kit (apple-touch cannot be transparent)
  await fitSquare(emblem, 32, path.join(iconsDir, 'icon-32.png'), { pad: 0.06, bg: WHITE });
  await fitSquare(emblem, 48, path.join(iconsDir, 'favicon-48.png'), { pad: 0.06, bg: WHITE });
  await fitSquare(emblem, 180, path.join(iconsDir, 'apple-touch-icon.png'), { pad: 0.1, bg: WHITE });
  await fitSquare(emblem, 192, path.join(iconsDir, 'icon-192.png'), { pad: 0.08, bg: WHITE });
  await fitSquare(emblem, 512, path.join(iconsDir, 'icon-512.png'), { pad: 0.08, bg: WHITE });
  await fitSquare(emblem, 512, path.join(iconsDir, 'icon-512-maskable.png'), {
    pad: 0.18,
    bg: NAVY,
  });
  await copyFile(path.join(iconsDir, 'icon-512-maskable.png'), path.join(iconsDir, 'maskable-512.png'));
  await copyFile(path.join(iconsDir, 'favicon-48.png'), path.join(root, 'public/favicon-48.png'));
  await copyFile(path.join(iconsDir, 'apple-touch-icon.png'), path.join(root, 'public/apple-touch-icon.png'));

  await fitSquare(emblem, 48, path.join(appDir, 'icon.png'), { pad: 0.06, bg: WHITE });
  await fitSquare(emblem, 180, path.join(appDir, 'apple-icon.png'), { pad: 0.1, bg: WHITE });

  const kitReadme = `========================================
  ЛОГОТИП ЦЕНТРА РАЗВИТИЯ МОЛОДЁЖИ СОЧИ
  Пакет файлов для сайта и PWA
========================================

1. crm-sochi-logo-transparent.png — HQ, прозрачный фон. Шапка, футер, документы.
2. crm-sochi-logo.png — та же версия на белом фоне.
3. ../icons/icon-512.png — PWA 512×512.
4. ../icons/icon-192.png — PWA 192×192.
5. ../icons/apple-touch-icon.png — 180×180, iPhone/iPad.
6. ../icons/favicon-48.png — вкладка браузера.

Пути: /brand/… и /icons/…
Пересборка: node scripts/generate-pwa-icons.mjs
`;
  await writeFile(path.join(brandDir, 'README.txt'), kitReadme, 'utf8');
  console.log('wrote public/brand/README.txt');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
