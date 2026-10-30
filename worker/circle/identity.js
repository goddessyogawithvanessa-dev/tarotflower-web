import { WorkerEntrypoint } from 'cloudflare:workers';
import { hashPassword, verifyPassword, passwordError } from './passwords.js';
import { EMAIL_CONSENT_VERSION, EMAIL_CONSENT_TEXT, syncCircleEmailConsents } from './consent.js';

const MINUTE = 60;
const DAY = 86400;
export const GUIDELINES_VERSION = '2026-09-23';
export const PRIVACY_VERSION = '2026-09-23.1';
const GENERIC = 'If this email can continue, you’ll receive a link to set your password.';
const now = () => Math.floor(Date.now() / 1000);
const normalize = (value) => String(value || '').trim().toLowerCase();
const validEmail = (value) => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const opaque = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const loopback = (url) => ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
const local = (env) => env.CIRCLE_DEV_MODE === 'true' && loopback(env.APP_ORIGIN) && loopback(env.CIRCLE_ORIGIN);
const owner = (user, env) => !!env.CIRCLE_OWNER_EMAIL && user.email === normalize(env.CIRCLE_OWNER_EMAIL);
export const privateHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};
const json = (body, status = 200) => Response.json(body, { status, headers: privateHeaders });


function b64(bytes) { return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''); }
export function token() { return b64(crypto.getRandomValues(new Uint8Array(32))); }
export async function digest(value) { return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))); }
// Library tokens use the original hex encoding; their format stays unchanged.
async function libraryDigest(value) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map((b) => b.toString(16).padStart(2, '0')).join(''); }
function cookie(request, name) { return (request.headers.get('cookie') || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(`${name}=`))?.slice(name.length + 1) || ''; }
function identityCookie(raw, env, age = 30 * DAY) { return `tf_identity_session=${raw}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${local(env) ? '' : '; Secure'}`; }
function origins(env) {
  const identity = new URL(env.APP_ORIGIN);
  const circle = new URL(env.CIRCLE_ORIGIN);
  if (!local(env) && (identity.protocol !== 'https:' || circle.protocol !== 'https:')) throw new Error('HTTPS identity and Circle origins are required');
  return { identity: identity.origin, circle: circle.origin };
}
async function body(request) { try { const text = await request.text(); return text.length <= 8192 ? JSON.parse(text) : {}; } catch { return {}; } }

export async function verifiedAccount(email, env) {
  const time = now();
  await env.LIBRARY_DB.prepare(`INSERT INTO customers(email,user_id,email_verified_at,created_at,updated_at)
    VALUES (?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET
    user_id=COALESCE(customers.user_id,excluded.user_id),
    email_verified_at=COALESCE(customers.email_verified_at,excluded.email_verified_at), updated_at=excluded.updated_at`)
    .bind(normalize(email), crypto.randomUUID(), time, time, time).run();
  return env.LIBRARY_DB.prepare('SELECT user_id,email,display_name,email_verified_at,created_at FROM customers WHERE email=?').bind(normalize(email)).first();
}

async function pendingAccount(email, env) {
  await env.LIBRARY_DB.prepare(`INSERT INTO customers(email,user_id,created_at,updated_at) VALUES (?,?,?,?)
    ON CONFLICT(email) DO UPDATE SET user_id=COALESCE(customers.user_id,excluded.user_id)`)
    .bind(email, crypto.randomUUID(), now(), now()).run();
  return env.LIBRARY_DB.prepare('SELECT user_id,email FROM customers WHERE email=?').bind(email).first();
}

export async function sharedIdentity(request, env) {
  const raw = cookie(request, 'tf_identity_session');
  if (!opaque(raw)) return null;
  return session(raw, 'identity', env);
}

async function session(raw, audience, env) {
  if (!opaque(raw)) return null;
  return env.LIBRARY_DB.prepare(`SELECT c.user_id,c.email,c.display_name,c.email_verified_at,c.created_at,
    s.token_hash,s.parent_session_hash,s.library_session_hash
    FROM circle_sessions s JOIN customers c ON c.user_id=s.user_id
    JOIN identity_passwords p ON p.user_id=s.user_id AND p.version=s.credential_version
    WHERE s.token_hash=? AND s.audience=? AND s.revoked_at IS NULL AND s.expires_at>?
    AND c.email_verified_at IS NOT NULL`)
    .bind(await digest(raw), audience, now()).first();
}

