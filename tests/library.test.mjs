import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const runtime = createRequire(require.resolve('wrangler/package.json'))('miniflare');
class Miniflare extends runtime.Miniflare { constructor(options) { options.modules = [{ type: 'ESModule', path: options.scriptPath }, { type: 'ESModule', path: new URL('../worker/workbench/access.js', import.meta.url).pathname }, { type: 'ESModule', path: new URL('../worker/circle/identity.js', import.meta.url).pathname }, {type:'ESModule',path:new URL('../worker/circle/passwords.js',import.meta.url).pathname}, {type:'ESModule',path:new URL('../worker/circle/consent.js',import.meta.url).pathname}]; super(runtime.convertV4MiniflareOptions ? runtime.convertV4MiniflareOptions(options) : options); } }

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webhookSecret = 'whsec_local_prototype';
const testEmail = 'ritual-buyer@example.com';
const priceId = 'price_1Tyt6bHxP7ZQh1un7maRbGC4';
let mf;
let db;
let bucket;
const purchaseEmails = [];

before(async () => {
  mf = new Miniflare({
    modules: true,
    scriptPath: join(root, 'worker', 'index.js'),
    compatibilityFlags: ['nodejs_compat'], compatibilityDate: '2026-07-18',
    bindings: {
      APP_ORIGIN: 'http://localhost',
      LIBRARY_TEST_MODE: 'true',
      STRIPE_SECRET_KEY: 'sk_test_local_prototype',
      STRIPE_WEBHOOK_SECRET: webhookSecret,
      TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
      TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
      TOKEN_PEPPER: 'local-test-pepper-that-is-at-least-32-characters',
      FIRE_COMPANION_ASSET_ID: 'guide',
    },
    d1Databases: ['LIBRARY_DB'],
    r2Buckets: ['LIBRARY_ASSETS'],
    serviceBindings: {
      EMAIL_SERVICE: async (request) => {
        purchaseEmails.push({
          url: request.url,
          body: await request.json(),
        });
        return Response.json({ ok: true });
      },
    },
    outboundService: async (request) => {
      const url = new URL(request.url);
      if (url.hostname !== 'api.stripe.com') return new Response('blocked', { status: 403 });
      const sessionId = url.pathname.split('/').pop();
      return Response.json(stripeSession(sessionId));
    },
  });

  db = await mf.getD1Database('LIBRARY_DB');
  bucket = await mf.getR2Bucket('LIBRARY_ASSETS');
  await executeSql(await readFile(join(root, 'worker', 'schema.sql'), 'utf8'));
  await executeSql(await readFile(join(root, 'worker', 'seed.sql'), 'utf8'));
  await db.prepare(
    `UPDATE products
     SET slug = 'step-into-the-fire-test',
         title = 'Step Into Your Fire',
         description = 'A ritual for courage and confidence.',
         experience_path = '/library/rituals/step-into-the-fire-test/',
         assets_json = replace(
           replace(
             replace(assets_json,
               'step-into-your-fire-guide.pdf',
               'step-into-the-fire-test-guide.pdf'),
             'step-into-your-fire-music.mp3',
             'step-into-the-fire-test-music.mp3'),
           'step-into-your-fire-movement.mp4',
           'step-into-the-fire-test-movement.mp4')
     WHERE id = 'ritual-step-into-the-fire-test'`,
  ).run();
  await executeSql(await readFile(join(root, 'worker', 'migrations', '0002_step_into_your_fire_access.sql'), 'utf8'));
  await executeSql(await readFile(join(root, 'worker', 'migrations', '0003_canonical_fire_product_identity.sql'), 'utf8'));
  await bucket.put('production/step-into-your-fire/step-into-your-fire-grimoire.pdf', new TextEncoder().encode('%PDF-local-test'));
});

after(async () => {
  await mf?.dispose();
});

test('rejects an invalid Stripe webhook signature', async () => {
  const event = checkoutEvent('evt_bad_signature', 'checkout.session.completed');
  const response = await mf.dispatchFetch('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: { 'Stripe-Signature': 't=1,v1=invalid' },
    body: JSON.stringify(event),
  });
  assert.equal(response.status, 400);
});

