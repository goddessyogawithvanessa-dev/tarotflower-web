import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url));

function jpegDimensions(buffer) {
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) { offset++; continue; }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  throw new Error('JPEG dimensions not found');
}

test('FIRE declares a lightweight, crawler-friendly Kali social image', async () => {
  const page = String(await read('src/pages/step-into-your-fire.astro'));
  const base = String(await read('src/layouts/Base.astro'));
  const image = await read('public/images/digital-rituals/step-into-the-fire/step-into-your-fire-social.jpg');
  assert.match(page, /step-into-your-fire-social\.jpg/);
  assert.match(page, /imageWidth=\{1200\}/);
  assert.match(page, /imageHeight=\{630\}/);
  assert.deepEqual(jpegDimensions(image), { width: 1200, height: 630 });
  assert.ok(image.byteLength < 400_000, `social image is ${image.byteLength} bytes`);
  assert.match(base, /property="og:image:secure_url"/);
});

test('FIRE metadata and primary heading describe the product naturally', async () => {
  const page = String(await read('src/pages/step-into-your-fire.astro'));
  assert.match(page, /Step Into Your Fire — Guided FIRE Ritual \| Tarot Flower/);
  assert.match(page, /Tarot Flower’s guided Goddess Kali fire ritual for courage and confidence/);
  assert.match(page, /<h1>Step Into Your Fire<\/h1>/);
  assert.match(page, /GUIDED GODDESS KALI FIRE RITUAL/);
  assert.match(page, /Become the Warrior Goddess · Courage &amp; Confidence/);
  assert.match(page, /'@type': 'Product'/);
  assert.match(page, /priceCurrency: 'USD'/);
  assert.match(page, /availability: 'https:\/\/schema\.org\/InStock'/);
});
