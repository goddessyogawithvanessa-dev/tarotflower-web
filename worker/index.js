const SESSION_COOKIE = 'tf_library_session';
const MAGIC_LINK_TTL_SECONDS = 15 * 60;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
const RATE_LIMIT_ATTEMPTS = 5;
const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
const GENERIC_LOGIN_MESSAGE = 'If that email is connected to a purchase, a secure sign-in link is on its way.';

export default {
  async fetch(request, env, ctx) {
    try {
      return await routeRequest(request, env, ctx);
    } catch (error) {
      console.error('Library request failed', error);
      if (new URL(request.url).pathname.startsWith('/api/')) {
        return json({ error: 'The request could not be completed.' }, 500);
      }
      return new Response('The request could not be completed.', { status: 500 });
    }
  },
};

async function routeRequest(request, env, ctx) {
  const url = new URL(request.url);

  if (request.method === 'GET' && url.pathname === '/api/library/config') {
    return json({
      turnstileSiteKey: env.TURNSTILE_SITE_KEY || '',
      testMode: isTestMode(env),
    });
  }

  if (request.method === 'POST' && url.pathname === '/api/library/request-link') {
    return requestMagicLink(request, env, ctx);
  }

  if (request.method === 'GET' && url.pathname === '/library/auth') {
    return consumeMagicLink(request, env);
  }

  if (request.method === 'GET' && url.pathname === '/library/claim') {
    return claimCheckoutSession(request, env);
  }

  if (request.method === 'GET' && url.pathname === '/api/library/session') {
    return getLibrarySession(request, env);
  }

  if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname.startsWith('/library/rituals/')) {
    return serveProtectedExperience(request, env);
  }

  if (request.method === 'POST' && url.pathname === '/api/library/logout') {
    return logout(request, env);
  }

  if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname.startsWith('/api/library/files/')) {
    return serveProtectedFile(request, env);
  }

  if (request.method === 'POST' && url.pathname === '/api/stripe/webhook') {
    return handleStripeWebhook(request, env);
  }

  if (env.ASSETS) return env.ASSETS.fetch(request);
  return new Response('Not found', { status: 404 });
}

async function requestMagicLink(request, env, ctx) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const turnstileToken = typeof body.turnstileToken === 'string' ? body.turnstileToken : '';
  const ip = request.headers.get('CF-Connecting-IP') || 'local';

  if (!email || !isValidEmail(email)) return json({ message: GENERIC_LOGIN_MESSAGE });

  const turnstileValid = await verifyTurnstile(turnstileToken, ip, env);
  if (!turnstileValid) return json({ error: 'Please complete the security check and try again.' }, 400);

  const rateLimited = await isRateLimited(email, ip, env);
  if (rateLimited) return json({ message: GENERIC_LOGIN_MESSAGE }, 202);

  const entitlement = await env.LIBRARY_DB.prepare(
    `SELECT 1 FROM entitlements
     WHERE customer_email = ?1 AND revoked_at IS NULL
     LIMIT 1`,
  ).bind(email).first();

  if (!entitlement) return json({ message: GENERIC_LOGIN_MESSAGE }, 202);

  const rawToken = randomToken();
  const tokenHash = await sha256(rawToken);
  const ipHash = await keyedHash(`${ip}|${email}`, env.TOKEN_PEPPER);
  const now = unixTime();

  await env.LIBRARY_DB.prepare(
    `INSERT INTO magic_links
      (token_hash, customer_email, requested_ip_hash, created_at, expires_at, consumed_at)
     VALUES (?1, ?2, ?3, ?4, ?5, NULL)`,
  ).bind(tokenHash, email, ipHash, now, now + MAGIC_LINK_TTL_SECONDS).run();

  const link = `${appOrigin(env)}/library/auth?token=${encodeURIComponent(rawToken)}`;
  try {
    await sendMagicLink(email, link, env);
  } catch (error) {
    await env.LIBRARY_DB.prepare('DELETE FROM magic_links WHERE token_hash = ?1').bind(tokenHash).run();
    console.error('Magic-link email failed', error);
  }

  ctx?.waitUntil?.(cleanupExpiredRecords(env));
  const response = { message: GENERIC_LOGIN_MESSAGE };
  if (isTestMode(env)) response.debugMagicLink = link;
  return json(response, 202);
}