test('grants one permanent entitlement after a successful signed Stripe payment', async () => {
  const event = checkoutEvent('evt_success', 'checkout.session.completed');
  const payload = JSON.stringify(event);
  const response = await mf.dispatchFetch('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: { 'Stripe-Signature': stripeSignature(payload) },
    body: payload,
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).granted, true);
  const entitlement = await db.prepare(
    'SELECT * FROM entitlements WHERE customer_email = ?1',
  ).bind(testEmail).first();
  assert.equal(entitlement.product_id, 'ritual-step-into-the-fire-test');
  assert.equal(entitlement.revoked_at, null);
  const email = purchaseEmails.find((item) => item.url.endsWith('/api/library-purchase-access'));
  assert.ok(email);
  assert.equal(email.body.to, testEmail);
  assert.equal(email.body.subject, 'Your FIRE Ritual is ready 🔥');
  assert.equal(email.body.productTitle, 'Step Into Your Fire');
  assert.equal(email.body.libraryUrl, 'http://localhost/library/');
  assert.equal(email.body.ritualAccessUrl, undefined);
  assert.equal(email.body.downloads, undefined);
});

test('purchase email uses one durable My Library destination and no protected asset links', async () => {
  const email = purchaseEmails.find((item) => item.url.endsWith('/api/library-purchase-access'));
  assert.deepEqual(Object.keys(email.body).sort(), ['libraryUrl', 'productTitle', 'subject', 'to']);
  assert.equal(email.body.libraryUrl, 'http://localhost/library/');
});

test('handles duplicate webhook delivery idempotently', async () => {
  const event = checkoutEvent('evt_success', 'checkout.session.completed');
  const payload = JSON.stringify(event);
  const response = await mf.dispatchFetch('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: { 'Stripe-Signature': stripeSignature(payload) },
    body: payload,
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).duplicate, true);
  const purchases = await db.prepare('SELECT COUNT(*) AS count FROM purchases').first();
  assert.equal(Number(purchases.count), 1);
  assert.equal(purchaseEmails.filter((item) => item.url.endsWith('/api/library-purchase-access')).length, 1);
});

test('does not grant access for a failed or cancelled checkout', async () => {
  const event = checkoutEvent('evt_cancelled', 'checkout.session.expired');
  event.data.object.payment_status = 'unpaid';
  const payload = JSON.stringify(event);
  const response = await mf.dispatchFetch('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: { 'Stripe-Signature': stripeSignature(payload) },
    body: payload,
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ignored, true);
  const purchases = await db.prepare(
    'SELECT COUNT(*) AS count FROM purchases WHERE stripe_checkout_session_id = ?1',
  ).bind('cs_test_cancelled').first();
  assert.equal(Number(purchases.count), 0);
});

test('returns the same generic response for unknown and entitled emails', async () => {
  const known = await requestLink(testEmail);
  const unknown = await requestLink('unknown@example.com', '198.51.100.2');
  assert.equal(known.message, unknown.message);
  assert.ok(known.debugMagicLink);
  assert.equal(unknown.debugMagicLink, undefined);
});

test('rate limits repeated magic-link requests without revealing account state', async () => {
  await db.prepare('DELETE FROM auth_rate_limits').run();
  let last;
  for (let index = 0; index < 7; index += 1) {
    last = await requestLink(testEmail, '203.0.113.25', false);
  }
  assert.equal(last.debugMagicLink, undefined);
  assert.match(last.message, /secure sign-in link/i);
});

test('consumes a valid magic link once and creates a secure session', async () => {
  const result = await requestLink(testEmail, '198.51.100.3');
  const response = await mf.dispatchFetch(result.debugMagicLink, { redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'http://localhost/library/');
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /tf_library_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Max-Age=2592000/);

  const reused = await mf.dispatchFetch(result.debugMagicLink, { redirect: 'manual' });
  assert.equal(reused.status, 302);
  assert.match(reused.headers.get('location'), /status=invalid/);
});