async function newSession(userId, audience, env, version) {
  const raw = token();
  await env.LIBRARY_DB.prepare(`INSERT INTO circle_sessions
    (token_hash,user_id,audience,created_at,expires_at,credential_version) VALUES (?,?,?,?,?,?)`)
    .bind(await digest(raw), userId, audience, now(), now() + 30 * DAY, version).run();
  return raw;
}

export async function revokeSharedIdentity(request, env) {
  const hashes = [];
  const shared = cookie(request, 'tf_identity_session');
  const library = cookie(request, 'tf_library_session');
  if (opaque(shared)) hashes.push(await digest(shared));
  if (hashes.length) await env.LIBRARY_DB.prepare('UPDATE circle_sessions SET revoked_at=? WHERE token_hash=? OR parent_session_hash=?').bind(now(), hashes[0], hashes[0]).run();
  if (opaque(library)) await env.LIBRARY_DB.prepare('UPDATE circle_sessions SET revoked_at=? WHERE library_session_hash=?').bind(now(), await libraryDigest(library)).run();
  return identityCookie('', env, 0);
}

async function eligibility(email, env) {
  return (await env.LIBRARY_DB.prepare(`SELECT e.id,e.source_id,s.label,e.reason,e.invitation_id,e.granted_at
    FROM circle_eligibility e JOIN circle_sources s ON s.id=e.source_id
    LEFT JOIN circle_invitations i ON i.id=e.invitation_id
    WHERE e.email=? AND e.revoked_at IS NULL AND s.active=1
    AND (i.id IS NULL OR (i.revoked_at IS NULL AND (i.accepted_at IS NOT NULL OR i.expires_at>?)))
    ORDER BY e.granted_at,e.id`).bind(email, now()).all()).results || [];
}

async function hasPurchase(email, env) {
  return env.LIBRARY_DB.prepare(`SELECT p.stripe_checkout_session_id,p.product_id,p.purchased_at
    FROM purchases p JOIN entitlements e ON e.customer_email=p.customer_email AND e.product_id=p.product_id
    WHERE p.customer_email=? AND p.payment_status='paid' AND e.revoked_at IS NULL LIMIT 1`).bind(email).first();
}

async function linkEligibility(user, env) {
  await env.LIBRARY_DB.prepare('UPDATE circle_eligibility SET user_id=? WHERE email=? AND user_id IS NULL').bind(user.user_id, user.email).run();
  const purchase = await hasPurchase(user.email, env);
  if (purchase) await env.LIBRARY_DB.prepare(`INSERT OR IGNORE INTO circle_eligibility
    (id,email,user_id,source_id,reason,evidence_reference,granted_by,granted_at)
    VALUES (?,?,?,'ritual-product',?,?,?,?)`).bind(crypto.randomUUID(), user.email, user.user_id,
    'Verified Tarot Flower purchase', purchase.stripe_checkout_session_id, 'stripe-purchase', purchase.purchased_at).run();
  // A genuine entry into the ecosystem remains a historical Circle reason.
  // Product entitlement changes do not silently sell or cancel community membership.
}

async function overview(user, env) {
  await linkEligibility(user, env);
  const reasons = await eligibility(user.email, env);
  const membership = await env.LIBRARY_DB.prepare('SELECT joined_at,status FROM circle_memberships WHERE user_id=?').bind(user.user_id).first();
  return { user: { id: user.user_id, email: user.email, name: user.display_name || '', verifiedAt: user.email_verified_at, createdAt: user.created_at },
    membership, eligibility: reasons, eligible: reasons.length > 0, owner: owner(user, env),
    guidelinesVersion: GUIDELINES_VERSION, privacyVersion: PRIVACY_VERSION,
    emailConsentVersion: EMAIL_CONSENT_VERSION, emailConsentText: EMAIL_CONSENT_TEXT };
}

