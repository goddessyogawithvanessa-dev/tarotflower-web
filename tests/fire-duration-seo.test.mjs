import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('public FIRE copy uses the rounded 45-minute duration and keeps total-experience guidance distinct', async () => {
  const sales = await read('src/pages/step-into-your-fire.astro');
  assert.match(sales, /complete 45-minute guided video ritual/);
  assert.match(sales, /guided ritual video is 45 minutes/);
  assert.match(sales, /setting aside about an hour overall/);
  assert.doesNotMatch(sales, /approximately 42|42-minute|one-hour video ritual/i);

  for (const path of [
    'src/components/FireEditorialCTA.astro',
    'src/components/EvergreenEditorialJourney.astro',
    'src/layouts/Post.astro',
  ]) {
    const source = await read(path);
    assert.match(source, /45-minute guided ritual/);
    assert.doesNotMatch(source, /One-hour guided video ritual|approximately 42|42-minute guided/i);
  }
});

test('robots and sitemap rules index public pages while excluding private customer routes', async () => {
  const robots = await read('public/robots.txt');
  assert.match(robots, /User-agent: \*\nAllow: \//);
  for (const path of ['/admin/', '/api/', '/checkout/', '/library/', '/workbench/']) {
    assert.match(robots, new RegExp(`Disallow: ${path.replaceAll('/', '\\/')}`));
  }
  assert.match(robots, /Sitemap: https:\/\/tarotflower\.com\/sitemap-index\.xml/);

  const headers = await read('public/_headers');
  for (const route of ['/admin/*', '/api/*', '/checkout/*', '/library/*', '/workbench/*']) {
    assert.match(headers, new RegExp(`${route.replaceAll('/', '\\/').replace('*', '\\*')}\\n  X-Robots-Tag: noindex, nofollow`));
  }
  assert.doesNotMatch(headers, /^\/\*\s*\n\s*X-Robots-Tag:/m);

  const astro = await read('astro.config.mjs');
  assert.match(astro, /!page\.startsWith\('https:\/\/tarotflower\.com\/library\/'\)/);
  assert.match(astro, /!page\.startsWith\('https:\/\/tarotflower\.com\/checkout\/'\)/);
  assert.match(astro, /!page\.startsWith\('https:\/\/tarotflower\.com\/workbench\/'\)/);
  assert.doesNotMatch(astro, /page\.startsWith\('https:\/\/tarotflower\.com\/(?:shop|rituals|sacred-becoming)\/'\)/);
});