test('rejects an expired magic link', async () => {
  const result = await requestLink(testEmail, '198.51.100.4');
  const token = new URL(result.debugMagicLink).searchParams.get('token');
  const tokenHash = await sha256(token);
  await db.prepare('UPDATE magic_links SET expires_at = 1 WHERE token_hash = ?1').bind(tokenHash).run();
  const response = await mf.dispatchFetch(result.debugMagicLink, { redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.match(response.headers.get('location'), /status=invalid/);
});

test('denies unauthenticated library, ritual, and file requests', async () => {
  const library = await mf.dispatchFetch('http://localhost/api/library/session');
  assert.equal(library.status, 401);
  const ritual = await mf.dispatchFetch(
    'http://localhost/library/rituals/step-into-your-fire/',
    { redirect: 'manual' },
  );
  assert.equal(ritual.status, 302);
  assert.equal(ritual.headers.get('location'), 'http://localhost/library/login/');
  assert.match(ritual.headers.get('cache-control'), /no-store/);
  const file = await mf.dispatchFetch('http://localhost/api/library/files/step-into-your-fire/guide');
  assert.equal(file.status, 401);
  const video = await mf.dispatchFetch('http://localhost/api/library/video/step-into-your-fire');
  assert.equal(video.status, 401);
});

test('lists the final grimoire, protects it, and removes obsolete segmented assets', async () => {
  const cookie = await createSessionCookie('198.51.100.5');
  const headers = { Cookie: cookie };
  const library = await mf.dispatchFetch('http://localhost/api/library/session', { headers });
  assert.equal(library.status, 200);
  const body = await library.json();
  assert.equal(body.products.length, 1);
  assert.equal(body.products[0].slug, 'step-into-your-fire');
  assert.equal(body.products[0].title, 'Step Into Your Fire');
  assert.equal(
    body.products[0].imagePath,
    '/images/digital-rituals/step-into-the-fire/goddess-kali-warrior-hero-wide.png',
  );
  assert.equal(body.products[0].experiencePath, '/library/rituals/step-into-your-fire/');
  assert.equal(body.products[0].assets.length, 1);
  assert.equal(body.products[0].assets[0].id, 'guide');
  assert.equal(JSON.stringify(body).includes('test/step-into-the-fire'), false);
  assert.equal(JSON.stringify(body).includes('step-into-the-fire-test'), false);

  const view = await mf.dispatchFetch('http://localhost/api/library/files/step-into-your-fire/guide', { headers });
  assert.equal(view.status, 200);
  assert.match(view.headers.get('content-disposition'), /^inline/);
  const download = await mf.dispatchFetch('http://localhost/api/library/files/step-into-your-fire/guide?download=1', { headers });
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-disposition'), /^attachment/);

  for (const asset of ['music', 'movement', 'video-initiation', 'video-destruction', 'video-guardian', 'video-freedom']) {
    const obsolete = await mf.dispatchFetch(`http://localhost/api/library/files/step-into-your-fire/${asset}`, { headers });
    assert.equal(obsolete.status, 404);
  }

  const video = await mf.dispatchFetch('http://localhost/api/library/video/step-into-your-fire', { headers });
  assert.equal(video.status, 503);
});

test('rejects an expired session', async () => {
  const cookie = await createSessionCookie('198.51.100.6');
  await db.prepare('UPDATE sessions SET expires_at = 1 WHERE revoked_at IS NULL').run();
  const response = await mf.dispatchFetch('http://localhost/api/library/session', { headers: { Cookie: cookie } });
  assert.equal(response.status, 401);
});

test('logout revokes the current session', async () => {
  const cookie = await createSessionCookie('198.51.100.7');
  const logout = await mf.dispatchFetch('http://localhost/api/library/logout', {
    method: 'POST',
    headers: { Cookie: cookie },
  });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  const response = await mf.dispatchFetch('http://localhost/api/library/session', { headers: { Cookie: cookie } });
  assert.equal(response.status, 401);
});

test('first checkout sends only the welcome email, then account submission verifies and enters the ritual', async () => {
  const before = await db.prepare('SELECT COUNT(*) AS count FROM sessions').first();
  const emailCount = purchaseEmails.length;
  const response = await mf.dispatchFetch(
    'http://localhost/library/claim?session_id=cs_test_immediate',
    { redirect: 'manual' },
  );
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'http://localhost/library/setup/?status=request');
  const checkoutCookie = response.headers.get('set-cookie').split(';', 1)[0];
  assert.match(checkoutCookie, /^tf_library_checkout_context=/);
  const context = await mf.dispatchFetch('http://localhost/api/library/setup-context', { headers: { Cookie: checkoutCookie } });
  assert.equal(context.status, 200);
  assert.equal((await context.json()).email, testEmail);

  assert.equal(purchaseEmails.slice(emailCount).some((item) => item.url.endsWith('/api/library-account-verification')), false);
  assert.equal(purchaseEmails.slice(emailCount).some((item) => item.url.endsWith('/api/library-password-link')), false);

  const tooShortPassword = 'Ember!234';
  const rejected = await mf.dispatchFetch('http://localhost/api/library/account/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: checkoutCookie,
      'CF-Connecting-IP': '198.51.100.28' },
    body: JSON.stringify({ email: testEmail, password: tooShortPassword, confirmPassword: tooShortPassword,
      turnstileToken: 'test-pass', destinationPath: '/library/rituals/step-into-your-fire/' }),
  });
  assert.equal(rejected.status, 400);
  assert.match((await rejected.json()).error, /10–128 characters/);

  const password = 'Ember!2345';
  const created = await mf.dispatchFetch('http://localhost/api/library/account/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: checkoutCookie,
      'CF-Connecting-IP': '198.51.100.28' },
    body: JSON.stringify({ email: testEmail, password, confirmPassword: password,
      turnstileToken: 'test-pass', destinationPath: '/library/rituals/step-into-your-fire/' }),
  });
  assert.equal(created.status, 202);
  const createdBody = await created.json();
  assert.equal(createdBody.message, 'Almost there! Please check your email.');
  assert.match(createdBody.detail, /VERIFY MY EMAIL/);
  const verificationEmail = purchaseEmails.slice(emailCount).find((item) => item.url.endsWith('/api/library-account-verification'));
  assert.ok(verificationEmail);
  assert.equal(verificationEmail.body.expiresInHours, 24);

  const verified = await mf.dispatchFetch(verificationEmail.body.verificationLink, { redirect: 'manual' });
  assert.equal(verified.status, 302);
  assert.equal(verified.headers.get('location'), 'http://localhost/library/rituals/step-into-your-fire/');
  const sessionCookie = extractCookie(verified.headers.get('set-cookie'), 'tf_library_session');
  assert.ok(sessionCookie);
  const library = await mf.dispatchFetch('http://localhost/api/library/session', { headers: { Cookie: sessionCookie } });
  assert.equal(library.status, 200);

  const replay = await mf.dispatchFetch(
    'http://localhost/library/claim?session_id=cs_test_immediate',
    { redirect: 'manual' },
  );
  assert.equal(replay.status, 302);
  const recovery = new URL(replay.headers.get('location'));
  assert.equal(recovery.pathname, '/library/login/');
  assert.equal(recovery.searchParams.get('status'), 'purchase');
  assert.equal(recovery.searchParams.get('next'), '/library/rituals/step-into-your-fire/');
  const after = await db.prepare('SELECT COUNT(*) AS count FROM sessions').first();
  assert.equal(Number(after.count), Number(before.count) + 1);
});

