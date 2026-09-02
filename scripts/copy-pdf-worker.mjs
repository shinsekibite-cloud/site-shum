#!/usr/bin/env node
/** Copy pdf.js worker + standard fonts into public/ (no CDN). */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pdfjs = path.join(root, 'node_modules', 'pdfjs-dist');
const publicDir = path.join(root, 'public');

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (fs.statSync(from).isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

const workerSrc = path.join(pdfjs, 'build', 'pdf.worker.min.mjs');
if (!fs.existsSync(workerSrc)) {
  console.warn('[copy-pdf-worker] pdfjs-dist not found, skip');
  process.exit(0);
}

copyFile(workerSrc, path.join(publicDir, 'pdf.worker.min.mjs'));
console.log('[copy-pdf-worker] wrote public/pdf.worker.min.mjs');

const pdfMain = path.join(pdfjs, 'build', 'pdf.min.mjs');
if (fs.existsSync(pdfMain)) {
  const pdfjsDir = path.join(publicDir, 'pdfjs');
  fs.mkdirSync(pdfjsDir, { recursive: true });
  copyFile(pdfMain, path.join(pdfjsDir, 'pdf.min.mjs'));
  console.log('[copy-pdf-worker] wrote public/pdfjs/pdf.min.mjs');
}

const fontsSrc = path.join(pdfjs, 'standard_fonts');
if (fs.existsSync(fontsSrc)) {
  const fontsDest = path.join(publicDir, 'pdfjs', 'standard_fonts');
  fs.rmSync(fontsDest, { recursive: true, force: true });
  copyDir(fontsSrc, fontsDest);
  console.log('[copy-pdf-worker] wrote public/pdfjs/standard_fonts');
}
