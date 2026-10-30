import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SITE = 'https://tarotflower.com';
const HISTORICAL_IMPORT_COMMIT = '5840965';
const exceptions = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/sitewide-audit-exceptions.json'), 'utf8'));
const approvedDynamicDestinations = exceptions.protectedDynamicDestinations.map(prefix => value => value.startsWith(prefix));
const classifiedOrphans = new Set(exceptions.sitemapOrphans);
const approvalRequiredHistoricalUrls = new Set(exceptions.approvalRequiredHistoricalUrls);

function gitBinary() {
  const candidates = [process.env.GIT_BINARY, 'git'].filter(Boolean);
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return candidate;
    } catch {}
  }
  throw new Error('Git is required for retained-import verification. Install Git or set GIT_BINARY.');
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function routeFor(file) {
  const rel = path.relative(DIST, file).replaceAll(path.sep, '/');
  if (rel === 'index.html') return '/';
  if (rel === '404.html') return '/404.html';
  if (rel.endsWith('/index.html')) return `/${rel.slice(0, -'index.html'.length)}`;
  return `/${rel}`;
}

function redirectRules() {
  const map = new Map();
  const text = fs.readFileSync(path.join(DIST, '_redirects'), 'utf8');
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [source, destination, status = '301'] = trimmed.split(/\s+/);
    assert.ok(!map.has(source), `duplicate redirect source ${source} at line ${index + 1}`);
    map.set(source, { destination, status: Number(status), line: index + 1 });
  }
  return map;
}

function canonicalPath(raw) {
  const url = new URL(raw, SITE);
  let pathname = url.pathname.replace(/\/{2,}/g, '/');
  if (pathname !== '/' && !path.posix.extname(pathname) && !pathname.endsWith('/')) pathname += '/';
  return pathname;
}

function canonical(html) {
  return html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1]
    || html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i)?.[1]
    || '';
}