async function limitBucket(value, limit, env) {
  if (!env.TOKEN_PEPPER || env.TOKEN_PEPPER.length < 32) throw new Error('TOKEN_PEPPER required');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.TOKEN_PEPPER), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const window = Math.floor(now() / (15 * MINUTE)) * 15 * MINUTE;
  const hash = b64(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))));
  const row = await env.LIBRARY_DB.prepare(`INSERT INTO circle_rate_limits(key_hash,window_start,attempts) VALUES (?,?,1)
      ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN circle_rate_limits.window_start=excluded.window_start THEN circle_rate_limits.attempts+1 ELSE 1 END,
      window_start=excluded.window_start RETURNING attempts`).bind(hash, window).first();
  return row.attempts > limit;
}
async function rateLimited(email, ip, env) {
  const byEmail = await limitBucket('email:' + email, 5, env);
  const byIp = await limitBucket('ip:' + ip, 100, env);
  return byEmail || byIp;
}
async function cleanup(env) {
  await env.LIBRARY_DB.batch([
    env.LIBRARY_DB.prepare('DELETE FROM identity_password_tokens WHERE expires_at<?').bind(now() - DAY),
    env.LIBRARY_DB.prepare('DELETE FROM circle_email_tokens WHERE expires_at<?').bind(now() - DAY),
    env.LIBRARY_DB.prepare('DELETE FROM circle_auth_requests WHERE expires_at<? AND NOT EXISTS (SELECT 1 FROM circle_email_tokens t WHERE t.request_hash=circle_auth_requests.request_hash)').bind(now() - DAY),
    env.LIBRARY_DB.prepare('DELETE FROM circle_sessions WHERE expires_at<? OR revoked_at<?').bind(now() - 7 * DAY, now() - 7 * DAY),
    env.LIBRARY_DB.prepare('DELETE FROM circle_rate_limits WHERE window_start<?').bind(now() - DAY),
    env.LIBRARY_DB.prepare('DELETE FROM circle_dev_outbox WHERE expires_at<?').bind(now()),
  ]);
}

async function turnstile(value, ip, env) {
  if (local(env)) return value === 'local-circle-turnstile';
  if (!env.CIRCLE_TURNSTILE_SECRET_KEY || !value) return false;
  const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', body: new URLSearchParams({ secret: env.CIRCLE_TURNSTILE_SECRET_KEY, response: String(value), remoteip: ip }),
  });
  const data = await result.json();
  return data.success === true && data.action === 'circle_login' && data.hostname === new URL(env.CIRCLE_ORIGIN).hostname;
}

