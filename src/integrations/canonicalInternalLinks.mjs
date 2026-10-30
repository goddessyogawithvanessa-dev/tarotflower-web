import fs from 'node:fs/promises';
import path from 'node:path';

const SITE = 'https://tarotflower.com';

async function walk(dir) {
  const files = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

function routeFor(file, dir) {
  const rel = path.relative(dir, file).replaceAll(path.sep, '/');
  if (rel === 'index.html') return '/';
  if (rel === '404.html') return '/404.html';
  if (rel.endsWith('/index.html')) return `/${rel.slice(0, -'index.html'.length)}`;
  return `/${rel}`;
}

function redirects(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [source, destination, status = '301'] = trimmed.split(/\s+/);
    if (/^30[12378]$/.test(status) && !map.has(source)) map.set(source, destination);
  }
  return map;
}

function destinationFor(raw, sourceRoute, generatedRoutes, redirectMap) {
  if (!raw || raw.startsWith('#') || /^(?:mailto|tel|javascript|data):/i.test(raw)) return raw;
  let url;
  try { url = new URL(raw, new URL(sourceRoute, SITE)); } catch { return raw; }
  if (!['tarotflower.com', 'www.tarotflower.com'].includes(url.hostname.toLowerCase())) return raw;

  const originalSearch = url.search;
  const originalHash = url.hash;
  const seen = new Set();
  for (let hop = 0; hop < 12; hop++) {
    if (seen.has(url.href)) return raw;
    seen.add(url.href);
    const redirect = redirectMap.get(url.pathname);
    if (!redirect) break;
    url = new URL(redirect, SITE);
  }

  if (url.hostname !== 'tarotflower.com') {
    if (!url.search) url.search = originalSearch;
    if (!url.hash) url.hash = originalHash;
    return url.href;
  }

  let route = url.pathname.replace(/\/{2,}/g, '/');
  if (route !== '/' && !path.posix.extname(route) && !route.endsWith('/')) route += '/';
  if (!generatedRoutes.has(route)) return raw;
  return `${route}${url.search || originalSearch}${url.hash || originalHash}`;
}

function tagEnd(html, start) {
  let quote = '';
  for (let index = start; index < html.length; index++) {
    const character = html[index];
    if (quote) {
      if (character === quote) quote = '';
    } else if (character === '"' || character === "'") quote = character;
    else if (character === '>') return index + 1;
  }
  return html.length;
}

function rewriteStaticAnchors(html, rewrite) {
  const rawTextTags = new Set(['script', 'style', 'textarea', 'title']);
  let output = '';
  let cursor = 0;
  while (cursor < html.length) {
    const opening = html.indexOf('<', cursor);
    if (opening === -1) return output + html.slice(cursor);
    output += html.slice(cursor, opening);
    if (html.startsWith('<!--', opening)) {
      const end = html.indexOf('-->', opening + 4);
      const next = end === -1 ? html.length : end + 3;
      output += html.slice(opening, next);
      cursor = next;
      continue;
    }
    const match = html.slice(opening).match(/^<\s*(\/?)\s*([A-Za-z][\w:-]*)/);
    if (!match) {
      output += '<';
      cursor = opening + 1;
      continue;
    }
    const closing = Boolean(match[1]);
    const name = match[2].toLowerCase();
    const end = tagEnd(html, opening + match[0].length);
    let tag = html.slice(opening, end);
    if (!closing && name === 'a') tag = rewrite(tag);
    output += tag;
    cursor = end;
    if (!closing && rawTextTags.has(name)) {
      const closePattern = new RegExp(`<\\/\\s*${name}\\s*>`, 'ig');
      closePattern.lastIndex = cursor;
      const close = closePattern.exec(html);
      const next = close ? close.index + close[0].length : html.length;
      output += html.slice(cursor, next);
      cursor = next;
    }
  }
  return output;
}

export async function normalizeCanonicalInternalLinks(dir) {
  const htmlFiles = (await walk(dir)).filter(file => file.endsWith('.html'));
  const generatedRoutes = new Set(htmlFiles.map(file => routeFor(file, dir)));
  const redirectMap = redirects(await fs.readFile(path.join(dir, '_redirects'), 'utf8'));
  const changedByDestination = new Map();
  const changedBySource = new Map();
  const changes = [];
  let linksInspected = 0;
  let linksChanged = 0;

  for (const file of htmlFiles) {
    const sourceRoute = routeFor(file, dir);
    const html = await fs.readFile(file, 'utf8');
    const updated = rewriteStaticAnchors(html, tag => tag.replace(/(\bhref\s*=\s*)(["'])(.*?)\2/i, (attribute, prefix, quote, raw) => {
      linksInspected++;
      const canonical = destinationFor(raw, sourceRoute, generatedRoutes, redirectMap);
      if (canonical === raw) return attribute;
      linksChanged++;
      const key = `${raw} -> ${canonical}`;
      changedByDestination.set(key, (changedByDestination.get(key) || 0) + 1);
      changedBySource.set(sourceRoute, (changedBySource.get(sourceRoute) || 0) + 1);
      changes.push({ source: sourceRoute, before: raw, after: canonical });
      return `${prefix}${quote}${canonical}${quote}`;
    }));
    if (updated !== html) await fs.writeFile(file, updated);
  }

  const report = {
    htmlFiles: htmlFiles.length,
    linksInspected,
    linksChanged,
    sourcesChanged: changedBySource.size,
    parser: 'static HTML tags; script/style/textarea/title raw text excluded',
    changes,
    destinationRewrites: [...changedByDestination].map(([rewrite, count]) => ({ rewrite, count })).sort((a, b) => b.count - a.count),
    sourceCounts: [...changedBySource].map(([source, count]) => ({ source, count })).sort((a, b) => a.source.localeCompare(b.source)),
  };
  await fs.writeFile(path.join(dir, 'internal-link-normalization.json'), JSON.stringify(report, null, 2));
  return report;
}

export default function canonicalInternalLinks() {
  return {
    name: 'tarot-flower-canonical-internal-links',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        if (process.env.TF_DISABLE_CANONICAL_LINK_NORMALIZER === '1') {
          logger.info('canonical internal-link normalization disabled for baseline verification');
          return;
        }
        const report = await normalizeCanonicalInternalLinks(dir.pathname);
        logger.info(`normalized ${report.linksChanged} of ${report.linksInspected} rendered internal anchors across ${report.sourcesChanged} pages`);
      },
    },
  };
}
