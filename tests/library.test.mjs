import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { createHmac } from 'node:crypto';
import { Miniflare } from 'miniflare';

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
    compatibilityDate: '2026-07-18',
    bindings: {
      APP_ORIGIN: 'http://localhost',
      LIBRARY_TEST_MODE: 'true',
      STRIPE_SECRET_KEY: 'sk_test_local_prototype',
      STRIPE_WEBHOOK_SECRET: webhookSecret,
      TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
      TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
      TOKEN_PEPPER: 'local-test-pepper-that-is-at-least-32-characters',
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
  await bucket.put('test/step-into-the-fire/ritual-guide.pdf', new TextEncoder().encode('%PDF-local-test'));
  await bucket.put('test/step-into-the-fire/original-music.mp3', new Uint8Array(256).fill(7));
  await bucket.put('test/step-into-the-fire/movement-practice.mp4', new Uint8Array(1024).map((_, index) => index % 251));
  await bucket.put('test/step-into-the-fire/videos/initiation.mp4', new Uint8Array(1024).fill(11));
  await bucket.put('test/step-into-the-fire/videos/destruction.mp4', new Uint8Array(1024).fill(12));
  await bucket.put('test/step-into-the-fire/videos/guardian-embodiment.mp4', new Uint8Array(1024).fill(13));
  await bucket.put('test/step-into-the-fire/videos/freedom-sound-bath.mp4', new Uint8Array(1024).fill(14));
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
  assert.equal(purchaseEmails.length, 1);
  assert.equal(purchaseEmails[0].url, 'https://email.internal/api/library-purchase-access');
  assert.deepEqual(purchaseEmails[0].body, {
    to: testEmail,
    subject: 'Your Step Into Your Fire ritual is ready',
    productTitle: 'Step Into Your Fire',
    libraryUrl: 'http://localhost/library/login/',
  });
  assert.doesNotMatch(JSON.stringify(purchaseEmails[0].body), /library\/auth|[?&]token=/i);
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
  assert.equal(purchaseEmails.length, 1);
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
});

test('lists owned products and protects PDF, MP3, video, downloads, and ranges', async () => {
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
  assert.equal(body.products[0].assets.length, 7);
  assert.equal(JSON.stringify(body).includes('test/step-into-the-fire'), false);
  assert.equal(JSON.stringify(body).includes('step-into-the-fire-test'), false);

  for (const asset of ['guide', 'music', 'movement', 'video-initiation', 'video-destruction', 'video-guardian', 'video-freedom']) {
    const view = await mf.dispatchFetch(`http://localhost/api/library/files/step-into-your-fire/${asset}`, { headers });
    assert.equal(view.status, 200);
    assert.match(view.headers.get('content-disposition'), /^inline/);
    const download = await mf.dispatchFetch(`http://localhost/api/library/files/step-into-your-fire/${asset}?download=1`, { headers });
    assert.equal(download.status, 200);
    assert.match(download.headers.get('content-disposition'), /^attachment/);
  }

  const range = await mf.dispatchFetch(
    'http://localhost/api/library/files/step-into-your-fire/movement',
    { headers: { ...headers, Range: 'bytes=100-199' } },
  );
  assert.equal(range.status, 206);
  assert.equal(range.headers.get('content-range'), 'bytes 100-199/1024');
  assert.equal((await range.arrayBuffer()).byteLength, 100);
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

test('checkout claim grants access immediately and redirects to the private ritual', async () => {
  const response = await mf.dispatchFetch(
    'http://localhost/library/claim?session_id=cs_test_immediate',
    { redirect: 'manual' },
  );
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'http://localhost/library/rituals/step-into-your-fire/');
  assert.match(response.headers.get('set-cookie'), /tf_library_session=/);
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

test('completes purchase, active-session return, logout, magic-link recovery, and protected download', async () => {
  const claim = await mf.dispatchFetch(
    'http://localhost/library/claim?session_id=cs_test_full_journey',
    { redirect: 'manual' },
  );
  assert.equal(claim.status, 302);
  assert.equal(claim.headers.get('location'), 'http://localhost/library/rituals/step-into-your-fire/');
  const claimCookie = claim.headers.get('set-cookie').split(';', 1)[0];

  const immediateLibrary = await mf.dispatchFetch('http://localhost/api/library/session', {
    headers: { Cookie: claimCookie },
  });
  assert.equal(immediateLibrary.status, 200);
  const immediateBody = await immediateLibrary.json();
  assert.equal(immediateBody.products[0].experiencePath, '/library/rituals/step-into-your-fire/');

  const activeReturn = await mf.dispatchFetch('http://localhost/api/library/session', {
    headers: { Cookie: claimCookie },
  });
  assert.equal(activeReturn.status, 200);

  const logout = await mf.dispatchFetch('http://localhost/api/library/logout', {
    method: 'POST',
    headers: { Cookie: claimCookie },
  });
  assert.equal(logout.status, 200);
  const signedOut = await mf.dispatchFetch('http://localhost/api/library/session', {
    headers: { Cookie: claimCookie },
  });
  assert.equal(signedOut.status, 401);

  const recovery = await requestLink(testEmail, '198.51.100.9');
  const recovered = await mf.dispatchFetch(recovery.debugMagicLink, { redirect: 'manual' });
  assert.equal(recovered.status, 302);
  assert.equal(recovered.headers.get('location'), 'http://localhost/library/');
  const recoveredCookie = recovered.headers.get('set-cookie').split(';', 1)[0];

  const recoveredLibrary = await mf.dispatchFetch('http://localhost/api/library/session', {
    headers: { Cookie: recoveredCookie },
  });
  assert.equal(recoveredLibrary.status, 200);
  const download = await mf.dispatchFetch(
    'http://localhost/api/library/files/step-into-your-fire/guide?download=1',
    { headers: { Cookie: recoveredCookie } },
  );
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-disposition'), /^attachment/);

  const emailRow = await db.prepare(
    `SELECT sent_at, attempts, last_error
     FROM purchase_access_emails
     WHERE stripe_checkout_session_id = ?1`,
  ).bind('cs_test_full_journey').first();
  assert.ok(Number(emailRow.sent_at) > 0);
  assert.equal(Number(emailRow.attempts), 1);
  assert.equal(emailRow.last_error, null);
});

async function requestLink(email, ip = '198.51.100.1', resetRateLimit = true) {
  if (resetRateLimit) await db.prepare('DELETE FROM auth_rate_limits').run();
  const response = await mf.dispatchFetch('http://localhost/api/library/request-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify({ email, turnstileToken: 'test-pass' }),
  });
  assert.equal(response.status, 202);
  return response.json();
}

async function createSessionCookie(ip) {
  const result = await requestLink(testEmail, ip);
  const response = await mf.dispatchFetch(result.debugMagicLink, { redirect: 'manual' });
  return response.headers.get('set-cookie').split(';', 1)[0];
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
    amount_total: 1900,
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