async function consumeMagicLink(request, env) {
  const url = new URL(request.url);
  const rawToken = url.searchParams.get('token') || '';
  const loginUrl = new URL('/library/login/', appOrigin(env));
  if (!rawToken) return Response.redirect(loginUrl, 302);

  const tokenHash = await sha256(rawToken);
  const now = unixTime();
  const link = await env.LIBRARY_DB.prepare(
    `SELECT customer_email, expires_at, consumed_at
     FROM magic_links WHERE token_hash = ?1`,
  ).bind(tokenHash).first();

  if (!link || link.consumed_at !== null || Number(link.expires_at) < now) {
    loginUrl.searchParams.set('status', 'invalid');
    return noStoreRedirect(loginUrl, 302);
  }

  const consumed = await env.LIBRARY_DB.prepare(
    `UPDATE magic_links SET consumed_at = ?2
     WHERE token_hash = ?1 AND consumed_at IS NULL AND expires_at >= ?2`,
  ).bind(tokenHash, now).run();

  if (Number(consumed.meta?.changes || 0) !== 1) {
    loginUrl.searchParams.set('status', 'invalid');
    return noStoreRedirect(loginUrl, 302);
  }

  const sessionToken = randomToken();
  const sessionHash = await sha256(sessionToken);
  await env.LIBRARY_DB.prepare(
    `INSERT INTO sessions
      (token_hash, customer_email, created_at, expires_at, last_seen_at, revoked_at)
     VALUES (?1, ?2, ?3, ?4, ?3, NULL)`,
  ).bind(sessionHash, link.customer_email, now, now + SESSION_TTL_SECONDS).run();

  const response = noStoreRedirect(new URL('/library/', appOrigin(env)), 302);
  response.headers.append('Set-Cookie', sessionCookie(sessionToken, SESSION_TTL_SECONDS));
  return response;
}

async function claimCheckoutSession(request, env) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('session_id') || '';
  const loginUrl = new URL('/library/login/', appOrigin(env));
  const expectedPrefix = isTestMode(env) ? 'cs_test_' : 'cs_live_';
  if (!sessionId.startsWith(expectedPrefix)) {
    loginUrl.searchParams.set('status', 'checkout');
    return noStoreRedirect(loginUrl, 302);
  }

  const stripeSession = await retrieveStripeSession(sessionId, env);
  if (!stripeSession || stripeSession.payment_status !== 'paid') {
    loginUrl.searchParams.set('status', 'checkout');
    return noStoreRedirect(loginUrl, 302);
  }

  const fulfillment = await fulfillStripeSession(stripeSession, null, env);
  if (!fulfillment.granted) {
    loginUrl.searchParams.set('status', 'checkout');
    return noStoreRedirect(loginUrl, 302);
  }

  const sessionToken = randomToken();
  const now = unixTime();
  await env.LIBRARY_DB.prepare(
    `INSERT INTO sessions
      (token_hash, customer_email, created_at, expires_at, last_seen_at, revoked_at)
     VALUES (?1, ?2, ?3, ?4, ?3, NULL)`,
  ).bind(await sha256(sessionToken), fulfillment.email, now, now + SESSION_TTL_SECONDS).run();

  const destination = new URL(fulfillment.experiencePath, appOrigin(env));
  const response = noStoreRedirect(destination, 302);
  response.headers.append('Set-Cookie', sessionCookie(sessionToken, SESSION_TTL_SECONDS));
  return response;
}

