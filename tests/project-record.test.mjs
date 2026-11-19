import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SITE = 'https://tarotflower.com';

const read = (relative) => fs.readFileSync(path.join(DIST, relative), 'utf8');
const home = read('index.html');
const sitemap = read('sitemap-0.xml');
const redirects = read('_redirects');

function nav(idOrClass) {
  const selector = idOrClass.startsWith('#')
    ? `<nav id="${idOrClass.slice(1)}">`
    : `<nav class="${idOrClass.slice(1)}">`;
  const start = home.indexOf(selector);
  assert.notEqual(start, -1, `missing ${selector}`);
  const end = home.indexOf('</nav>', start);
  assert.notEqual(end, -1, `unclosed ${selector}`);
  return home.slice(start, end + 6);
}

function canonical(html) {
  return html.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/i)?.[1];
}

test('desktop and mobile navigation contain the approved Tarot destinations', () => {
  const expected = [
    ['/readings-with-vanessa/', 'Readings with Vanessa'],
    ['/understanding-the-tarot/', 'Understanding the Tarot'],
    ['/major-arcana/', 'Major Arcana'],
    ['/minor-arcana/', 'Minor Arcana'],
    ['/astrology/', 'Astrology &amp; Zodiac'],
  ];
  for (const markup of [nav('#mobile-nav'), nav('.desktop-nav')]) {
    for (const [href, label] of expected) {
      assert.ok(markup.includes(`href="${href}"`), `navigation is missing ${href}`);
      assert.ok(markup.includes(label), `navigation is missing ${label}`);
    }
    assert.ok(!markup.includes('href="/tarot-card-readings'), 'landing page was incorrectly added to primary navigation');
  }
});

test('the reading landing page and Vanessa service page retain distinct roles', () => {
  const landing = read('tarot-card-readings/index.html');
  const service = read('readings-with-vanessa/index.html');
  assert.equal(canonical(landing), `${SITE}/tarot-card-readings/`);
  assert.ok(sitemap.includes(`<loc>${SITE}/tarot-card-readings/</loc>`));
  assert.doesNotMatch(landing, /<meta\b[^>]*name="robots"[^>]*noindex/i);
  assert.equal(canonical(service), `${SITE}/readings-with-vanessa/`);
  assert.ok(service.includes('href="/checkout/readings-with-vanessa/"'));
});

test('canonical Tarot hubs and approved historical migrations remain explicit', () => {
  for (const route of ['major-arcana', 'minor-arcana', 'cups-tarot', 'pentacles-tarot', 'swords-tarot', 'wands-tarot']) {
    const html = read(`${route}/index.html`);
    assert.equal(canonical(html), `${SITE}/${route}/`);
    assert.ok(sitemap.includes(`<loc>${SITE}/${route}/</loc>`));
  }
  for (const source of [
    '/major-arcana-2',
    '/major-arcana-2/',
    '/category/tarot-card-meanings/major-arcana',
    '/category/tarot-card-meanings/major-arcana/',
    '/category/tarot-card-meanings/minor-arcana/cups',
    '/category/tarot-card-meanings/minor-arcana/cups/',
  ]) {
    const destination = source.includes('/cups') ? '/cups-tarot/' : '/major-arcana/';
    assert.match(redirects, new RegExp(`^${source.replaceAll('/', '\\/')}\\s+${destination.replaceAll('/', '\\/')}\\s+301$`, 'm'));
  }
});

test('the deliberately unpublished Melissa page remains source-only', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'src/content/posts/melissa-warwood-tantric-tarot.md')));
  assert.ok(!fs.existsSync(path.join(DIST, 'melissa-warwood-tantric-tarot/index.html')));
  assert.ok(!sitemap.includes('melissa-warwood-tantric-tarot'));
  assert.doesNotMatch(redirects, /^\/melissa-warwood-tantric-tarot\/?\s/m);
});

test('the Goddess Embodiment article aliases go directly to the individual article', () => {
  const destination = 'https://goddess-yoga-retreats.com/blog/goddess-embodiment-your-divine-feminine/';
  for (const source of [
    '/goddess-embodiment-your-divine-feminine',
    '/goddess-embodiment-your-divine-feminine/',
    '/embodiment/goddess-embodiment-your-divine-feminine',
    '/embodiment/goddess-embodiment-your-divine-feminine/',
  ]) {
    assert.match(redirects, new RegExp(`^${source.replaceAll('/', '\\/')}\\s+${destination.replaceAll('/', '\\/')}\\s+301$`, 'm'));
  }
});
