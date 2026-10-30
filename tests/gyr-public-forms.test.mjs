import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const runtime = createRequire(require.resolve('wrangler/package.json'))('miniflare');
const sourcePath = file => new URL('../' + file, import.meta.url).pathname;
let mf;
let db;

async function apply(database, file) {
  const source = await readFile(sourcePath(file), 'utf8');
  for (const sql of source.replace(/^--.*$/gm, '').split(';').map(value => value.trim()).filter(Boolean)) {
    await database.prepare(sql).run();
  }
}

function request(path, fields, token) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  body.set('cf-turnstile-response', token);
  return [`https://tarotflower-web-dev.embodiedgoddesses.workers.dev${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: 'https://goddess-yoga-retreats.com',
      Referer: 'https://goddess-yoga-retreats.com/contact/',
    },
    body,
  }];
}

before(async () => {
  const options = { workers: [{
    name: 'email',
    modulesRoot: sourcePath(''),
    modules: [
      'worker/email-service/index.js',
      'worker/email-service/library-purchase-email.js',
      'worker/email-service/tarot-email-suite.js',
      'worker/email-service/circle-consent.js',
      'worker/circle/consent.js',
    ].map(file => ({ type: 'ESModule', path: sourcePath(file) })),
    compatibilityDate: '2026-07-18',
    d1Databases: ['DB'],
    bindings: {
      ALLOWED_ORIGINS: 'https://tarotflower.com,https://goddess-yoga-retreats.com',
      TURNSTILE_ALLOWED_HOSTNAMES: 'tarotflower.com,goddess-yoga-retreats.com',
      TURNSTILE_SECRET_KEY: 'test-secret',
      CONTACT_TURNSTILE_SITE_KEY: 'test-site-key',
      CONTACT_DRY_RUN: 'true',
    },
    serviceBindings: { ASSETS: () => new Response('Not found', { status: 404 }) },
    outboundService: async outboundRequest => {
      const form = await outboundRequest.formData();
      const action = form.get('response') === 'newsletter-token' ? 'newsletter' : 'contact';
      return Response.json({ success: true, hostname: 'goddess-yoga-retreats.com', action });
    },
  }] };
  mf = new runtime.Miniflare(runtime.convertV4MiniflareOptions ? runtime.convertV4MiniflareOptions(options) : options);
  db = await mf.getD1Database('DB', 'email');
  await apply(db, 'tests/fixtures/email-production-schema.sql');
  await apply(db, 'worker/email-service/migrations/0003_subscriber_activity_classification.sql');
});

after(async () => mf?.dispose());

test('GYR origin receives contact configuration with cross-origin permission', async () => {
  const response = await mf.dispatchFetch('https://tarotflower-web-dev.embodiedgoddesses.workers.dev/api/contact/config', {
    headers: { Origin: 'https://goddess-yoga-retreats.com' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://goddess-yoga-retreats.com');
  assert.equal((await response.json()).siteKey, 'test-site-key');
});

test('GYR contact form uses the shared contact route with its own source identity', async () => {
  const response = await mf.dispatchFetch(...request('/api/contact', {
    site: 'goddess-yoga-retreats',
    name: 'Goddess Guest',
    email: 'guest@example.test',
    message: 'I would love to learn more about the next retreat.',
  }, 'contact-token'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://goddess-yoga-retreats.com');
  assert.equal((await response.json()).ok, true);
});

test('GYR newsletter opt-in enters the existing master list with consent and source tags', async () => {
  const response = await mf.dispatchFetch(...request('/api/newsletter', {
    site: 'goddess-yoga-retreats',
    source_path: '/contact',
    first_name: 'Goddess',
    email: 'newsletter@example.test',
    consent: 'true',
  }, 'newsletter-token'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);

  const subscriber = await db.prepare('SELECT * FROM subscribers WHERE email = ?').bind('newsletter@example.test').first();
  assert.equal(subscriber.status, 'active');
  const consent = await db.prepare('SELECT * FROM subscriber_consents WHERE subscriber_id = ?').bind(subscriber.id).first();
  assert.equal(consent.source_path, 'https://goddess-yoga-retreats.com/contact');
  assert.equal(consent.lead_magnet_slug, 'newsletter');
  assert.match(consent.consent_text, /Goddess Yoga Retreats updates/);
  const tags = await db.prepare('SELECT tag FROM subscriber_tags WHERE subscriber_id = ? ORDER BY tag').bind(subscriber.id).all();
  assert.deepEqual(tags.results.map(row => row.tag), ['ecosystem:vanessa', 'source:goddess-yoga-retreats']);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM subscriber_sequence_enrollments').first()).n, 0);
});

test('GYR destination interest adds the destination tag and event metadata', async () => {
  const response = await mf.dispatchFetch(...request('/api/newsletter', {
    site: 'goddess-yoga-retreats',
    source_path: '/destinations/puglia-italy',
    destination_interest: 'puglia-italy',
    first_name: 'Puglia',
    email: 'puglia-interest@example.test',
    consent: 'true',
  }, 'newsletter-token'));
  assert.equal(response.status, 200);

  const subscriber = await db.prepare('SELECT * FROM subscribers WHERE email = ?').bind('puglia-interest@example.test').first();
  const tags = await db.prepare('SELECT tag FROM subscriber_tags WHERE subscriber_id = ? ORDER BY tag').bind(subscriber.id).all();
  assert.deepEqual(tags.results.map(row => row.tag), ['ecosystem:vanessa', 'interest:gyr-destination:puglia-italy', 'source:goddess-yoga-retreats']);
  const event = await db.prepare("SELECT metadata_json FROM subscriber_events WHERE subscriber_id = ? AND event_type = 'newsletter_subscribed'").bind(subscriber.id).first();
  assert.deepEqual(JSON.parse(event.metadata_json), {
    source: 'goddess-yoga-retreats',
    source_path: 'https://goddess-yoga-retreats.com/destinations/puglia-italy',
    destination_interest: 'puglia-italy',
  });
});

test('GYR newsletter opt-in does not reactivate a suppressed address', async () => {
  await db.prepare("INSERT INTO subscribers(id,email,status) VALUES ('suppressed-gyr','suppressed-gyr@example.test','suppressed')").run();
  const response = await mf.dispatchFetch(...request('/api/newsletter', {
    site: 'goddess-yoga-retreats',
    source_path: '/contact',
    email: 'suppressed-gyr@example.test',
    consent: 'true',
  }, 'newsletter-token'));
  assert.equal(response.status, 200);
  assert.equal((await db.prepare("SELECT status FROM subscribers WHERE id = 'suppressed-gyr'").first()).status, 'suppressed');
});
