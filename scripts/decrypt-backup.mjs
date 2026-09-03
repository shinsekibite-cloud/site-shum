#!/usr/bin/env node
/**
 * Decrypt YoungPortal encrypted archives offline.
 * Supports:
 *   YPBK1 — admin project backup (.ypenc from /admin/backup)
 *   YPLEA1 — LEA PII export
 *
 * Usage:
 *   node scripts/decrypt-backup.mjs archive.ypenc --key <64-hex> [--out out.json]
 */
import { createDecipheriv, createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const keyIdx = args.indexOf('--key');
const outIdx = args.indexOf('--out');
const keyHex = keyIdx >= 0 ? args[keyIdx + 1] : process.env.BACKUP_KEY;
const outPath = outIdx >= 0 ? args[outIdx + 1] : null;

if (!file || !keyHex) {
  console.error('Usage: node scripts/decrypt-backup.mjs <file.ypenc> --key <64-hex> [--out out.json]');
  process.exit(1);
}

const buf = readFileSync(file);
const magic = buf.subarray(0, 5).toString('utf8');
const magic6 = buf.subarray(0, 6).toString('utf8');

let offset = 0;
let kind = '';
if (magic === 'YPBK1') {
  kind = 'project-backup';
  offset = 5;
} else if (magic6 === 'YPLEA1') {
  kind = 'lea-export';
  offset = 6;
} else {
  console.error('Unknown magic:', magic6 || magic);
  process.exit(1);
}

const iv = buf.subarray(offset, offset + 12);
const tag = buf.subarray(offset + 12, offset + 28);
const enc = buf.subarray(offset + 28);
const key = Buffer.from(keyHex, 'hex');
if (key.length !== 32) {
  console.error('Key must be 32 bytes (64 hex chars), got', key.length);
  process.exit(1);
}

const decipher = createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(tag);
const plain = Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
const fingerprint = createHash('sha256').update(key).digest('hex').slice(0, 32);

let parsed;
try {
  parsed = JSON.parse(plain);
} catch {
  parsed = plain;
}

const result = { kind, keyFingerprint: fingerprint, payload: parsed };
const text = JSON.stringify(result, null, 2);
if (outPath) {
  writeFileSync(outPath, text);
  console.error('Wrote', outPath);
} else {
  console.log(text);
}
