/**
 * Device fingerprint stability helpers.
 * Run: node --test tests/device-fingerprint.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

function stripUaVersions(ua) {
  return ua
    .replace(/(\bChrome\/)\d+[\d.]*/gi, '$1x')
    .replace(/(\bCriOS\/)\d+[\d.]*/gi, '$1x')
    .replace(/(\bFirefox\/)\d+[\d.]*/gi, '$1x')
    .replace(/(\bEdg\/)\d+[\d.]*/gi, '$1x')
    .replace(/(\bVersion\/)\d+[\d.]*/gi, '$1x')
    .replace(/(\bAppleWebKit\/)\d+[\d.]*/gi, '$1x')
    .replace(/(\bSafari\/)\d+[\d.]*/gi, '$1x')
    .replace(/(\bYaBrowser\/)\d+[\d.]*/gi, '$1x');
}

test('Chrome version bumps do not change stripped UA', () => {
  const a = stripUaVersions(
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.6099.144 Mobile Safari/537.36'
  );
  const b = stripUaVersions(
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0.6778.39 Mobile Safari/537.36'
  );
  assert.equal(a, b);
});

test('orientation uses min/max sides', () => {
  const portrait = { w: 360, h: 800 };
  const landscape = { w: 800, h: 360 };
  const key = (s) => `${Math.min(s.w, s.h)}x${Math.max(s.w, s.h)}`;
  assert.equal(key(portrait), key(landscape));
});