async function serveProtectedExperience(request, env) {
  const session = await authenticate(request, env, false);
  if (!session) {
    return noStoreRedirect(new URL('/library/login/', appOrigin(env)), 302);
  }

  const url = new URL(request.url);
  const product = await env.LIBRARY_DB.prepare(
    `SELECT 1
     FROM products p
     JOIN entitlements e ON e.product_id = p.id
     WHERE p.experience_path = ?1
       AND e.customer_email = ?2
       AND e.revoked_at IS NULL
       AND p.active = 1
     LIMIT 1`,
  ).bind(url.pathname, session.email).first();

  if (!product) {
    return noStoreRedirect(new URL('/library/', appOrigin(env)), 302);
  }

  return env.ASSETS.fetch(request);
}

async function getLibrarySession(request, env) {
  const session = await authenticate(request, env, true);
  if (!session) return json({ authenticated: false }, 401, noStoreHeaders());

  const result = await env.LIBRARY_DB.prepare(
    `SELECT p.id, p.slug, p.title, p.description, p.image_path, p.experience_path,
            p.assets_json, e.granted_at
     FROM entitlements e
     JOIN products p ON p.id = e.product_id
     WHERE e.customer_email = ?1
       AND e.revoked_at IS NULL
       AND p.active = 1
     ORDER BY e.granted_at DESC`,
  ).bind(session.email).all();

  const products = (result.results || []).map((product) => publicProduct(product));
  return json({ authenticated: true, email: session.email, products }, 200, noStoreHeaders());
}

async function logout(request, env) {
  const rawToken = getCookie(request, SESSION_COOKIE);
  if (rawToken) {
    await env.LIBRARY_DB.prepare(
      'UPDATE sessions SET revoked_at = ?2 WHERE token_hash = ?1 AND revoked_at IS NULL',
    ).bind(await sha256(rawToken), unixTime()).run();
  }
  return json(
    { ok: true },
    200,
    {
      ...noStoreHeaders(),
      'Set-Cookie': clearSessionCookie(),
    },
  );
}

