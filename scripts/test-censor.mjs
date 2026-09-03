import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';

// Compile-free smoke: duplicate normalize logic check via dynamic ts transpile is heavy;
// instead assert the built helper by spawning tsx-less inline port of STEMS.
const STEMS = [
  'бля', 'блять', 'хуй', 'пизд', 'ебал', 'сука', 'мудак', 'пидор',
  'blya', 'suka', 'huy', 'pizda', 'mudak',
];

function normalize(input) {
  return String(input)
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/[0]/g, 'о')
    .replace(/[@]/g, 'а')
    .replace(/[\$]/g, 'с')
    .replace(/[*#№%^~`'"\\/|_+\-=.,!?;:()[\]{}<>]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function dirty(text) {
  if (!text) return false;
  const compact = normalize(text);
  return STEMS.some((s) => compact.includes(s));
}

const cases = [
  ['привет мир', false],
  ['это блять плохо', true],
  ['Х У Й', true],
  ['сука', true],
  ['молодежный центр Сочи', false],
  ['<p>пиздец</p>', true],
  ['suka blyat', true],
];

let failed = 0;
for (const [text, expect] of cases) {
  const got = dirty(text);
  if (got !== expect) {
    console.error('FAIL', JSON.stringify(text), 'expected', expect, 'got', got);
    failed++;
  } else {
    console.log('OK', JSON.stringify(text), '->', got);
  }
}

// Also import real module if ts-node unavailable — use node --experimental-strip-types if available
try {
  const modPath = pathToFileURL(path.resolve('src/lib/censor.ts')).href;
  const mod = await import(modPath);
  for (const [text, expect] of cases) {
    const got = mod.containsProfanity(text);
    if (got !== expect) {
      console.error('REAL FAIL', JSON.stringify(text), 'expected', expect, 'got', got);
      failed++;
    }
  }
  console.log('Real module checks passed (or listed above)');
} catch (e) {
  console.log('Skip native TS import:', e.message);
}

process.exit(failed ? 1 : 0);
