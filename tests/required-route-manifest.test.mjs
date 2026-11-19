import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const manifest = JSON.parse(await readFile(path.join(root, 'tests', 'fixtures', 'required-routes.json'), 'utf8'));

async function walk(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

function routeForHtml(relative) {
  if (relative === 'index.html') return '/';
  if (relative === '404.html') return '/404.html';
  if (relative.endsWith('/index.html')) return `/${relative.slice(0, -'index.html'.length)}`;
  return `/${relative.slice(0, -'.html'.length)}`;
}

function htmlFileForRoute(route) {
  if (route === '/') return path.join(dist, 'index.html');
  if (route === '/404.html') return path.join(dist, '404.html');
  return path.join(dist, route.slice(1), 'index.html');
}

function sitemapRoutes(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname).sort();
}

function metaContent(html, name) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const tag = tags.find((candidate) => new RegExp(`\\bname=["']${name}["']`, 'i').test(candidate));
  return tag?.match(/\bcontent=["']([^"']*)["']/i)?.[1] ?? '';
}

function canonicalHref(html) {
  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  const tag = links.find((candidate) => /\brel=["']canonical["']/i.test(candidate));
  return tag?.match(/\bhref=["']([^"']+)["']/i)?.[1] ?? '';
}

function normalizedRedirectRegistry(source) {
  return source.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .join('\n');
}

function redirectMap(registry) {
  return new Map(registry.split('\n').map((line) => {
    const [source, destination, status] = line.split(/\s+/);
    return [source, { destination, status: Number(status) }];
  }));
}

test('generated route inventory exactly matches the production-required manifest', async () => {
  const htmlFiles = (await walk(dist)).filter((file) => file.endsWith('.html'));
  const actual = htmlFiles.map(routeForHtml).sort();
  const expected = [...manifest.indexableRoutes, ...manifest.noindexRoutes, ...manifest.ignoredGeneratedRoutes].sort();
  assert.equal(actual.length, manifest.expectedHtmlFileCount);
  assert.equal(actual.length - manifest.ignoredGeneratedRoutes.length, manifest.expectedAstroPageCount);
  assert.deepEqual(actual, expected);
});

test('indexable routes are self-canonical, indexable, and exactly match the sitemap', async () => {
  const actualSitemap = sitemapRoutes(await readFile(path.join(dist, 'sitemap-0.xml'), 'utf8'));
  assert.equal(actualSitemap.length, manifest.expectedSitemapUrlCount);
  assert.deepEqual(actualSitemap, manifest.indexableRoutes);

  for (const route of manifest.indexableRoutes) {
    const html = await readFile(htmlFileForRoute(route), 'utf8');
    assert.equal(canonicalHref(html), `${manifest.siteOrigin}${route}`, `${route} must be self-canonical`);
    assert.doesNotMatch(metaContent(html, 'robots'), /(?:noindex|none)/i, `${route} must remain indexable`);
  }
});

test('noindex routes remain generated, absent from the sitemap, and free of canonical conflicts', async () => {
  const sitemap = new Set(manifest.indexableRoutes);
  for (const route of manifest.noindexRoutes) {
    const html = await readFile(htmlFileForRoute(route), 'utf8');
    const canonical = canonicalHref(html);
    if (canonical) assert.equal(canonical, `${manifest.siteOrigin}${route}`, `${route} canonical must not conflict`);
    assert.match(metaContent(html, 'robots'), /(?:noindex|none)/i, `${route} must remain noindex`);
    assert.ok(!sitemap.has(route), `${route} must remain absent from the sitemap`);
  }
});

test('the 15 approved browsing routes remain live with noindex, follow and stay out of the sitemap', async () => {
  assert.equal(manifest.criticalRoutes.publicBrowsingNoindex.length, 15);
  const sitemap = new Set(sitemapRoutes(await readFile(path.join(dist, 'sitemap-0.xml'), 'utf8')));
  for (const route of manifest.criticalRoutes.publicBrowsingNoindex) {
    const html = await readFile(htmlFileForRoute(route), 'utf8');
    assert.equal(metaContent(html, 'robots').toLowerCase(), 'noindex, follow', `${route} must use noindex, follow`);
    assert.equal(canonicalHref(html), `${manifest.siteOrigin}${route}`, `${route} must remain self-canonical`);
    assert.ok(!sitemap.has(route), `${route} must stay out of the page sitemap`);
  }
});

test('the ten recovered production routes retain their intended indexing classification and canonicals', async () => {
  const indexable = new Set(manifest.indexableRoutes);
  const noindex = new Set(manifest.noindexRoutes);
  for (const route of manifest.criticalRoutes.publicIndexable) assert.ok(indexable.has(route), route);
  for (const route of manifest.criticalRoutes.publicBrowsingNoindex) assert.ok(noindex.has(route), route);
  for (const route of manifest.criticalRoutes.privateNoindex) {
    assert.ok(noindex.has(route), route);
    const html = await readFile(htmlFileForRoute(route), 'utf8');
    assert.equal(canonicalHref(html), `${manifest.siteOrigin}${route}`, `${route} must be self-canonical`);
  }
});

test('all required deployed artifacts remain in the production build', async () => {
  for (const artifact of manifest.requiredArtifactFiles) {
    const target = path.join(dist, artifact.slice(1));
    await access(target);
    assert.ok((await stat(target)).isFile(), `${artifact} must be a file`);
  }
});

test('the historical redirect registry is complete and collision-free', async () => {
  const registry = normalizedRedirectRegistry(await readFile(path.join(dist, '_redirects'), 'utf8'));
  const lines = registry.split('\n').filter(Boolean);
  const redirects = redirectMap(registry);
  assert.equal(lines.length, manifest.redirectRuleCount);
  assert.equal(createHash('sha256').update(registry).digest('hex'), manifest.redirectRegistrySha256);
  assert.equal(redirects.size, lines.length, 'redirect sources must be unique');

  const majorArcanaAliases = [
    '/major-arcana-2',
    '/major-arcana-2/',
    '/category/tarot-card-meanings/major-arcana',
    '/category/tarot-card-meanings/major-arcana/',
    '/category/tarot-card-meanings/major-arcana/page/3',
    '/category/tarot-card-meanings/major-arcana/page/3/',
    '/tarotflower.com/major-arcana-2',
    '/tarotflower.com/major-arcana-2/',
  ];
  for (const alias of majorArcanaAliases) {
    assert.deepEqual(redirects.get(alias), { destination: '/major-arcana/', status: 301 }, alias);
  }

  for (const alias of [
    '/category/tarot-card-meanings/minor-arcana/cups',
    '/category/tarot-card-meanings/minor-arcana/cups/',
  ]) {
    assert.deepEqual(redirects.get(alias), { destination: '/cups-tarot/', status: 301 }, alias);
  }
});

test('the approved Major Arcana destination is canonical and excluded proposals stay excluded', () => {
  const generated = new Set([...manifest.indexableRoutes, ...manifest.noindexRoutes]);
  assert.ok(manifest.indexableRoutes.includes('/major-arcana/'));
  assert.ok(!generated.has('/major-arcana-2/'));
  assert.ok(!generated.has('/major-arcana-tarot/'));
  assert.ok(!generated.has('/melissa-warwood-tantric-tarot/'));
});
