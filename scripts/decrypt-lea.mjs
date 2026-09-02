#!/usr/bin/env node
/**
 * Offline decrypt for YoungPortal LEA archives (.ypenc / YPLEA1).
 *
 * Usage:
 *   node scripts/decrypt-lea.mjs archive.ypenc --key <64-hex> [--sha <hex>] [--fp <hex>] [-o out.json]
 */
import { createDecipheriv, createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function usage(code = 1) {
  console.error(`Usage: node scripts/decrypt-lea.mjs <file.ypenc> --key <64-hex> [--sha <hex>] [--fp <hex>] [-o out.json]`);
  process.exit(code);
}

const file = process.argv[2];
if (!file || file.startsWith('-')) usage();
const keyHex = (arg('--key') || '').trim().toLowerCase();
const expectSha = (arg('--sha') || '').trim().toLowerCase();
const expectFp = (arg('--fp') || '').trim().toLowerCase();
const outPath = arg('-o') || arg('--out') || file.replace(/\.ypenc$/i, '') + '.json';

if (!/^[0-9a-f]{64}$/.test(keyHex)) {
  console.error('Error: --key must be 64 hex chars (AES-256)');
  process.exit(1);
}

const buf = readFileSync(file);
const sha = createHash('sha256').update(buf).digest('hex');
if (expectSha && expectSha !== sha) {
  console.error('SHA-256 mismatch\n expected', expectSha, '\n got     ', sha);
  process.exit(1);
}

const magic = buf.subarray(0, 6).toString('utf8');
if (magic !== 'YPLEA1') {
  console.error('Not a YoungPortal LEA archive (magic=', magic, ')');
  process.exit(1);
}

const iv = buf.subarray(6, 18);
const tag = buf.subarray(18, 34);
const data = buf.subarray(34);
const key = Buffer.from(keyHex, 'hex');
const fp = createHash('sha256').update(key).digest('hex').slice(0, 32);
if (expectFp && expectFp !== fp) {
  console.error('Key fingerprint mismatch\n expected', expectFp, '\n got     ', fp);
  process.exit(1);
}

const decipher = createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(tag);
let json;
try {
  json = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  JSON.parse(json);
} catch (e) {
  console.error('Decrypt failed (bad key or corrupt file):', e.message || e);
  process.exit(1);
}

const pretty = JSON.stringify(JSON.parse(json), null, 2);
writeFileSync(outPath, pretty, 'utf8');
console.log('OK →', outPath);
console.log('SHA-256:', sha);
console.log('Key fingerprint:', fp);
