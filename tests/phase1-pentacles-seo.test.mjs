import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const targets = [
  {
    slug: 'pentacles-tarot',
    title: 'Pentacles Tarot',
    contentHash: 'f95a8203067eeed9a26a5f79f8f562fe2c8051daf4c3ca54ba101f3000c8da8c',
  },
  {
    slug: 'two-of-pentacles-tarot',
    title: 'The Two of Pentacles Tarot Card Meaning',
    contentHash: '1404def97e3d3dc3801fd7269d30f9b7c2cb972ef339cf3bbc842fdde464bb42',
  },
  {
    slug: 'page-of-pentacles-tarot',
    title: 'The Page of Pentacles Tarot Card Meaning',
    contentHash: 'f2c173aa0823c14d6fc6a5475b75beb61b9733f645f37b1e5290fd944a472fce',
  },
];

test('the three published source files remain byte-for-byte unchanged', async () => {
  for (const target of targets) {
    const source = await read(`src/content/posts/${target.slug}.md`);
    assert.equal(sha256(source), target.contentHash, `${target.slug}.md changed`);
  }
});

test('the built experiment pages have self-canonicals, hierarchy links, related links, and breadcrumb schema', async () => {
  for (const target of targets) {
    const html = await read(`dist/${target.slug}/index.html`);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://tarotflower\\.com/${target.slug}/">`));
    assert.doesNotMatch(html, /<meta name="robots" content="noindex/i);
    assert.match(html, /class="tarot-breadcrumbs"/);
    assert.match(html, /"@type":"BreadcrumbList"/);
    assert.match(html, new RegExp(`<h1>${target.title}</h1>`));

    const related = html.match(/<nav class="card-continue-links pentacles-experiment-links"[\s\S]*?<\/nav>/)?.[0];
    assert.ok(related, `missing related navigation on ${target.slug}`);
    assert.doesNotMatch(related, new RegExp(`href="/${target.slug}/"`), 'related navigation must not self-link');
    for (const other of targets.filter((candidate) => candidate.slug !== target.slug)) {
      assert.match(related, new RegExp(`href="/${other.slug}/"`));
    }
  }
});

test('unchanged Pentacles comparison pages do not receive experiment markup', async () => {
  for (const slug of ['five-of-pentacles-tarot', 'seven-of-pentacles-tarot']) {
    const html = await read(`dist/${slug}/index.html`);
    assert.doesNotMatch(html, /tarot-breadcrumbs|pentacles-experiment-links|"@type":"BreadcrumbList"/);
  }
});

test('legacy card URLs remain direct one-hop permanent redirects', async () => {
  const redirects = await read('public/_redirects');
  for (const slug of ['two-of-pentacles-tarot', 'page-of-pentacles-tarot']) {
    assert.match(redirects, new RegExp(`^/tarot-card-meanings/${slug}/ /${slug}/ 301$`, 'm'));
    assert.match(redirects, new RegExp(`^/home/${slug}/ /${slug}/ 301$`, 'm'));
  }
});