async function authRequest(raw, env) {
  return opaque(raw) ? env.LIBRARY_DB.prepare('SELECT * FROM circle_auth_requests WHERE request_hash=? AND expires_at>? AND code_hash IS NULL')
    .bind(await digest(raw), now()).first() : null;
}
async function requestPasswordLink(data, env, ctx) {
  const transaction = await authRequest(data.request, env);
  if (!transaction) return json({ error: 'This request has expired. Please start again.' }, 400);
  const ip = String(data.ip || 'unknown'), email = normalize(data.email);
  if (await limitBucket('link-ip:' + ip, 30, env)) return json({ message: GENERIC }, 202);
  if (!await turnstile(data.turnstileToken, ip, env)) return json({ error: 'Please complete the security check.' }, 400);
  if (!validEmail(email) || await rateLimited(email, ip, env)) return json({ message: GENERIC }, 202);
  const delivery = issuePasswordLink(email, data.purpose === 'reset' ? 'reset' : 'setup', transaction, env);
  if (local(env)) await delivery;
  else ctx.waitUntil(delivery.catch(() => console.error('Circle password email processing failed')));
  // Account lookup, token creation and SMTP are outside the production response path.
  return json({ message: GENERIC }, 202);
}
async function issuePasswordLink(email, purpose, transaction, env) {
  const known = await env.LIBRARY_DB.prepare('SELECT c.user_id,p.version FROM customers c LEFT JOIN identity_passwords p ON p.user_id=c.user_id WHERE c.email=?').bind(email).first();
  if (purpose === 'setup') {
    if (known?.version || (!(await eligibility(email, env)).length && !await hasPurchase(email, env) && email !== normalize(env.CIRCLE_OWNER_EMAIL))) return;
  } else if (!known?.version) return;
  const user = known?.user_id ? known : await pendingAccount(email, env);
  const raw = token(), tokenHash = await digest(raw);
  await env.LIBRARY_DB.prepare(`INSERT INTO identity_password_tokens(token_hash,user_id,purpose,credential_version,created_at,expires_at) VALUES (?,?,?,?,?,?)`)
    .bind(tokenHash, user.user_id, purpose, known?.version || 0, now(), now() + 15 * MINUTE).run();
  const link = new URL('/api/auth/password/open', origins(env).circle);
  link.searchParams.set('token', raw);
  try {
    if (local(env)) {
      await env.LIBRARY_DB.prepare(`INSERT INTO circle_dev_outbox(request_hash,recipient,magic_link,expires_at) VALUES (?,?,?,?)
        ON CONFLICT(request_hash) DO UPDATE SET recipient=excluded.recipient,magic_link=excluded.magic_link,expires_at=excluded.expires_at`)
        .bind(transaction.request_hash, email, String(link), now() + 15 * MINUTE).run();
    } else {
      if (!env.EMAIL_SERVICE) throw new Error('Email service unavailable');
      const response = await env.EMAIL_SERVICE.fetch('https://email.internal/api/circle-password-link', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to: email, passwordLink: String(link), purpose }),
      });
      if (!response.ok) throw new Error('Email service unavailable');
    }
  } catch {
    await env.LIBRARY_DB.prepare('DELETE FROM identity_password_tokens WHERE token_hash=?').bind(tokenHash).run();
    console.error('Circle password email delivery failed');
  }
  return;
}
async function passwordProof(raw, env) {
  if (!opaque(raw)) return null;
  return env.LIBRARY_DB.prepare(`SELECT t.*,c.email FROM identity_password_tokens t
    JOIN customers c ON c.user_id=t.user_id LEFT JOIN identity_passwords p ON p.user_id=t.user_id
    WHERE t.token_hash=? AND t.consumed_at IS NULL AND t.expires_at>? AND t.credential_version=COALESCE(p.version,0)`)
    .bind(await digest(raw), now()).first();
}
async function setPassword(data, env) {
  if (await limitBucket('set-ip:' + String(data.ip || 'unknown'), 20, env)) return json({ error: 'Please try again shortly.' }, 429);
  const proof = await passwordProof(data.token, env);
  if (!proof) return json({ error: 'This link has expired or has already been used. Please request a new one.' }, 400);
  const invalid = passwordError(data.password, proof.email);
  if (invalid) return json({ error: invalid }, 400);
  if (proof.purpose === 'setup' && !(await eligibility(proof.email, env)).length && !await hasPurchase(proof.email, env) && proof.email !== normalize(env.CIRCLE_OWNER_EMAIL)) return json({ error: 'An eligible connection or invitation is needed to join.' }, 403);
  const encoded = hashPassword(data.password), time = now();
  // D1 batch is one transaction. Credential version + consumed_at make concurrent reuse fail closed.
  const gate = `EXISTS (SELECT 1 FROM identity_passwords p JOIN identity_password_tokens t ON t.token_hash=p.change_token_hash
    WHERE p.user_id=? AND p.change_token_hash=? AND t.consumed_at IS NULL)`;
  const result = await env.LIBRARY_DB.batch([
    env.LIBRARY_DB.prepare(`INSERT INTO identity_passwords(user_id,password_hash,version,created_at,changed_at,change_token_hash)
      SELECT t.user_id,?,t.credential_version+1,?,?,t.token_hash FROM identity_password_tokens t
      LEFT JOIN identity_passwords p ON p.user_id=t.user_id
      WHERE t.token_hash=? AND t.consumed_at IS NULL AND t.expires_at>? AND t.credential_version=COALESCE(p.version,0)
      ON CONFLICT(user_id) DO UPDATE SET password_hash=excluded.password_hash,version=excluded.version,
      changed_at=excluded.changed_at,change_token_hash=excluded.change_token_hash WHERE identity_passwords.version=excluded.version-1`)
      .bind(encoded,time,time,proof.token_hash,time),
    env.LIBRARY_DB.prepare(`UPDATE customers SET email_verified_at=COALESCE(email_verified_at,?),updated_at=? WHERE user_id=? AND ${gate}`)
      .bind(time,time,proof.user_id,proof.user_id,proof.token_hash),
    env.LIBRARY_DB.prepare(`UPDATE circle_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL AND ${gate}`)
      .bind(time,proof.user_id,proof.user_id,proof.token_hash),
    env.LIBRARY_DB.prepare(`UPDATE sessions SET revoked_at=? WHERE customer_email=? AND revoked_at IS NULL AND ${gate}`)
      .bind(time,proof.email,proof.user_id,proof.token_hash),
    env.LIBRARY_DB.prepare(`UPDATE identity_password_tokens SET consumed_at=? WHERE user_id=? AND consumed_at IS NULL AND ${gate}`)
      .bind(time,proof.user_id,proof.user_id,proof.token_hash),
  ]);
  if (result[0].meta.changes !== 1) return json({ error: 'This link has expired or has already been used. Please request a new one.' }, 400);
  // No session is issued by an email link or by password recovery. Sign-in must verify the new password.
  if (!local(env)) {
    try {
      const response = await env.EMAIL_SERVICE?.fetch('https://email.internal/api/circle-password-changed', {
        method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({to:proof.email}),
      });
      if (!response?.ok) throw new Error('Notification unavailable');
    } catch { console.error('Circle password-change notification failed'); }
  }
  return json({ ok: true });
}
async function passwordLogin(data, env) {
  const tx = await authRequest(data.request, env), ip = String(data.ip || 'unknown'), email = normalize(data.email);
  if (!tx) return json({ error: 'This sign-in has expired. Please start again.' }, 400);
  const ipLimited = await limitBucket('password-ip:' + ip, 30, env);
  const emailLimited = await limitBucket('password-email:' + email, 10, env);
  if (ipLimited || emailLimited) return json({ error: 'Too many sign-in attempts. Please try again in 15 minutes.' }, 429);
  if (!await turnstile(data.turnstileToken, ip, env)) return json({ error: 'Please complete the security check.' }, 400);
  const invalid = () => json({ error: 'We couldn’t sign you in with that email and password.' }, 401);
  if (!validEmail(email) || typeof data.password !== 'string' || [...data.password].length > 128) return invalid();
  const user = await env.LIBRARY_DB.prepare(`SELECT c.*,p.password_hash,p.version FROM customers c
    LEFT JOIN identity_passwords p ON p.user_id=c.user_id WHERE c.email=?`).bind(email).first();
  if (!verifyPassword(data.password, user?.password_hash) || !user?.email_verified_at) return invalid();
  const code = token();
  const row = await env.LIBRARY_DB.prepare(`UPDATE circle_auth_requests SET user_id=?,code_hash=?,code_expires_at=?,credential_version=?
    WHERE request_hash=? AND code_hash IS NULL AND expires_at>? AND EXISTS (SELECT 1 FROM identity_passwords WHERE user_id=? AND version=?) RETURNING state`)
    .bind(user.user_id,await digest(code),now()+90,user.version,tx.request_hash,now(),user.user_id,user.version).first();
  if (!row) return json({ error: 'Please start sign-in again.' }, 400);
  const callback = new URL('/api/auth/callback', origins(env).circle);
  callback.searchParams.set('code',code); callback.searchParams.set('state',row.state);
  return json({ redirect: String(callback) });
}

