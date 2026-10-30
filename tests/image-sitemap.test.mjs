import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { inspectPage, renderImageSitemap, buildImageSitemap } from '../src/integrations/imageSitemap.mjs';

const origin = 'https://tarotflower.com';
const page = `${origin}/test/`;
const image = '/images/meaningful.jpg';
const html = (body, robots = 'index, follow', canonical = page) => `<link rel="canonical" href="${canonical}"><meta name="robots" content="${robots}">${body}`;
const tag = (src = image, alt = 'Contextual Tarot artwork at Tarot Flower') => `<img src="${src}" alt="${alt}">`;
const review = { images: [{ index: 0, src: image }], excluded: [] };
const pages = new Set([page]);

test('actual contextual page placements are included, deduplicated only within that page', () => {
  const result = inspectPage(html(tag() + tag()), page, { images: [{ index: 0, src: image }, { index: 1, src: image }], excluded: [] }, pages);
  assert.deepEqual(result, [`${origin}${image}`]);
});

test('shared chrome and decorative placements remain excluded without modifying their HTML', () => {
  const header = '/images/tarot-flower-dandelion-goddess-header.jpg';
  const input = html(tag() + tag(header, 'Tarot Flower home') + tag('/images/icon.png', ''));
  const result = inspectPage(input, page, { images: review.images, excluded: [{ index: 1, src: header }, { index: 2, src: '/images/icon.png' }] }, pages);
  assert.deepEqual(result, [`${origin}${image}`]);
  assert.ok(input.includes('alt=""'));
});

test('private, noindex, missing sitemap and noncanonical pages cannot enter', () => {
  assert.throws(() => inspectPage(html(tag()), `${origin}/library/`, review, new Set([`${origin}/library/`])), /not public/);
  assert.throws(() => inspectPage(html(tag(), 'noindex, follow'), page, review, pages), /noindex/);
  assert.throws(() => inspectPage(html(tag(), 'index', `${origin}/other/`), page, review, pages), /Noncanonical/);
  assert.throws(() => inspectPage(html(tag()), page, review, new Set()), /not public/);
});

test('external, obsolete, metadata-only fallback, decorative and changed placements fail closed', () => {
  for (const src of ['https://example.wordpress.com/art.jpg', '/wp-content/uploads/art.jpg', '/images/art.jpg?old=1']) {
    assert.throws(() => inspectPage(html(tag(src)), page, { images: [{ index: 0, src }], excluded: [] }, pages), /self-hosted/);
  }
  assert.throws(() => inspectPage(html(tag(image, '')), page, review, pages), /Decorative/);
  assert.throws(() => inspectPage(html(tag('/images/replacement.jpg')), page, review, pages), /changed/);
  assert.throws(() => inspectPage(html(tag() + tag('/images/new.jpg')), page, review, pages), /Unreviewed/);
  assert.throws(() => inspectPage(html('<meta property="og:image" content="/images/meaningful.jpg">'), page, review, pages), /Unreviewed/);
});

test('XML uses the image namespace, escapes URLs, and preserves separate valid page/image relationships', () => {
  const url = `${origin}/images/figure&flower.jpg`;
  const xml = renderImageSitemap([{ url: page, images: [url] }, { url: `${origin}/other/`, images: [url] }]);
  assert.ok(xml.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'));
  assert.equal((xml.match(/<image:image>/g) ?? []).length, 2);
  assert.ok(xml.includes('figure&amp;flower.jpg'));
  assert.ok(!xml.includes('image:title') && !xml.includes('image:caption'));
});

test('build verifies local files and scope, writes only the new sitemap, and leaves page sitemap and HTML intact', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'tf-image-sitemap-test-'));
  try {
    await mkdir(path.join(root, 'test'));
    await mkdir(path.join(root, 'images'));
    const source = html(tag());
    const sitemap = `<urlset><url><loc>${page}</loc></url></urlset>`;
    await writeFile(path.join(root, 'test/index.html'), source);
    await writeFile(path.join(root, 'images/meaningful.jpg'), Buffer.from('fixture'));
    await writeFile(path.join(root, 'sitemap-0.xml'), sitemap);
    await writeFile(path.join(root, 'sitemap-index.xml'), `<sitemapindex><sitemap><loc>${origin}/sitemap-0.xml</loc></sitemap><sitemap><loc>${origin}/sitemap-images.xml</loc></sitemap></sitemapindex>`);
    const dir = pathToFileURL(root + path.sep);
    assert.deepEqual(await buildImageSitemap(dir, origin, { pages: { '/test/': review } }), { pages: 1, images: 1, associations: 1 });
    assert.equal(await readFile(path.join(root, 'test/index.html'), 'utf8'), source);
    assert.equal(await readFile(path.join(root, 'sitemap-0.xml'), 'utf8'), sitemap);
    await assert.rejects(buildImageSitemap(dir, origin, { pages: {} }), /scope changed/);
    await rm(path.join(root, 'images/meaningful.jpg'));
    await assert.rejects(buildImageSitemap(dir, origin, { pages: { '/test/': review } }), /ENOENT/);
  } finally {
    await rm(root, { recursive: true });
  }
});