test('expired verification has a resend path and the new link activates on another device', async () => {
  const email = 'delayed-buyer@example.com';
  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    db.prepare(`INSERT INTO customers(email,user_id,created_at,updated_at) VALUES (?1,?2,?3,?3)`)
      .bind(email, 'delayed-buyer-user', now),
    db.prepare(`INSERT INTO purchases(stripe_checkout_session_id,customer_email,product_id,amount_total,currency,payment_status,purchased_at)
      VALUES ('cs_test_delayed',?1,'ritual-step-into-the-fire-test',4900,'usd','paid',?2)`).bind(email, now),
    db.prepare(`INSERT INTO entitlements(customer_email,product_id,source_checkout_session_id,granted_at,revoked_at)
      VALUES (?1,'ritual-step-into-the-fire-test','cs_test_delayed',?2,NULL)`).bind(email, now),
  ]);
  await db.prepare('DELETE FROM auth_rate_limits').run();
  const before = purchaseEmails.length;
  const password = 'Rose garden ember sanctuary';
  const registration = await mf.dispatchFetch('http://localhost/api/library/account/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.80' },
    body: JSON.stringify({ email, password, confirmPassword: password, turnstileToken: 'test-pass' }),
  });
  assert.equal(registration.status, 202);
  const firstEmail = purchaseEmails.slice(before).find((item) => item.url.endsWith('/api/library-account-verification'));
  const firstToken = new URL(firstEmail.body.verificationLink).searchParams.get('token');
  await db.prepare('UPDATE identity_password_tokens SET expires_at=1 WHERE token_hash=?1').bind(await sha256(firstToken)).run();
  const expired = await mf.dispatchFetch(firstEmail.body.verificationLink, { redirect: 'manual' });
  assert.equal(expired.status, 302);
  assert.equal(expired.headers.get('location'), 'http://localhost/library/setup/?status=expired');

  await db.prepare('DELETE FROM auth_rate_limits').run();
  const resent = await mf.dispatchFetch('http://localhost/api/library/account/resend-verification', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.81' },
    body: JSON.stringify({ email, turnstileToken: 'test-pass' }),
  });
  assert.equal(resent.status, 202);
  const verificationEmails = purchaseEmails.slice(before).filter((item) => item.url.endsWith('/api/library-account-verification'));
  assert.equal(verificationEmails.length, 2);
  const activated = await mf.dispatchFetch(verificationEmails[1].body.verificationLink, { redirect: 'manual' });
  assert.equal(activated.status, 302);
  assert.equal(activated.headers.get('location'), 'http://localhost/library/rituals/step-into-your-fire/');
  assert.ok(extractCookie(activated.headers.get('set-cookie'), 'tf_library_session'));
});

