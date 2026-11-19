import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';

const require = createRequire(import.meta.url);
const runtime = createRequire(require.resolve('wrangler/package.json'))('miniflare');
const sourcePath = file => new URL(`../${file}`, import.meta.url).pathname;
const forwarded = [];
let mf;

before(() => {
  const options = {
    workers: [{
      name: 'site',
      modulesRoot: sourcePath(''),
      modules: [
        'worker/index.js',
        'worker/workbench/access.js',
        'worker/circle/identity.js',
        'worker/circle/passwords.js',
        'worker/circle/consent.js',
      ].map(file => ({ type: 'ESModule', path: sourcePath(file) })),
      compatibilityDate: '2026-07-18',
      compatibilityFlags: ['nodejs_compat'],
      bindings: { APP_ORIGIN: 'https://tarotflower.com' },
      serviceBindings: {
        EMAIL_SERVICE: async request => {
          forwarded.push({
            url: request.url,
            method: request.method,
            body: request.method === 'POST' ? await request.text() : '',
          });
          if (new URL(request.url).pathname === '/api/contact/config') {
            return Response.json({ siteKey: 'production-site-key' });
          }
          return Response.json({ ok: true });
        },
        ASSETS: () => new Response('Not found', { status: 404 }),
      },
    }],
  };
  mf = new runtime.Miniflare(runtime.convertV4MiniflareOptions ? runtime.convertV4MiniflareOptions(options) : options);
});

after(async () => mf?.dispose());

test('production origin serves contact configuration through the private email service', async () => {
  const response = await mf.dispatchFetch('https://tarotflower.com/api/contact/config');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).siteKey, 'production-site-key');
  assert.deepEqual(forwarded.at(-1), {
    url: 'https://email.internal/api/contact/config',
    method: 'GET',
    body: '',
  });
});

for (const route of ['/api/contact', '/api/lead-magnet', '/api/oracle-waitlist', '/api/tarot-newsletter']) {
  test(`${route} posts through the private email service`, async () => {
    const response = await mf.dispatchFetch(`https://tarotflower.com${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'email=reader%40example.test',
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
    assert.deepEqual(forwarded.at(-1), {
      url: `https://email.internal${route}`,
      method: 'POST',
      body: 'email=reader%40example.test',
    });
  });
}

test('production form markup contains only same-origin public endpoints', async () => {
  const files = [
    'src/pages/contact.astro',
    'src/components/EmailOptIn.astro',
    'src/components/OracleWaitlist.astro',
    'src/components/TarotNewsletter.astro',
  ];
  const sources = await Promise.all(files.map(file => readFile(sourcePath(file), 'utf8')));
  for (const [index, source] of sources.entries()) {
    assert.doesNotMatch(source, /tarotflower-web-dev\.embodiedgoddesses\.workers\.dev/, files[index]);
    assert.match(source, /\/api\/contact\/config/, files[index]);
  }
});