export async function circlePublic(request, env, ctx) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/circle-auth/') && !url.pathname.startsWith('/__local/circle/')) return null;
  if (!env.CIRCLE_ORIGIN) return new Response('Not found', { status: 404 });
  if (url.pathname.startsWith('/__local/circle/')) {
    if (!local(env) || !loopback(url) || !env.CIRCLE_LOCAL_BRIDGE_SECRET ||
      await digest(request.headers.get('x-circle-local-secret') || '') !== await digest(env.CIRCLE_LOCAL_BRIDGE_SECRET)) return json({ error: 'Not found' }, 404);
    return circleInternal(request, env, url.pathname.replace('/__local/circle/', ''), ctx);
  }
  // Retired passwordless authorize/verify endpoints must never mint a Circle session.
  return json({ error: 'Please sign in to Moonlight Circle with your email and password.' }, 410);
}

export async function circleInternal(request, env, action, ctx) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const data = await body(request);
  if (action === 'start') {
    if (!local(env) && await limitBucket('start:' + String(data.ip || 'unknown'), 120, env)) return json({ error: 'Please try again shortly.' }, 429);
    await cleanup(env);
    if (!opaque(data.state) || !opaque(data.challenge)) return json({ error: 'Invalid sign-in' }, 400);
    const req = token();
    await env.LIBRARY_DB.prepare('INSERT INTO circle_auth_requests(request_hash,state,code_challenge,created_at,expires_at) VALUES (?,?,?,?,?)')
      .bind(await digest(req), data.state, data.challenge, now(), now() + 15 * MINUTE).run();
    const url = new URL('/login', origins(env).circle);
    url.searchParams.set('request', req);
    if (data.prompt === 'login') url.searchParams.set('prompt', 'login');
    return json({ request: req, authorizeUrl: String(url), turnstileSiteKey: env.CIRCLE_TURNSTILE_SITE_KEY || '' });
  }
  if (action === 'request-link') return json({ error: 'Passwordless sign-in is no longer available.' }, 410);
  if (action === 'password-link') return requestPasswordLink(data, env, ctx);
  if (action === 'password-login') return passwordLogin(data, env);
  if (action === 'password-info') {
    const proof = await passwordProof(data.token, env);
    return proof ? json({ purpose: proof.purpose }) : json({ error: 'This link has expired or has already been used.' }, 400);
  }
  if (action === 'password-set') return setPassword(data, env);
  if (action === 'exchange') {
    if (![data.code, data.verifier, data.state].every(opaque)) return json({ error: 'Invalid sign-in' }, 400);
    const proof = await env.LIBRARY_DB.prepare(`UPDATE circle_auth_requests SET exchanged_at=?
      WHERE code_hash=? AND code_challenge=? AND state=? AND code_expires_at>? AND expires_at>? AND exchanged_at IS NULL
      AND credential_version IS NOT NULL AND EXISTS (SELECT 1 FROM identity_passwords p WHERE p.user_id=circle_auth_requests.user_id AND p.version=circle_auth_requests.credential_version)
      RETURNING user_id,credential_version`)
      .bind(now(), await digest(data.code), await digest(data.verifier), data.state, now(), now()).first();
    if (!proof) return json({ error: 'This sign-in has expired or was already completed.' }, 400);
    const raw = await newSession(proof.user_id, 'moonlight', env, proof.credential_version);
    const user = await session(raw, 'moonlight', env);
    if (!user) return json({ error: 'Please sign in again.' }, 401);
    return json({ session: raw, profile: await overview(user, env) });
  }
  if (action === 'dev-mailbox') {
    if (!local(env) || !opaque(data.request)) return json({ error: 'Not found' }, 404);
    const mail = await env.LIBRARY_DB.prepare('SELECT recipient,magic_link,expires_at FROM circle_dev_outbox WHERE request_hash=? AND expires_at>?').bind(await digest(data.request), now()).first();
    return json({ mail });
  }
  const user = await session(data.session, 'moonlight', env);
  if (!user) return json({ error: 'Please sign in.' }, 401);
  if (action === 'profile') return json(await overview(user, env));
  if (action === 'logout') {
    await env.LIBRARY_DB.prepare('UPDATE circle_sessions SET revoked_at=? WHERE token_hash=? OR token_hash=? OR parent_session_hash=?')
      .bind(now(), user.token_hash, user.parent_session_hash, user.parent_session_hash).run();
    if (user.library_session_hash) await env.LIBRARY_DB.prepare('UPDATE sessions SET revoked_at=? WHERE token_hash=?').bind(now(), user.library_session_hash).run();
    return json({ ok: true });
  }
  if (action === 'join') {
    const name = String(data.name || '').trim();
    if (!name || name.length > 80 || data.accepted !== true || data.guidelinesVersion !== GUIDELINES_VERSION || data.privacyVersion !== PRIVACY_VERSION) return json({ error: 'Please add your name and accept the current community guidelines and privacy notice.' }, 400);
    if (typeof data.emailConsent !== 'boolean' || data.emailConsentVersion !== EMAIL_CONSENT_VERSION)
      return json({ error: 'Please refresh the joining page and try again.' }, 400);
    const profile = await overview(user, env);
    if (profile.membership && profile.membership.status !== 'active') return json({ error: 'Please contact Vanessa about your membership.' }, 403);
    if (!profile.eligible) return json({ error: 'An eligible connection or invitation is needed to join.' }, 403);
    const time = now();
    const statements = [
      env.LIBRARY_DB.prepare('UPDATE customers SET display_name=?,updated_at=? WHERE user_id=?').bind(name, time, user.user_id),
      env.LIBRARY_DB.prepare(`INSERT OR IGNORE INTO circle_memberships(user_id,joined_at,status,updated_at,initial_eligibility_id) VALUES (?,?,'active',?,?)`).bind(user.user_id, time, time, profile.eligibility[0].id),
      ...[['guidelines', GUIDELINES_VERSION], ['privacy-notice', PRIVACY_VERSION]].map(([document, version]) => env.LIBRARY_DB.prepare('INSERT OR IGNORE INTO circle_acceptances(id,user_id,document,version,accepted_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(), user.user_id, document, version, time)),
      env.LIBRARY_DB.prepare(`INSERT OR IGNORE INTO circle_email_consents
        (id,user_id,email,status,version,consent_text,recorded_at) VALUES (?,?,?,?,?,?,?)`)
        .bind(crypto.randomUUID(),user.user_id,user.email,data.emailConsent ? 'granted' : 'declined',
          EMAIL_CONSENT_VERSION,EMAIL_CONSENT_TEXT,Date.now()),
      env.LIBRARY_DB.prepare(`UPDATE circle_invitations SET accepted_at=COALESCE(accepted_at,?) WHERE email=? AND revoked_at IS NULL AND expires_at>?`).bind(time, user.email, time),
    ];
    await env.LIBRARY_DB.batch(statements);
    ctx.waitUntil(syncCircleEmailConsents(env, user.user_id));
    return json({ ok: true });
  }
  if (!owner(user, env)) return json({ error: 'Not found' }, 404);
  if (action === 'owner-members') {
    const members = (await env.LIBRARY_DB.prepare(`SELECT c.user_id,c.display_name AS name,c.email,m.joined_at,m.status,
      (SELECT group_concat(DISTINCT s.label) FROM circle_eligibility e JOIN circle_sources s ON s.id=e.source_id WHERE e.user_id=c.user_id) AS sources
      FROM circle_memberships m JOIN customers c ON c.user_id=m.user_id ORDER BY m.joined_at DESC,c.user_id`).all()).results;
    const sources = (await env.LIBRARY_DB.prepare('SELECT id,label FROM circle_sources WHERE active=1 ORDER BY rowid').all()).results;
    return json({ members, total: members.length, active: members.filter((m) => m.status === 'active').length, sources });
  }
  if (action === 'owner-invite') {
    const email = normalize(data.email);
    const reason = String(data.reason || '').trim();
    const source = await env.LIBRARY_DB.prepare('SELECT id FROM circle_sources WHERE id=? AND active=1').bind(String(data.source || '')).first();
    if (!validEmail(email) || !source || !reason || reason.length > 240) return json({ error: 'Add a valid email, qualifying source, and a short reason.' }, 400);
    const id = crypto.randomUUID();
    const known = await env.LIBRARY_DB.prepare('SELECT user_id FROM customers WHERE email=?').bind(email).first();
    await env.LIBRARY_DB.batch([
      env.LIBRARY_DB.prepare('INSERT INTO circle_invitations(id,email,source_id,invited_by,created_at,expires_at) VALUES (?,?,?,?,?,?)').bind(id, email, source.id, user.user_id, now(), now() + 30 * DAY),
      env.LIBRARY_DB.prepare(`INSERT INTO circle_eligibility(id,email,user_id,source_id,reason,evidence_reference,invitation_id,granted_by,granted_at) VALUES (?,?,?,?,?,?,?,?,?)`)
        .bind(crypto.randomUUID(), email, known?.user_id || null, source.id, reason, `invitation:${id}`, id, user.user_id, now()),
    ]);
    return json({ ok: true, invitationId: id, email }, 201);
  }
  return json({ error: 'Not found' }, 404);
}

// Production callers use a private Cloudflare service binding, never a public bearer-header API.
export class CircleIdentityService extends WorkerEntrypoint {
  async fetch(request) {
    try { return await circleInternal(request, this.env, new URL(request.url).pathname.slice(1), this.ctx); }
    catch { console.error('Circle identity service failed'); return json({ error: 'Please try again in a moment.' }, 503); }
  }
}