test('recovery magic link preserves an entitled ritual destination', async () => {
  const result = await requestLink(
    testEmail,
    '198.51.100.10',
    true,
    '/library/rituals/step-into-your-fire/',
  );
  const response = await mf.dispatchFetch(result.debugMagicLink, { redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'http://localhost/library/rituals/step-into-your-fire/');
});

test('preserves entitled legacy links while removing the test slug from the customer journey', async () => {
  const cookie = await createSessionCookie('198.51.100.8');
  const response = await mf.dispatchFetch(
    'http://localhost/library/rituals/step-into-the-fire-test/',
    { headers: { Cookie: cookie }, redirect: 'manual' },
  );
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'http://localhost/library/rituals/step-into-your-fire/');

  const legacyDownload = await mf.dispatchFetch(
    'http://localhost/api/library/files/step-into-the-fire-test/guide?download=1',
    { headers: { Cookie: cookie } },
  );
  assert.equal(legacyDownload.status, 200);
  assert.match(legacyDownload.headers.get('content-disposition'), /^attachment/);
});

test('returns after 30 days with ordinary email and password login', async () => {
  await db.prepare('UPDATE sessions SET expires_at=1 WHERE customer_email=?1').bind(testEmail).run();
  await db.prepare('DELETE FROM auth_rate_limits').run();
  const login = await mf.dispatchFetch('http://localhost/api/library/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.30' },
    body: JSON.stringify({ email: testEmail, password: 'Ember!2345', turnstileToken: 'test-pass' }),
  });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).redirect, '/library/');
  const cookie = extractCookie(login.headers.get('set-cookie'), 'tf_library_session');
  const library = await mf.dispatchFetch('http://localhost/api/library/session', { headers: { Cookie: cookie } });
  assert.equal(library.status, 200);
  assert.equal((await library.json()).products[0].slug, 'step-into-your-fire');
});

