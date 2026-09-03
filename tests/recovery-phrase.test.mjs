/**
 * Lightweight recovery-phrase checks (no TS path aliases).
 * Run: node --test tests/recovery-phrase.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcrypt';

const wlPath = path.join(process.cwd(), 'src/lib/recovery-wordlist-ru.ts');
const src = fs.readFileSync(wlPath, 'utf8');
const words = [...src.matchAll(/'([а-я]+)'/g)].map((m) => m[1]);

test('wordlist has 2048 unique Russian words', () => {
  assert.equal(words.length, 2048);
  assert.equal(new Set(words).size, 2048);
  assert.match(words[0], /^[а-я]+$/);
});

function normalize(input) {
  return String(input)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^а-я\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function generate() {
  const entropy = crypto.randomBytes(32);
  const hash = crypto.createHash('sha256').update(entropy).digest();
  const bits = [];
  for (const byte of entropy) {
    for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
  }
  for (let i = 7; i >= 0; i--) bits.push((hash[0] >> i) & 1);
  const out = [];
  for (let w = 0; w < 24; w++) {
    let idx = 0;
    for (let i = 0; i < 11; i++) idx = (idx << 1) | bits[w * 11 + i];
    out.push(words[idx]);
  }
  return out;
}

test('generate returns 24 words from the list', () => {
  const phrase = generate();
  assert.equal(phrase.length, 24);
  for (const w of phrase) assert.ok(words.includes(w));
});

test('hash verifies and rejects tampering', async () => {
  const phrase = generate();
  const digest = crypto.createHash('sha256').update(normalize(phrase.join(' ')), 'utf8').digest('hex');
  const hash = await bcrypt.hash(digest, 4);
  const okDigest = crypto.createHash('sha256').update(normalize(phrase.join(' ')), 'utf8').digest('hex');
  assert.equal(await bcrypt.compare(okDigest, hash), true);
  const bad = [...phrase];
  bad[0] = words[0] === bad[0] ? words[1] : words[0];
  const badDigest = crypto.createHash('sha256').update(normalize(bad.join(' ')), 'utf8').digest('hex');
  assert.equal(await bcrypt.compare(badDigest, hash), false);
});

test('normalize handles ё', () => {
  assert.equal(normalize('Ёлка,  тест'), 'елка тест');
});
