import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { hashPassword } from '../worker/circle/passwords.js';

const require = createRequire(import.meta.url);
const runtime = createRequire(require.resolve('wrangler/package.json'))('miniflare');
class Miniflare extends runtime.Miniflare {
  constructor(options) {
    options.modules = [
      { type: 'ESModule', path: options.scriptPath },
      { type: 'ESModule', path: new URL('../worker/circle/identity.js', import.meta.url).pathname },
      { type: 'ESModule', path: new URL('../worker/circle/passwords.js', import.meta.url).pathname },
      { type: 'ESModule', path: new URL('../worker/circle/consent.js', import.meta.url).pathname },
      { type: 'ESModule', path: new URL('../worker/workbench/access.js', import.meta.url).pathname },
    ];
    super(runtime.convertV4MiniflareOptions ? runtime.convertV4MiniflareOptions(options) : options);
  }
}

const ownerEmail = 'owner@example.test';
const ownerPassword = 'Candle river garden moonlight';
const dashboardSource = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tarot Flower Campaign Review</title><style>body { color: #241812; }</style></head><body><main>
<h1>Campaign Review</h1><p>Read-only campaign visibility.</p><section><h2>Summary Counts</h2><p>18 active</p></section>
<section><h2>Subscriber Search</h2><form method="get" action="/api/admin/campaign/review"><input name="email"></form></section>
</main></body></html>`;

let mf;
let db;
const serviceRequests = [];
const serviceRequestDetails = [];
const passwordEmails = [];

function statements(sql) {
  let quoted = false;
  let start = 0;
  const result = [];
  for (let index = 0; index < sql.length; index += 1) {
    if (sql[index] === "'") {
      if (quoted && sql[index + 1] === "'") { index += 1; continue; }
      quoted = !quoted;
    }
    if (sql[index] === ';' && !quoted) {
      result.push(sql.slice(start, index));
      start = index + 1;
    }
  }
  return result.filter((statement) => statement.trim());
}

async function apply(database, path) {
  for (const statement of statements(await readFile(new URL(path, import.meta.url), 'utf8'))) {
    await database.prepare(statement).run();
  }
}

before(async () => {
  mf = new Miniflare({
    modules: true,
    scriptPath: new URL('../worker/index.js', import.meta.url).pathname,
    compatibilityFlags: ['nodejs_compat'],
    compatibilityDate: '2026-07-18',
    d1Databases: ['LIBRARY_DB'],
    bindings: {
      APP_ORIGIN: 'http://localhost',
      LIBRARY_TEST_MODE: 'true',
      TOKEN_PEPPER: 'workbench-test-pepper-contains-more-than-32-characters',
      WORKBENCH_OWNER_EMAIL: ownerEmail,
    },
    serviceBindings: {
      EMAIL_SERVICE: async (request) => {
        serviceRequests.push(request.url);
        serviceRequestDetails.push({
          url: request.url,
          method: request.method,
          body: request.method === 'POST' ? await request.clone().json() : null,
        });
        const path = new URL(request.url).pathname;
        if (path === '/api/library-password-link') {
          passwordEmails.push(await request.json());
          return Response.json({ ok: true });
        }
        if (path === '/api/admin/business/overview') {
          return Response.json({
            summary: { activeSubscribers: 18, newsletter: 7, goddessGuide: 8, oracleWaitlist: 3, newLeads30d: 4, consentActivity30d: 5 },
            attention: { activeProductionFailedDeliveries: 1, historicalProductionFailedDeliveries: 2, testFailedDeliveries: 5, overdueProductionDeliveries: 0 },
            recentSignups: [{ email: 'lead@example.test', first_name: 'Lead', lead_magnet_slug: 'tarot-newsletter', source_path: '/', consented_at: '2026-10-18T10:00:00Z' }],
            oracleWaitlist: [{ email: 'oracle@example.test', first_name: 'Oracle', status: 'active', source_path: '/sacred-becoming/oracle-deck/', consented_at: '2026-10-18T11:00:00Z' }],
          });
        }
        if (path === '/api/admin/newsletters') {
          return Response.json({
            sender: { from: 'Vanessa Hylande <vanessa@tarotflower.com>', replyTo: 'vanessa@tarotflower.com', authenticationVerified: true },
            campaigns: [{ id: 'campaign-1', subject: 'A Tarot Flower letter', status: 'draft', eligible_recipient_count: 2,
              provider_accepted_count: 0, failed_count: 0, bounce_count: 0, complaint_count: 0,
              owner_copy_status: 'not_queued', created_at: '2026-10-29T10:00:00Z' }],
          });
        }
        if (path === '/api/admin/newsletters/draft') {
          return Response.json({ ok: true, campaign: { id: 'campaign-created' } }, { status: 201 });
        }
        if (path === '/api/admin/newsletters/campaign-1/approve') {
          return Response.json({ ok: true, eligibleRecipientCount: 2, ownerCopyIncluded: true });
        }
        return new Response(dashboardSource, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      },
      ASSETS: () => new Response('Not found', { status: 404 }),
    },
  });
  db = await mf.getD1Database('LIBRARY_DB');
  await apply(db, '../worker/schema.sql');
  await apply(db, '../worker/seed.sql');
  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    db.prepare(`INSERT INTO customers(email,user_id,email_verified_at,created_at,updated_at)
      VALUES (?1,'owner-user',?2,?2,?2)`).bind(ownerEmail, now),
    db.prepare(`INSERT INTO identity_passwords(user_id,password_hash,version,created_at,changed_at,change_token_hash)
      VALUES ('owner-user',?1,1,?2,?2,'owner-bootstrap')`).bind(hashPassword(ownerPassword), now),
    db.prepare(`INSERT INTO customers(email,user_id,email_verified_at,created_at,updated_at)
      VALUES ('other@example.test','other-user',?1,?1,?1)`).bind(now),
    db.prepare(`INSERT INTO identity_passwords(user_id,password_hash,version,created_at,changed_at,change_token_hash)
      VALUES ('other-user',?1,1,?2,?2,'other-bootstrap')`).bind(hashPassword('Other account password'), now),
    db.prepare(`INSERT INTO purchases(stripe_checkout_session_id,customer_email,product_id,amount_total,currency,payment_status,purchased_at,access_claimed_at)
      VALUES ('cs_test_preview',?1,'ritual-step-into-the-fire-test',3300,'usd','paid',?2,?2)`).bind(ownerEmail, now),
    db.prepare(`INSERT INTO entitlements(customer_email,product_id,source_checkout_session_id,granted_at)
      VALUES (?1,'ritual-step-into-the-fire-test','cs_test_preview',?2)`).bind(ownerEmail, now),
    db.prepare(`INSERT INTO purchase_access_emails(stripe_checkout_session_id,customer_email,created_at,sent_at,attempts)
      VALUES ('cs_test_preview',?1,?2,?2,1)`).bind(ownerEmail, now),
    db.prepare(`INSERT INTO customers(email,email_verified_at,created_at,updated_at)
      VALUES ('buyer@real-domain.test',?1,?1,?1)`).bind(now),
    db.prepare(`INSERT INTO purchases(stripe_checkout_session_id,customer_email,product_id,amount_total,currency,payment_status,purchased_at,access_claimed_at)
      VALUES ('cs_live_real','buyer@real-domain.test','ritual-step-into-the-fire-test',100,'usd','paid',?1,?1)`).bind(now),
    db.prepare(`INSERT INTO entitlements(customer_email,product_id,source_checkout_session_id,granted_at)
      VALUES ('buyer@real-domain.test','ritual-step-into-the-fire-test','cs_live_real',?1)`).bind(now),
    db.prepare(`INSERT INTO purchase_access_emails(stripe_checkout_session_id,customer_email,created_at,sent_at,attempts)
      VALUES ('cs_live_real','buyer@real-domain.test',?1,?1,1)`).bind(now),
  ]);
});

after(async () => mf?.dispose());

test('visiting the Workbench without a session redirects to the ordinary login page', async () => {
  const response = await mf.dispatchFetch('http://localhost/workbench/', { redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'http://localhost/workbench/login/');
  assert.equal(serviceRequests.length, 0);
});

test('owner signs in with the shared Tarot Flower email and password', async () => {
  await db.prepare('DELETE FROM auth_rate_limits').run();
  const response = await login(ownerEmail, ownerPassword);
  assert.equal(response.status, 200);
  assert.equal((await response.clone().json()).redirect, '/workbench/');
  assert.match(response.headers.get('set-cookie') || '', /tf_library_session=/);
});

test('a valid non-owner Tarot Flower credential is rejected', async () => {
  await db.prepare('DELETE FROM auth_rate_limits').run();
  const response = await login('other@example.test', 'Other account password');
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /couldn’t sign you in/i);
});

test('an authenticated non-owner session cannot open the Workbench', async () => {
  const rawToken = 'non-owner-session-token';
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(`INSERT INTO sessions(token_hash,customer_email,created_at,expires_at,last_seen_at,auth_method)
    VALUES (?1,'other@example.test',?2,?3,?2,'password')`).bind(sha256(rawToken), now, now + 3600).run();
  const response = await mf.dispatchFetch('http://localhost/workbench/', {
    headers: { Cookie: `tf_library_session=${rawToken}` },
  });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
  assert.match(await response.text(), /not authorized/i);
});

test('authorized owner receives the read-only business dashboard and server-side data', async () => {
  const cookie = await ownerSessionCookie();
  const response = await mf.dispatchFetch('http://localhost/workbench/', { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  const html = await response.text();
  assert.match(html, /<h1 class="workbench-title">Tarot Flower Workbench<\/h1>/);
  assert.match(html, /Campaign Review/);
  assert.match(html, /Business Overview/);
  assert.match(html, /FIRE Purchases/);
  assert.match(html, /FIRE sales<\/p><strong class="metric-value">1<\/strong>/);
  assert.match(html, /\$1\.00/);
  assert.match(html, /owner@example\.test<\/td><td>QA\/test/);
  assert.match(html, /buyer@real-domain\.test<\/td><td>production/);
  assert.match(html, new RegExp(ownerEmail.replace('.', '\\.')));
  assert.match(html, /Sacred Becoming Oracle/);
  assert.match(html, /Owner Notifications/);
  assert.match(html, /Prepare a Newsletter/);
  assert.match(html, /A Tarot Flower letter/);
  assert.match(html, /Approve Entire Campaign Once/);
  assert.match(html, /Vanessa Hylande &lt;vanessa@tarotflower.com&gt;/);
  assert.match(html, /18 active/);
  assert.match(html, /action="\/workbench\/"/);
  assert.match(html, /method="post" action="\/workbench\/"/);
  assert.match(html, /action="\/api\/workbench\/logout"/);
  assert.match(html, /noindex, nofollow, noarchive/);
  assert.ok(serviceRequests.includes('https://email.internal/api/admin/campaign/review'));
  assert.ok(serviceRequests.includes('https://email.internal/api/admin/business/overview'));
});

test('owner creates a newsletter draft and approves the entire campaign with one action', async () => {
  const cookie = await ownerSessionCookie();
  const created = await mf.dispatchFetch('http://localhost/workbench/', {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ action: 'newsletter-create', subject: 'Draft subject', preview_text: 'Preview',
      html_template: '<p>Hello</p><a href="{{unsubscribe_url}}">Unsubscribe</a>',
      text_template: 'Hello\n{{unsubscribe_url}}' }),
  });
  assert.equal(created.status, 200);
  assert.match(await created.text(), /Newsletter draft created/);
  const createCall = serviceRequestDetails.findLast((entry) => entry.url.endsWith('/api/admin/newsletters/draft'));
  assert.equal(createCall.body.subject, 'Draft subject');

  const approved = await mf.dispatchFetch('http://localhost/workbench/', {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ action: 'newsletter-approve', campaign_id: 'campaign-1' }),
  });
  assert.equal(approved.status, 200);
  assert.match(await approved.text(), /Campaign approved once: 2 eligible subscriber/);
  assert.ok(serviceRequestDetails.some((entry) => entry.url.endsWith('/api/admin/newsletters/campaign-1/approve')));
});

test('subscriber search uses an owner-authenticated POST without putting the email in a URL', async () => {
  const cookie = await ownerSessionCookie();
  const email = 'subscriber@example.test';
  const response = await mf.dispatchFetch('http://localhost/workbench/', {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email }),
  });
  assert.equal(response.status, 200);
  const search = serviceRequestDetails.findLast((entry) => entry.method === 'POST'
    && entry.url.endsWith('/api/admin/campaign/review'));
  assert.equal(search.url, 'https://email.internal/api/admin/campaign/review');
  assert.equal(search.method, 'POST');
  assert.deepEqual(search.body, { email });
  assert.ok(!response.url.includes(email));
});

test('owner password recovery uses a 15-minute shared-identity reset link', async () => {
  await db.prepare('DELETE FROM auth_rate_limits').run();
  const response = await mf.dispatchFetch('http://localhost/api/workbench/password/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.50' },
    body: JSON.stringify({ email: ownerEmail, turnstileToken: 'test-pass' }),
  });
  assert.equal(response.status, 202);
  const message = passwordEmails.at(-1);
  assert.equal(message.to, ownerEmail);
  assert.equal(message.expiresInMinutes, 15);
  const resetUrl = new URL(message.passwordLink);
  assert.equal(resetUrl.pathname, '/workbench/forgot/');

  const token = resetUrl.searchParams.get('token');
  const tooShort = await mf.dispatchFetch('http://localhost/api/workbench/password/set', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password: 'short', confirmPassword: 'short' }),
  });
  assert.equal(tooShort.status, 400);
  assert.match((await tooShort.json()).error, /10–128 characters/);

  const newPassword = 'New owner password 2026';
  const changed = await mf.dispatchFetch('http://localhost/api/workbench/password/set', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password: newPassword, confirmPassword: newPassword }),
  });
  assert.equal(changed.status, 200);
  assert.equal((await changed.clone().json()).redirect, '/workbench/');
  assert.match(changed.headers.get('set-cookie') || '', /tf_library_session=/);

  await db.prepare('DELETE FROM auth_rate_limits').run();
  assert.equal((await login(ownerEmail, ownerPassword)).status, 401);
  await db.prepare('DELETE FROM auth_rate_limits').run();
  assert.equal((await login(ownerEmail, newPassword)).status, 200);
});

test('Sign Out revokes the owner session and returns to Workbench login', async () => {
  const cookie = await ownerSessionCookie('New owner password 2026');
  const response = await mf.dispatchFetch('http://localhost/api/workbench/logout', {
    method: 'POST', headers: { Cookie: cookie }, redirect: 'manual',
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), 'http://localhost/workbench/login/');
  assert.match(response.headers.get('set-cookie') || '', /Max-Age=0/);

  const after = await mf.dispatchFetch('http://localhost/workbench/', {
    headers: { Cookie: cookie }, redirect: 'manual',
  });
  assert.equal(after.status, 302);
  assert.equal(after.headers.get('location'), 'http://localhost/workbench/login/');
});

test('Workbench rejects write methods before loading dashboard data', async () => {
  const cookie = await ownerSessionCookie('New owner password 2026');
  const response = await mf.dispatchFetch('http://localhost/workbench/', {
    method: 'PUT', headers: { Cookie: cookie },
  });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, HEAD, POST');
});

async function login(email, password) {
  return mf.dispatchFetch('http://localhost/api/workbench/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.51' },
    body: JSON.stringify({ email, password, turnstileToken: 'test-pass' }),
  });
}

async function ownerSessionCookie(password = ownerPassword) {
  await db.prepare('DELETE FROM auth_rate_limits').run();
  const response = await login(ownerEmail, password);
  assert.equal(response.status, 200);
  return extractCookie(response.headers.get('set-cookie'), 'tf_library_session');
}

function extractCookie(header, name) {
  const value = String(header || '').split(',').find((part) => part.trim().startsWith(`${name}=`));
  return value?.split(';', 1)[0] || '';
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
