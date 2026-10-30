import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const output = path.join(root, 'tests', 'fixtures', 'required-routes.json');
const siteOrigin = 'https://tarotflower.com';

const criticalIndexableRoutes = [
  '/creating-sacred-space-how-to-cast-a-goddess-circle/',
  '/embodiment-dance-for-high-vibe-living/',
  '/goddess-dance-embodiment-celebrate-spring/',
  '/goddess-mythology/',
  '/want-more-powerful-magic-embody-your-intention-through-dance/',
];

const criticalNoindexRoutes = [
  '/fire-purchase-complete/',
  '/library/forgot/',
  '/library/setup/',
  '/workbench/forgot/',
  '/workbench/login/',
];

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

function sitemapRoutes(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => new URL(match[1]).pathname)
    .sort();
}

function normalizedRedirectRegistry(source) {
  return source.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .join('\n');
}

await stat(dist).catch(() => {
  throw new Error('dist/ is missing. Run npm run build before updating the required-route manifest.');
});

const files = (await walk(dist)).sort();
const generatedRoutes = files.filter((file) => file.endsWith('.html')).map(routeForHtml).sort();
const sitemap = sitemapRoutes(await readFile(path.join(dist, 'sitemap-0.xml'), 'utf8'));
const indexable = new Set(sitemap);
const ignoredGeneratedRoutes = ['/404.html'];
const ignored = new Set(ignoredGeneratedRoutes);
const noindexRoutes = generatedRoutes.filter((route) => !indexable.has(route) && !ignored.has(route));
const requiredArtifactFiles = files.filter((file) => !file.endsWith('.html')).map((file) => `/${file}`);
const redirects = normalizedRedirectRegistry(await readFile(path.join(dist, '_redirects'), 'utf8'));

for (const route of criticalIndexableRoutes) {
  if (!indexable.has(route)) throw new Error(`Critical indexable route is missing from the sitemap: ${route}`);
}
for (const route of criticalNoindexRoutes) {
  if (!noindexRoutes.includes(route)) throw new Error(`Critical noindex route is missing from the build: ${route}`);
}

const manifest = {
  schemaVersion: 1,
  baselineWorkerVersion: '525e9ac0-72d0-4759-a96b-4a118db0b614',
  siteOrigin,
  expectedAstroPageCount: generatedRoutes.length - ignoredGeneratedRoutes.length,
  expectedHtmlFileCount: generatedRoutes.length,
  expectedSitemapUrlCount: sitemap.length,
  redirectRuleCount: redirects.split('\n').filter(Boolean).length,
  redirectRegistrySha256: createHash('sha256').update(redirects).digest('hex'),
  criticalRoutes: {
    publicIndexable: criticalIndexableRoutes,
    privateNoindex: criticalNoindexRoutes,
  },
  ignoredGeneratedRoutes,
  indexableRoutes: sitemap,
  noindexRoutes,
  requiredArtifactFiles,
};

await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${path.relative(root, output)} with ${sitemap.length} indexable routes, ${noindexRoutes.length} noindex routes, and ${requiredArtifactFiles.length} required artifacts.`);
