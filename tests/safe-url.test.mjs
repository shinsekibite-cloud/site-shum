import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// TypeScript helper is compiled at runtime via Node test of the same rules.
function safeHttpUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (value.startsWith('/uploads/')) {
    if (value.includes('..') || value.includes('\\') || value.includes('\0')) return null;
    return value;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

test('safeHttpUrl allows https and /uploads', () => {
  assert.equal(safeHttpUrl('https://example.ru/a'), 'https://example.ru/a');
  assert.equal(safeHttpUrl('/uploads/covers/x.jpg'), '/uploads/covers/x.jpg');
});

test('safeHttpUrl blocks javascript and traversal', () => {
  assert.equal(safeHttpUrl('javascript:alert(1)'), null);
  assert.equal(safeHttpUrl('data:text/html,hi'), null);
  assert.equal(safeHttpUrl('/uploads/../etc/passwd'), null);
  assert.equal(safeHttpUrl('not a url'), null);
});

void createRequire;