test('forgot-password email resets the credential and revokes the old password', async () => {
  await db.prepare('DELETE FROM auth_rate_limits').run();
  const emailCount = purchaseEmails.length;
  const requested = await mf.dispatchFetch('http://localhost/api/library/password/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.31' },
    body: JSON.stringify({ email: testEmail, purpose: 'reset', turnstileToken: 'test-pass' }),
  });
  assert.equal(requested.status, 202);
  const resetEmail = purchaseEmails.slice(emailCount).find((item) => item.url.endsWith('/api/library-password-link'));
  assert.ok(resetEmail);
  assert.equal(resetEmail.body.purpose, 'reset');
  const resetUrl = new URL(resetEmail.body.passwordLink);
  const resetTooShort = await mf.dispatchFetch('http://localhost/api/library/password/set', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: resetUrl.searchParams.get('token'), password: 'Forest!23', confirmPassword: 'Forest!23' }),
  });
  assert.equal(resetTooShort.status, 400);
  assert.match((await resetTooShort.json()).error, /10–128 characters/);

  const newPassword = 'Forest!234';
  const reset = await mf.dispatchFetch('http://localhost/api/library/password/set', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: resetUrl.searchParams.get('token'), password: newPassword, confirmPassword: newPassword }),
  });
  assert.equal(reset.status, 200);

  await db.prepare('DELETE FROM auth_rate_limits').run();
  const oldLogin = await mf.dispatchFetch('http://localhost/api/library/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.32' },
    body: JSON.stringify({ email: testEmail, password: 'Candle river garden moonlight', turnstileToken: 'test-pass' }),
  });
  assert.equal(oldLogin.status, 401);
  const newLogin = await mf.dispatchFetch('http://localhost/api/library/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.33' },
    body: JSON.stringify({ email: testEmail, password: newPassword, turnstileToken: 'test-pass' }),
  });
  assert.equal(newLogin.status, 200);
});

test('repeat purchase adds entitlement without replacing an existing password', async () => {
  const passwordBefore = await db.prepare(`SELECT p.password_hash FROM identity_passwords p
    JOIN customers c ON c.user_id=p.user_id WHERE c.email=?1`).bind(testEmail).first();
  const emailCount = purchaseEmails.length;
  const claim = await mf.dispatchFetch(
    'http://localhost/library/claim?session_id=cs_test_full_journey',
    { redirect: 'manual' },
  );
  assert.equal(claim.status, 302);
  const destination = new URL(claim.headers.get('location'));
  assert.equal(destination.pathname, '/library/login/');
  assert.equal(destination.searchParams.get('status'), 'purchase');
  assert.equal(purchaseEmails.slice(emailCount).some((item) => item.url.endsWith('/api/library-password-link')), false);
  const passwordAfter = await db.prepare(`SELECT p.password_hash FROM identity_passwords p
    JOIN customers c ON c.user_id=p.user_id WHERE c.email=?1`).bind(testEmail).first();
  assert.equal(passwordAfter.password_hash, passwordBefore.password_hash);

  const emailRow = await db.prepare(
    `SELECT sent_at, attempts, last_error
     FROM purchase_access_emails
     WHERE stripe_checkout_session_id = ?1`,
  ).bind('cs_test_full_journey').first();
  assert.ok(Number(emailRow.sent_at) > 0);
  assert.equal(Number(emailRow.attempts), 1);
  assert.equal(emailRow.last_error, null);
});

async function requestLink(email, ip = '198.51.100.1', resetRateLimit = true, destinationPath = '') {
  if (resetRateLimit) await db.prepare('DELETE FROM auth_rate_limits').run();
  const response = await mf.dispatchFetch('http://localhost/api/library/request-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify({ email, turnstileToken: 'test-pass', destinationPath }),
  });
  assert.equal(response.status, 202);
  return response.json();
}

async function createSessionCookie(ip) {
  const result = await requestLink(testEmail, ip);
  const response = await mf.dispatchFetch(result.debugMagicLink, { redirect: 'manual' });
  return response.headers.get('set-cookie').split(';', 1)[0];
}

function extractCookie(header, name) {
  const match = String(header || '').match(new RegExp(`(?:^|,\\s*)(${name}=[^;]+)`));
  return match?.[1] || '';
}

function checkoutEvent(id, type) {
  const suffix = id.replace(/^evt_/, '');
  return {
    id,
    type,
    data: { object: stripeSession(`cs_test_${suffix}`) },
  };
}

function stripeSession(id) {
  return {
    id,
    customer: 'cus_test_library',
    customer_details: { email: testEmail },
    payment_intent: `pi_${id}`,
    payment_status: 'paid',
    amount_total: 3300,
    currency: 'usd',
    line_items: { data: [{ price: { id: priceId } }] },
  };
}

function stripeSignature(payload) {
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac('sha256', webhookSecret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function executeSql(sql) {
  const statements = sql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
    .filter((statement) => !statement.startsWith('PRAGMA foreign_keys'));
  for (const statement of statements) await db.prepare(statement).run();
}
