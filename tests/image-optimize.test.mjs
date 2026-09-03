import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';

test('sharp can resize and encode WebP (upload pipeline dependency)', async () => {
  const input = await sharp({
    create: {
      width: 2000,
      height: 1200,
      channels: 3,
      background: { r: 30, g: 100, b: 180 },
    },
  })
    .jpeg({ quality: 92 })
    .toBuffer();

  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: 1600, height: 900, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  assert.equal(info.format, 'webp');
  assert.ok(info.width <= 1600);
  assert.ok(data.length < input.length);
  assert.ok(data.length > 200);
});