function robots(html) {
  return [...html.matchAll(/<meta\b[^>]*name=["'](?:robots|googlebot)["'][^>]*content=["']([^"']+)["'][^>]*>/gi)].map(x => x[1]).join(',');
}

function anchors(html) {
  const staticHtml = html.replace(/<(script|style|textarea|title)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  return [...staticHtml.matchAll(/<a\b[^>]*href\s*=\s*(["'])(.*?)\1/gi)].map(x => x[2]);
}

function anchorRecords(html) {
  const stack = [];
  const records = [];
  const voidTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  const context = () => {
    const descriptors = stack.map(item => `${item.tag} ${item.id} ${item.className}`.toLowerCase());
    if (descriptors.some(value => value.startsWith('footer ') || /\bsite-footer\b/.test(value))) return 'footer';
    if (descriptors.some(value => value.startsWith('nav ') || /\b(nav|menu|mega-menu|mobile-nav|desktop-nav)\b/.test(value))) return 'navigation';
    if (descriptors.some(value => /breadcrumb/.test(value))) return 'breadcrumb';
    if (descriptors.some(value => value.startsWith('header '))) return 'header';
    if (descriptors.some(value => value.startsWith('main ') || /\b(content|article|post|journey|related|cta|grid)\b/.test(value))) return 'contextual';
    return 'other';
  };
  const htmlWithoutRawText = html.replace(/<(script|style|textarea|title)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  for (const match of htmlWithoutRawText.matchAll(/<\/?([A-Za-z][\w:-]*)([^>]*)>/g)) {
    const full = match[0];
    const tag = match[1].toLowerCase();
    if (full.startsWith('</')) {
      const index = stack.map(item => item.tag).lastIndexOf(tag);
      if (index >= 0) stack.splice(index);
      continue;
    }
    const raw = match[2] || '';
    const href = raw.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (tag === 'a' && href) records.push({ href, context: context() });
    if (!voidTags.has(tag) && !full.endsWith('/>')) stack.push({
      tag,
      id: raw.match(/\bid\s*=\s*(["'])(.*?)\1/i)?.[2] || '',
      className: raw.match(/\bclass\s*=\s*(["'])(.*?)\1/i)?.[2] || '',
    });
  }
  return records;
}

const htmlFiles = walk(DIST).filter(file => file.endsWith('.html'));
const pages = new Map(htmlFiles.map(file => [routeFor(file), fs.readFileSync(file, 'utf8')]));
const routes = new Set(pages.keys());
const redirects = redirectRules();
const servedRoutes = new Set([...routes].filter(route => route !== '/404.html' && route !== '/admin/' && !redirects.has(route)));

test('the build route inventory is discovered without a fixed route count', () => {
  assert.equal(pages.size, routes.size, 'two HTML files mapped to the same route');
  assert.ok(pages.size > 0, 'build produced no HTML routes');
  for (const route of exceptions.supplementalStaticRoutes) assert.ok(pages.has(route), `missing classified supplemental route ${route}`);
  for (const route of exceptions.redirectedGeneratedRoutes) {
    assert.ok(pages.has(route), `missing classified generated redirect route ${route}`);
    assert.ok(redirects.has(route), `generated redirect route lacks redirect rule ${route}`);
  }
});

test('every served generated page has one self-consistent canonical and no duplicate canonical target', () => {
  const canonicalOwners = new Map();
  for (const route of servedRoutes) {
    const target = canonical(pages.get(route));
    assert.ok(target, `missing canonical on ${route}`);
    assert.equal(canonicalPath(target), route, `canonical mismatch on ${route}: ${target}`);
    assert.ok(!canonicalOwners.has(target), `duplicate canonical ${target} on ${canonicalOwners.get(target)} and ${route}`);
    canonicalOwners.set(target, route);
  }
});

test('every sitemap URL is a served, indexable, self-canonical generated page', () => {
  const sitemap = fs.readFileSync(path.join(DIST, 'sitemap-0.xml'), 'utf8');
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(x => x[1]);
  const sitemapRoutes = new Set(urls.map(url => new URL(url).pathname));
  const expectedRoutes = new Set([...servedRoutes].filter(route => !/\b(?:noindex|none)\b/i.test(robots(pages.get(route)))));
  assert.deepEqual(sitemapRoutes, expectedRoutes, 'sitemap must exactly equal discovered served/indexable routes');
  for (const url of urls) {
    const route = new URL(url).pathname;
    assert.ok(servedRoutes.has(route), `sitemap destination is not a served generated page: ${url}`);
    assert.doesNotMatch(robots(pages.get(route)), /\b(?:noindex|none)\b/i, `sitemap page is noindex: ${route}`);
    assert.equal(canonical(pages.get(route)), url, `sitemap/canonical mismatch: ${route}`);
  }
});

test('all rendered internal anchors on served pages resolve directly without redirect hops', () => {
  let checked = 0;
  const failures = [];
  for (const route of servedRoutes) {
    for (const raw of anchors(pages.get(route))) {
      if (!raw || raw.includes('${') || raw.startsWith('#') || /^(?:mailto|tel|javascript|data):/i.test(raw)) continue;
      const target = new URL(raw, new URL(route, SITE));
      if (!['tarotflower.com','www.tarotflower.com'].includes(target.hostname)) continue;
      checked++;
      if (redirects.has(target.pathname)) failures.push(`${route} -> ${raw} (configured redirect)`);
      const targetRoute = canonicalPath(target.href);
      if (routes.has(targetRoute) && target.pathname !== targetRoute) failures.push(`${route} -> ${raw} (noncanonical slash variant)`);
      let decodedPath = target.pathname;
      try { decodedPath = decodeURIComponent(target.pathname); } catch {}
      const assetExists = fs.existsSync(path.join(DIST, decodedPath.replace(/^\//, '')));
      if (!routes.has(targetRoute) && !assetExists && !redirects.has(target.pathname) && !approvedDynamicDestinations.some(matches => matches(target.pathname))) {
        failures.push(`${route} -> ${raw} (unresolved internal destination)`);
      }
    }
  }
  assert.ok(checked > 50000, `unexpectedly low link coverage: ${checked}`);
  assert.deepEqual(failures, []);
});

test('every sitemap orphan is explicitly classified', () => {
  const sitemap = fs.readFileSync(path.join(DIST, 'sitemap-0.xml'), 'utf8');
  const sitemapRoutes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(x => new URL(x[1]).pathname);
  const inbound = new Map(sitemapRoutes.map(route => [route, new Set()]));
  for (const source of servedRoutes) {
    for (const raw of anchors(pages.get(source))) {
      if (!raw || /^(?:mailto|tel|javascript|data):/i.test(raw)) continue;
      const target = new URL(raw, new URL(source, SITE));
      const route = canonicalPath(target.href);
      if (inbound.has(route) && route !== source) inbound.get(route).add(source);
    }
  }
  const orphans = new Set([...inbound].filter(([, sources]) => sources.size === 0).map(([route]) => route));
  assert.deepEqual(orphans, classifiedOrphans);
});

test('every page without a contextual incoming link is explicitly classified', () => {
  const sitemap = fs.readFileSync(path.join(DIST, 'sitemap-0.xml'), 'utf8');
  const sitemapRoutes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]).pathname);
  const contextualInbound = new Map(sitemapRoutes.map(route => [route, new Set()]));
  for (const source of servedRoutes) {
    for (const record of anchorRecords(pages.get(source))) {
      if (record.context !== 'contextual' || /^(?:mailto|tel|javascript|data):/i.test(record.href)) continue;
      const target = new URL(record.href, new URL(source, SITE));
      const route = canonicalPath(target.href);
      if (contextualInbound.has(route) && route !== source) contextualInbound.get(route).add(source);
    }
  }
  const contextualOrphans = new Set([...contextualInbound].filter(([, sources]) => sources.size === 0).map(([route]) => route));
  assert.deepEqual(contextualOrphans, new Set(exceptions.contextualOrphans));
});

test('every retained WordPress import URL is unique and preserved, redirected, or explicitly approval-blocked', () => {
  const git = gitBinary();
  const files = execFileSync(git, ['ls-tree','-r','--name-only',HISTORICAL_IMPORT_COMMIT,'src/content/posts','src/content/products'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  assert.ok(files.length > 0, 'retained import commit contains no content records');
  const unresolved = [];
  const originals = new Set();
  for (const file of files) {
    const source = execFileSync(git, ['show',`${HISTORICAL_IMPORT_COMMIT}:${file}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    const original = source.match(/^original_url:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '');
    assert.ok(original, `missing retained original_url in ${file}`);
    const route = new URL(original, SITE).pathname;
    assert.ok(!originals.has(route), `duplicate retained original URL ${route}`);
    originals.add(route);
    if (!servedRoutes.has(route) && !redirects.has(route)) unresolved.push(route);
  }
  assert.deepEqual(new Set(unresolved), approvalRequiredHistoricalUrls);
});

test('known consolidation decisions remain unaltered pending Vanessa approval', () => {
  assert.ok(servedRoutes.has('/major-arcana-2/'));
  assert.ok(!redirects.has('/major-arcana/'));
  assert.ok(!redirects.has('/major-arcana-tarot/'));
  assert.ok(servedRoutes.has('/minor-arcana/'));
  assert.ok(servedRoutes.has('/minor-arcana-tarot/'));
});

test('the post-build normalization report covers the complete rendered anchor set', () => {
  const report = JSON.parse(fs.readFileSync(path.join(DIST, 'internal-link-normalization.json'), 'utf8'));
  const discoveredAnchors = [...pages.values()].reduce((total, html) => total + anchors(html).length, 0);
  assert.equal(report.htmlFiles, pages.size);
  assert.equal(report.linksInspected, discoveredAnchors);
  assert.equal(report.linksChanged, report.changes.length);
  assert.equal(report.parser, 'static HTML tags; script/style/textarea/title raw text excluded');
  assert.ok(report.linksChanged > 0, 'normalizer made no changes; remove it or explain why');
});

test('forms and runtime-generated daily journal links use direct canonical destinations at source', () => {
  const home = pages.get('/');
  assert.match(home, /<form\b[^>]*action=["']\/10-steps-to-embody-the-goddess-free-download\/["']/i);
  for (const [route, html] of pages) {
    assert.doesNotMatch(html, /\/daily-tarot\?room=/, `runtime or static noncanonical daily-journal link on ${route}`);
  }
});

test('historical category and ghost-page regressions remain directly mapped', () => {
  const required = new Map([
    ['/tarot-card-meanings/minor-arcana-tarot/', '/minor-arcana-tarot/'],
    ['/tarot-card-meanings/the-hierophant-tarot/', '/the-hierophant-tarot/'],
    ['/tarot-card-meanings/the-fool-tarot/', '/the-fool-tarot/'],
    ['/home/the-hierophant-tarot/', '/the-hierophant-tarot/'],
    ['/home/two-of-pentacles-tarot/', '/two-of-pentacles-tarot/'],
  ]);
  for (const [source, destination] of required) {
    assert.equal(redirects.get(source)?.destination, destination, `missing historical direct mapping ${source}`);
  }
  assert.ok(!routes.has('/home/'), 'legacy /home/ must redirect without generating a competing page');
  assert.equal(redirects.get('/home/')?.destination, '/');
});