async function serveProtectedFile(request, env) {
  const session = await authenticate(request, env, false);
  if (!session) return new Response('Unauthorized', { status: 401, headers: noStoreHeaders() });

  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length !== 5) return new Response('Not found', { status: 404 });
  const productSlug = decodeURIComponent(parts[3]);
  const assetId = decodeURIComponent(parts[4]);

  const product = await env.LIBRARY_DB.prepare(
    `SELECT p.id, p.slug, p.assets_json
     FROM products p
     JOIN entitlements e ON e.product_id = p.id
     WHERE p.slug = ?1
       AND e.customer_email = ?2
       AND e.revoked_at IS NULL
       AND p.active = 1`,
  ).bind(productSlug, session.email).first();
  if (!product) return new Response('Not found', { status: 404, headers: noStoreHeaders() });

  const asset = parseAssets(product.assets_json).find((item) => item.id === assetId);
  if (!asset) return new Response('Not found', { status: 404, headers: noStoreHeaders() });

  const rangeHeader = request.headers.get('Range');
  const metadata = rangeHeader ? await env.LIBRARY_ASSETS.head(asset.key) : null;
  if (rangeHeader && !metadata) return new Response('Not found', { status: 404 });

  let object;
  let status = 200;
  let contentRange;
  if (rangeHeader) {
    const range = parseRange(rangeHeader, Number(metadata.size));
    if (!range) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${metadata.size}`, ...noStoreHeaders() },
      });
    }
    object = await env.LIBRARY_ASSETS.get(asset.key, {
      range: { offset: range.start, length: range.end - range.start + 1 },
    });
    status = 206;
    contentRange = `bytes ${range.start}-${range.end}/${metadata.size}`;
  } else {
    object = await env.LIBRARY_ASSETS.get(asset.key);
  }

  if (!object) return new Response('Not found', { status: 404 });
  const disposition = url.searchParams.get('download') === '1' ? 'attachment' : 'inline';
  const headers = new Headers(noStoreHeaders());
  headers.set('Content-Type', asset.contentType);
  headers.set('Content-Disposition', `${disposition}; filename="${safeFilename(asset.filename)}"`);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('X-Content-Type-Options', 'nosniff');
  if (contentRange) headers.set('Content-Range', contentRange);
  const responseLength = status === 206
    ? Number(contentRange.match(/bytes (\d+)-(\d+)\//)[2]) - Number(contentRange.match(/bytes (\d+)-(\d+)\//)[1]) + 1
    : Number(object.size);
  headers.set('Content-Length', String(responseLength));
  if (request.method === 'HEAD') return new Response(null, { status, headers });
  return new Response(object.body, { status, headers });
}

async function handleStripeWebhook(request, env) {
  const rawBody = await request.text();
  const signature = request.headers.get('Stripe-Signature') || '';
  const verified = await verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  if (!verified) return json({ error: 'Invalid signature.' }, 400);

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: 'Invalid payload.' }, 400);
  }

  const existing = await env.LIBRARY_DB.prepare(
    'SELECT event_id FROM processed_stripe_events WHERE event_id = ?1',
  ).bind(event.id).first();
  if (existing) return json({ received: true, duplicate: true });

  const supported = event.type === 'checkout.session.completed'
    || event.type === 'checkout.session.async_payment_succeeded';
  if (!supported) {
    await env.LIBRARY_DB.prepare(
      `INSERT OR IGNORE INTO processed_stripe_events (event_id, event_type, processed_at)
       VALUES (?1, ?2, ?3)`,
    ).bind(event.id, event.type || 'unknown', unixTime()).run();
    return json({ received: true, ignored: true });
  }

  let session = event.data?.object;
  if (!session?.id) return json({ error: 'Missing checkout session.' }, 400);
  if (!session.line_items?.data?.length) session = await retrieveStripeSession(session.id, env);
  const result = await fulfillStripeSession(session, event, env);
  return json({ received: true, granted: result.granted });
}

async function fulfillStripeSession(session, event, env) {
  if (!session || session.payment_status !== 'paid') return { granted: false };
  const email = normalizeEmail(session.customer_details?.email || session.customer_email);
  const priceId = session.line_items?.data?.[0]?.price?.id;
  if (!email || !priceId) return { granted: false };

  const product = await env.LIBRARY_DB.prepare(
    `SELECT id, experience_path FROM products
     WHERE stripe_price_id = ?1 AND active = 1`,
  ).bind(priceId).first();
  if (!product) return { granted: false };

  const now = unixTime();
  const eventId = event?.id || `claim:${session.id}`;
  const eventType = event?.type || 'checkout.session.claimed';
  const customerId = typeof session.customer === 'string' ? session.customer : null;
  const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : null;

  await env.LIBRARY_DB.batch([
    env.LIBRARY_DB.prepare(
      `INSERT OR IGNORE INTO processed_stripe_events (event_id, event_type, processed_at)
       VALUES (?1, ?2, ?3)`,
    ).bind(eventId, eventType, now),
    env.LIBRARY_DB.prepare(
      `INSERT INTO customers (email, stripe_customer_id, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?3)
       ON CONFLICT(email) DO UPDATE SET
         stripe_customer_id = COALESCE(excluded.stripe_customer_id, customers.stripe_customer_id),
         updated_at = excluded.updated_at`,
    ).bind(email, customerId, now),
    env.LIBRARY_DB.prepare(
      `INSERT OR IGNORE INTO purchases
        (stripe_checkout_session_id, stripe_payment_intent_id, customer_email, product_id,
         amount_total, currency, payment_status, purchased_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'paid', ?7)`,
    ).bind(
      session.id,
      paymentIntent,
      email,
      product.id,
      Number(session.amount_total || 0),
      String(session.currency || 'usd').toLowerCase(),
      now,
    ),
    env.LIBRARY_DB.prepare(
      `INSERT INTO entitlements
        (customer_email, product_id, source_checkout_session_id, granted_at, revoked_at)
       VALUES (?1, ?2, ?3, ?4, NULL)
       ON CONFLICT(customer_email, product_id) DO UPDATE SET
         revoked_at = NULL`,
    ).bind(email, product.id, session.id, now),
  ]);

  return { granted: true, email, experiencePath: product.experience_path };
}

async function retrieveStripeSession(sessionId, env) {
  if (!env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not configured');
  const base = env.STRIPE_API_BASE || 'https://api.stripe.com';
  const url = new URL(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, base);
  url.searchParams.append('expand[]', 'line_items');
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
  });
  if (!response.ok) throw new Error(`Stripe session lookup failed (${response.status})`);
  return response.json();
}

async function authenticate(request, env, touch) {
  const rawToken = getCookie(request, SESSION_COOKIE);
  if (!rawToken) return null;
  const tokenHash = await sha256(rawToken);
  const now = unixTime();
  const session = await env.LIBRARY_DB.prepare(
    `SELECT customer_email, expires_at, revoked_at
     FROM sessions
     WHERE token_hash = ?1`,
  ).bind(tokenHash).first();
  if (!session || session.revoked_at !== null || Number(session.expires_at) < now) return null;
  if (touch) {
    await env.LIBRARY_DB.prepare(
      'UPDATE sessions SET last_seen_at = ?2 WHERE token_hash = ?1',
    ).bind(tokenHash, now).run();
  }
  return { email: session.customer_email, tokenHash };
}

async function verifyTurnstile(token, ip, env) {
  if (isTestMode(env)) return token === 'test-pass';
  if (!token || !env.TURNSTILE_SECRET_KEY) return false;
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  if (ip) body.set('remoteip', ip);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
  });
  if (!response.ok) return false;
  const result = await response.json();
  if (!result.success || result.action !== 'library_login') return false;
  return !env.TURNSTILE_EXPECTED_HOSTNAME || result.hostname === env.TURNSTILE_EXPECTED_HOSTNAME;
}

async function isRateLimited(email, ip, env) {
  const now = unixTime();
  const windowStart = now - RATE_LIMIT_WINDOW_SECONDS;
  const keys = [
    await keyedHash(`email:${email}`, env.TOKEN_PEPPER),
    await keyedHash(`ip:${ip}`, env.TOKEN_PEPPER),
  ];

  for (const key of keys) {
    const row = await env.LIBRARY_DB.prepare(
      'SELECT window_started_at, attempts, blocked_until FROM auth_rate_limits WHERE key_hash = ?1',
    ).bind(key).first();
    if (row?.blocked_until && Number(row.blocked_until) > now) return true;

    if (!row || Number(row.window_started_at) < windowStart) {
      await env.LIBRARY_DB.prepare(
        `INSERT INTO auth_rate_limits (key_hash, window_started_at, attempts, blocked_until)
         VALUES (?1, ?2, 1, NULL)
         ON CONFLICT(key_hash) DO UPDATE SET
           window_started_at = excluded.window_started_at,
           attempts = 1,
           blocked_until = NULL`,
      ).bind(key, now).run();
      continue;
    }

    const attempts = Number(row.attempts) + 1;
    const blockedUntil = attempts > RATE_LIMIT_ATTEMPTS ? now + RATE_LIMIT_WINDOW_SECONDS : null;
    await env.LIBRARY_DB.prepare(
      'UPDATE auth_rate_limits SET attempts = ?2, blocked_until = ?3 WHERE key_hash = ?1',
    ).bind(key, attempts, blockedUntil).run();
    if (blockedUntil) return true;
  }
  return false;
}

async function sendMagicLink(email, link, env) {
  if (isTestMode(env)) {
    console.log(`Local magic link for ${email}: ${link}`);
    return;
  }
  if (!env.EMAIL_SERVICE?.fetch) throw new Error('EMAIL_SERVICE binding is not configured');
  const response = await env.EMAIL_SERVICE.fetch('https://email.internal/api/library-magic-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: email,
      subject: 'Your secure Tarot Flower library link',
      magicLink: link,
      expiresInMinutes: 15,
    }),
  });
  if (!response.ok) throw new Error(`Email service rejected the message (${response.status})`);
}

async function cleanupExpiredRecords(env) {
  const now = unixTime();
  await env.LIBRARY_DB.batch([
    env.LIBRARY_DB.prepare('DELETE FROM magic_links WHERE expires_at < ?1').bind(now - 24 * 60 * 60),
    env.LIBRARY_DB.prepare('DELETE FROM sessions WHERE expires_at < ?1 OR revoked_at IS NOT NULL').bind(now - 7 * 24 * 60 * 60),
    env.LIBRARY_DB.prepare('DELETE FROM auth_rate_limits WHERE window_started_at < ?1').bind(now - 24 * 60 * 60),
  ]);
}

async function verifyStripeSignature(payload, header, secret, now = unixTime()) {
  if (!secret || !header) return false;
  const parsed = parseStripeSignature(header);
  if (!parsed.timestamp || parsed.signatures.length === 0) return false;
  if (Math.abs(now - parsed.timestamp) > STRIPE_SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = await hmacHex(secret, `${parsed.timestamp}.${payload}`);
  return parsed.signatures.some((signature) => constantTimeEqual(expected, signature));
}

function parseStripeSignature(header) {
  const result = { timestamp: 0, signatures: [] };
  for (const part of header.split(',')) {
    const [key, value] = part.split('=', 2);
    if (key === 't') result.timestamp = Number(value);
    if (key === 'v1' && value) result.signatures.push(value);
  }
  return result;
}

function publicProduct(product) {
  const assets = parseAssets(product.assets_json).map(({ id, label, kind, filename, contentType }) => ({
    id,
    label,
    kind,
    filename,
    contentType,
    viewUrl: `/api/library/files/${encodeURIComponent(product.slug)}/${encodeURIComponent(id)}`,
    downloadUrl: `/api/library/files/${encodeURIComponent(product.slug)}/${encodeURIComponent(id)}?download=1`,
  }));
  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    description: product.description,
    imagePath: product.image_path,
    experiencePath: product.experience_path,
    grantedAt: product.granted_at,
    assets,
  };
}

function parseAssets(value) {
  try {
    const assets = JSON.parse(value);
    return Array.isArray(assets) ? assets : [];
  } catch {
    return [];
  }
}

function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || !Number.isFinite(size) || size <= 0) return null;
  let start;
  let end;
  if (match[1] === '') {
    const suffix = Number(match[2]);
    if (!Number.isInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Number(match[2]);
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64Url(bytes);
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return hex(new Uint8Array(digest));
}

async function keyedHash(value, secret) {
  if (!secret || secret.length < 32) throw new Error('TOKEN_PEPPER must contain at least 32 characters');
  return hmacHex(secret, value);
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return hex(new Uint8Array(signature));
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function hex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function getCookie(request, name) {
  const cookies = request.headers.get('Cookie') || '';
  for (const part of cookies.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return '';
}

function sessionCookie(token, maxAge) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function noStoreRedirect(url, status) {
  return new Response(null, {
    status,
    headers: {
      Location: url.toString(),
      ...noStoreHeaders(),
      'Referrer-Policy': 'no-referrer',
    },
  });
}

function noStoreHeaders() {
  return {
    'Cache-Control': 'private, no-store, max-age=0',
    Pragma: 'no-cache',
  };
}

function safeFilename(value) {
  return String(value || 'download').replace(/[^a-zA-Z0-9._-]/g, '-');
}

function appOrigin(env) {
  return (env.APP_ORIGIN || 'https://tarotflower.com').replace(/\/$/, '');
}

function isTestMode(env) {
  return env.LIBRARY_TEST_MODE === 'true';
}

function unixTime() {
  return Math.floor(Date.now() / 1000);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function json(value, status = 200, extraHeaders = {}) {
  return Response.json(value, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  });
}

export const __test = {
  constantTimeEqual,
  normalizeEmail,
  parseRange,
  parseStripeSignature,
  verifyStripeSignature,
};
