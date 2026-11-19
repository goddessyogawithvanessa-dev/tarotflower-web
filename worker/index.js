import { circlePublic, verifiedAccount, sharedIdentity, revokeSharedIdentity } from './circle/identity.js';
import { syncCircleEmailConsents } from './circle/consent.js';
import { hashPassword, verifyPassword, passwordError } from './circle/passwords.js';
import { handleWorkbenchRequest } from './workbench/access.js';
export { CircleIdentityService } from './circle/identity.js';

const SESSION_COOKIE = 'tf_library_session';
const CHECKOUT_CONTEXT_COOKIE = 'tf_library_checkout_context';
const MAGIC_LINK_TTL_SECONDS = 15 * 60;
const PASSWORD_LINK_TTL_SECONDS = 15 * 60;
const ACCOUNT_VERIFICATION_TTL_SECONDS = 24 * 60 * 60;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
const RATE_LIMIT_ATTEMPTS = 5;
const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
const GENERIC_LOGIN_MESSAGE = 'If that email is connected to a purchase, a secure sign-in link is on its way.';
const STEP_INTO_YOUR_FIRE_PRODUCT_ID = 'ritual-step-into-the-fire-test';
const STEP_INTO_YOUR_FIRE_SLUG = 'step-into-your-fire';
const LEGACY_STEP_INTO_FIRE_SLUG = 'step-into-the-fire-test';
const LEGACY_STEP_INTO_FIRE_PATH = '/library/rituals/step-into-the-fire-test/';
const PURCHASE_EMAIL_CLAIM_TTL_SECONDS = 5 * 60;
const GENERIC_PASSWORD_MESSAGE = 'If that email is connected to a purchase, a private email is on its way.';
const ACCOUNT_CREATED_MESSAGE = 'Almost there! Please check your email.';
const PUBLIC_EMAIL_SERVICE_ROUTES = new Set([
  '/api/contact/config',
  '/api/contact',
  '/api/lead-magnet',
  '/api/oracle-waitlist',
  '/api/tarot-newsletter',
]);

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(syncCircleEmailConsents(env));
  },
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
  const circleResponse = await circlePublic(request, env, ctx);
  if (circleResponse) return circleResponse;
  const url = new URL(request.url);
  const visitorScheme = request.headers.get('CF-Visitor') || '';

  if (
    (url.protocol === 'http:' || visitorScheme.includes('"scheme":"http"'))
    && (url.hostname === 'tarotflower.com' || url.hostname === 'www.tarotflower.com')
  ) {
    url.protocol = 'https:';
    return Response.redirect(url.toString(), 301);
  }

  if (PUBLIC_EMAIL_SERVICE_ROUTES.has(url.pathname)) {
    if (!env.EMAIL_SERVICE?.fetch) {
      return json({ error: 'Contact service unavailable.' }, 503);
    }
    const serviceUrl = new URL(url.pathname, 'https://email.internal');
    serviceUrl.search = url.search;
    return env.EMAIL_SERVICE.fetch(new Request(serviceUrl.toString(), request));
  }

  if (url.pathname === '/api/email/unsubscribe' && ['GET', 'POST'].includes(request.method)) {
    if (!env.EMAIL_SERVICE?.fetch) return new Response('Unsubscribe service unavailable.', { status: 503 });
    const serviceUrl = new URL('https://email.internal/api/email/unsubscribe');
    serviceUrl.search = url.search;
    return env.EMAIL_SERVICE.fetch(new Request(serviceUrl.toString(), request));
  }

  const newsletterPreview = url.pathname.match(/^\/workbench\/newsletters\/([^/]+)\/preview\/?$/);
  if (newsletterPreview && request.method === 'GET') {
    const session = await authenticate(request, env, true);
    if (!session) return noStoreRedirect(new URL('/workbench/login/', appOrigin(env)), 302);
    if (normalizeEmail(session.email) !== workbenchOwnerEmail(env)) {
      return new Response('This account is not authorized for the Tarot Flower Workbench.', {
        status: 403, headers: workbenchSecurityHeaders(),
      });
    }
    if (!env.EMAIL_SERVICE?.fetch) return new Response('Preview service unavailable.', { status: 503 });
    return env.EMAIL_SERVICE.fetch(`https://email.internal/api/admin/newsletters/${encodeURIComponent(newsletterPreview[1])}/preview`);
  }

  if (request.method === 'GET' && url.pathname === '/workbench') {
    return Response.redirect(`${url.origin}/workbench/${url.search}`, 308);
  }

  if (url.pathname === '/workbench/') {
    const session = await authenticate(request, env, true);
    if (!session) {
      return noStoreRedirect(new URL('/workbench/login/', appOrigin(env)), 302);
    }
    if (normalizeEmail(session.email) !== workbenchOwnerEmail(env)) {
      return new Response('This account is not authorized for the Tarot Flower Workbench.', {
        status: 403,
        headers: workbenchSecurityHeaders(),
      });
    }
    return handleWorkbenchRequest(request, env);
  }

  if (request.method === 'POST' && url.pathname === '/api/workbench/login') {
    return workbenchPasswordLogin(request, env);
  }

  if (request.method === 'POST' && url.pathname === '/api/workbench/password/request') {
    return requestWorkbenchPasswordLink(request, env, ctx);
  }

  if (request.method === 'POST' && url.pathname === '/api/workbench/password/set') {
    return setWorkbenchPassword(request, env, ctx);
  }

  if (request.method === 'POST' && url.pathname === '/api/workbench/logout') {
    return logout(request, env, '/workbench/login/');
  }

  if (request.method === 'GET' && url.pathname === '/api/library/config') {
    return json({
      turnstileSiteKey: env.TURNSTILE_SITE_KEY || '',
      testMode: isTestMode(env),
    });
  }

  if (request.method === 'POST' && url.pathname === '/api/library/request-link') {
    return requestMagicLink(request, env, ctx);
  }

  if (request.method === 'POST' && url.pathname === '/api/library/login') {
    return passwordLogin(request, env);
  }

  if (request.method === 'POST' && url.pathname === '/api/library/account/register') {
    return registerLibraryAccount(request, env);
  }

  if (request.method === 'GET' && url.pathname === '/library/verify') {
    return verifyLibraryAccount(request, env);
  }

  if (request.method === 'POST' && url.pathname === '/api/library/account/resend-verification') {
    return resendLibraryVerification(request, env, ctx);
  }

  if (request.method === 'POST' && url.pathname === '/api/library/password/request') {
    return requestPasswordLink(request, env, ctx);
  }

  if (request.method === 'GET' && url.pathname === '/api/library/password/info') {
    return passwordLinkInfo(request, env);
  }

  if (request.method === 'POST' && url.pathname === '/api/library/password/set') {
    return setLibraryPassword(request, env, ctx);
  }

  if (request.method === 'GET' && url.pathname === '/api/library/setup-context') {
    return getCheckoutContext(request, env);
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

  if (request.method === 'GET' && url.pathname === '/api/library/video/step-into-your-fire') {
    return getProtectedFireVideo(request, env);
  }

  if (request.method === 'GET' && url.pathname === '/api/pinterest/fire-receipt') {
    return getFireConversionReceipt(request, env);
  }

  if (request.method === 'GET' && url.pathname === '/api/analytics/fire-receipt') {
    return getFireAnalyticsReceipt(request, env);
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

  const destination = await resolveRequestedDestination(email, body.destinationPath, env);

  const rawToken = randomToken();
  const tokenHash = await sha256(rawToken);
  const ipHash = await keyedHash(`${ip}|${email}`, env.TOKEN_PEPPER);
  const now = unixTime();

  await env.LIBRARY_DB.prepare(
    `INSERT INTO magic_links
      (token_hash, customer_email, product_id, destination_path, requested_ip_hash,
       created_at, expires_at, consumed_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL)`,
  ).bind(
    tokenHash,
    email,
    destination.productId,
    destination.path,
    ipHash,
    now,
    now + MAGIC_LINK_TTL_SECONDS,
  ).run();

  const linkUrl = new URL('/library/auth', appOrigin(env));
  linkUrl.searchParams.set('token', rawToken);
  if (destination.path !== '/library/') linkUrl.searchParams.set('next', destination.path);
  const link = linkUrl.toString();
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

async function passwordLogin(request, env) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  const turnstileToken = typeof body.turnstileToken === 'string' ? body.turnstileToken : '';
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const invalid = () => json({ error: 'We couldn’t sign you in with that email and password.' }, 401, noStoreHeaders());

  if (!await verifyTurnstile(turnstileToken, ip, env)) {
    return json({ error: 'Please complete the security check and try again.' }, 400, noStoreHeaders());
  }
  if (!email || !isValidEmail(email) || [...password].length > 128) return invalid();
  if (await isRateLimited(`login:${email}`, ip, env)) {
    return json({ error: 'Too many sign-in attempts. Please try again in 15 minutes.' }, 429, noStoreHeaders());
  }

  const account = await passwordAccount(email, env);
  const entitlement = await env.LIBRARY_DB.prepare(
    'SELECT 1 FROM entitlements WHERE customer_email=?1 AND revoked_at IS NULL LIMIT 1',
  ).bind(email).first();
  if (!verifyPassword(password, account?.password_hash) || !account?.email_verified_at || !entitlement) return invalid();

  const destination = await resolveRequestedDestination(email, body.destinationPath, env);
  const response = json({ ok: true, redirect: destination.path }, 200, noStoreHeaders());
  response.headers.append('Set-Cookie', await createLibrarySession(email, 'password', env));
  response.headers.append('Set-Cookie', clearCheckoutContextCookie());
  return response;
}

async function workbenchPasswordLogin(request, env) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  const turnstileToken = typeof body.turnstileToken === 'string' ? body.turnstileToken : '';
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const invalid = () => json({ error: 'We couldn’t sign you in with that email and password.' }, 401, workbenchSecurityHeaders());

  if (!await verifyTurnstile(turnstileToken, ip, env)) {
    return json({ error: 'Please complete the security check and try again.' }, 400, workbenchSecurityHeaders());
  }
  if (!email || !isValidEmail(email) || [...password].length > 128) return invalid();
  if (await isRateLimited(`login:${email}`, ip, env)) {
    return json({ error: 'Too many sign-in attempts. Please try again in 15 minutes.' }, 429, workbenchSecurityHeaders());
  }

  const account = await passwordAccount(email, env);
  const isOwner = email === workbenchOwnerEmail(env);
  if (!verifyPassword(password, account?.password_hash) || !account?.email_verified_at || !isOwner) return invalid();

  const response = json({ ok: true, redirect: '/workbench/' }, 200, workbenchSecurityHeaders());
  response.headers.append('Set-Cookie', await createLibrarySession(email, 'password', env));
  return response;
}

async function requestPasswordLink(request, env, ctx) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const purpose = 'reset';
  const turnstileToken = typeof body.turnstileToken === 'string' ? body.turnstileToken : '';
  const ip = request.headers.get('CF-Connecting-IP') || 'local';

  if (!await verifyTurnstile(turnstileToken, ip, env)) {
    return json({ error: 'Please complete the security check and try again.' }, 400, noStoreHeaders());
  }
  if (!email || !isValidEmail(email) || await isRateLimited(`${purpose}:${email}`, ip, env)) {
    return json({ message: GENERIC_PASSWORD_MESSAGE }, 202, noStoreHeaders());
  }

  const destination = await resolveRequestedDestination(email, body.destinationPath, env);
  const delivery = issueLibraryPasswordLink(email, purpose, destination.path, env);
  if (isTestMode(env)) await delivery;
  else ctx.waitUntil(delivery.catch(() => console.error('Library password email processing failed')));
  return json({ message: GENERIC_PASSWORD_MESSAGE }, 202, noStoreHeaders());
}

async function requestWorkbenchPasswordLink(request, env, ctx) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const turnstileToken = typeof body.turnstileToken === 'string' ? body.turnstileToken : '';
  const ip = request.headers.get('CF-Connecting-IP') || 'local';

  if (!await verifyTurnstile(turnstileToken, ip, env)) {
    return json({ error: 'Please complete the security check and try again.' }, 400, workbenchSecurityHeaders());
  }
  if (!email || !isValidEmail(email) || email !== workbenchOwnerEmail(env)
      || await isRateLimited(`reset:${email}`, ip, env)) {
    return json({ message: GENERIC_PASSWORD_MESSAGE }, 202, workbenchSecurityHeaders());
  }

  const delivery = issueWorkbenchPasswordLink(email, env);
  if (isTestMode(env)) await delivery;
  else ctx.waitUntil(delivery.catch(() => console.error('Workbench password email processing failed')));
  return json({ message: GENERIC_PASSWORD_MESSAGE }, 202, workbenchSecurityHeaders());
}

async function passwordLinkInfo(request, env) {
  const token = new URL(request.url).searchParams.get('token') || '';
  const proof = await libraryPasswordProof(token, env);
  if (!proof) return json({ error: 'This link has expired or has already been used.' }, 400, noStoreHeaders());
  return json({ email: proof.email, purpose: proof.purpose }, 200, noStoreHeaders());
}

async function setLibraryPassword(request, env, ctx) {
  const body = await readJson(request);
  const proof = await libraryPasswordProof(body.token, env);
  if (!proof || proof.purpose !== 'reset') return json({ error: 'This link has expired or has already been used. Please request a new one.' }, 400, noStoreHeaders());
  if (body.password !== body.confirmPassword) return json({ error: 'The two passwords do not match.' }, 400, noStoreHeaders());
  const invalid = passwordError(body.password, proof.email);
  if (invalid) return json({ error: invalid }, 400, noStoreHeaders());

  const entitlement = await env.LIBRARY_DB.prepare(
    'SELECT 1 FROM entitlements WHERE customer_email=?1 AND revoked_at IS NULL LIMIT 1',
  ).bind(proof.email).first();
  if (!entitlement) return json({ error: 'No purchased rituals are connected to this email.' }, 403, noStoreHeaders());

  const destination = await resolveRequestedDestination(proof.email, body.destinationPath, env);
  return commitPasswordChange(proof, body.password, destination.path, env, ctx, true);
}

async function setWorkbenchPassword(request, env, ctx) {
  const body = await readJson(request);
  const proof = await libraryPasswordProof(body.token, env);
  if (!proof || proof.purpose !== 'reset' || normalizeEmail(proof.email) !== workbenchOwnerEmail(env)) {
    return json({ error: 'This link has expired or has already been used. Please request a new one.' }, 400, workbenchSecurityHeaders());
  }
  if (body.password !== body.confirmPassword) {
    return json({ error: 'The two passwords do not match.' }, 400, workbenchSecurityHeaders());
  }
  const invalid = passwordError(body.password, proof.email);
  if (invalid) return json({ error: invalid }, 400, workbenchSecurityHeaders());
  return commitPasswordChange(proof, body.password, '/workbench/', env, ctx, false);
}

async function registerLibraryAccount(request, env) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const turnstileToken = typeof body.turnstileToken === 'string' ? body.turnstileToken : '';

  if (!await verifyTurnstile(turnstileToken, ip, env)) {
    return json({ error: 'Please complete the security check and try again.' }, 400, noStoreHeaders());
  }
  if (!email || !isValidEmail(email)) return json({ error: 'Please enter a valid email address.' }, 400, noStoreHeaders());
  if (password !== confirmPassword) return json({ error: 'The two passwords do not match.' }, 400, noStoreHeaders());
  const invalid = passwordError(password, email);
  if (invalid) return json({ error: invalid }, 400, noStoreHeaders());
  if (await isRateLimited(`register:${email}`, ip, env)) {
    return json({ error: 'Too many attempts. Please try again in 15 minutes.' }, 429, noStoreHeaders());
  }

  const account = await passwordAccount(email, env);
  const entitlement = await env.LIBRARY_DB.prepare(
    'SELECT 1 FROM entitlements WHERE customer_email=?1 AND revoked_at IS NULL LIMIT 1',
  ).bind(email).first();
  if (account?.password_hash) {
    return json({ error: 'You already have an account. Please sign in, or use Forgot Password if you need help.' }, 409, noStoreHeaders());
  }
  if (!account || !entitlement) {
    return json({ error: 'We could not find a purchased ritual for that email. Please use the email from checkout or reply to your welcome email for help.' }, 403, noStoreHeaders());
  }

  const user = await ensureCustomerIdentity(email, env);
  const destination = await resolveRegistrationDestination(email, body.destinationPath, env);
  const rawToken = randomToken();
  const tokenHash = await sha256(rawToken);
  const now = unixTime();
  await env.LIBRARY_DB.prepare(
    `INSERT INTO identity_password_tokens
      (token_hash,user_id,purpose,credential_version,created_at,expires_at,consumed_at,pending_password_hash,destination_path)
     VALUES (?1,?2,'setup',0,?3,?4,NULL,?5,?6)`,
  ).bind(tokenHash, user.user_id, now, now + ACCOUNT_VERIFICATION_TTL_SECONDS, hashPassword(password), destination.path).run();

  const link = new URL('/library/verify', appOrigin(env));
  link.searchParams.set('token', rawToken);
  try {
    await sendLibraryAccountVerification(email, link.toString(), env);
    await env.LIBRARY_DB.prepare(
      `UPDATE identity_password_tokens SET consumed_at=?1,pending_password_hash=NULL
       WHERE user_id=?2 AND purpose='setup' AND consumed_at IS NULL AND token_hash<>?3`,
    ).bind(now, user.user_id, tokenHash).run();
  } catch (error) {
    await env.LIBRARY_DB.prepare('DELETE FROM identity_password_tokens WHERE token_hash=?1').bind(tokenHash).run();
    console.error('Library verification email failed', error);
    return json({ error: 'We could not send the verification email. Please try again.' }, 503, noStoreHeaders());
  }

  return json({
    message: ACCOUNT_CREATED_MESSAGE,
    detail: "We've sent you a verification link. Open that email and click VERIFY MY EMAIL to finish setting up your account and begin your ritual.",
  }, 202, noStoreHeaders());
}

async function verifyLibraryAccount(request, env) {
  const rawToken = new URL(request.url).searchParams.get('token') || '';
  const setupUrl = new URL('/library/setup/?status=expired', appOrigin(env));
  if (!/^[A-Za-z0-9_-]{43}$/.test(rawToken)) return noStoreRedirect(setupUrl, 302);
  const tokenHash = await sha256(rawToken);
  const now = unixTime();
  const proof = await env.LIBRARY_DB.prepare(
    `SELECT t.token_hash,t.user_id,t.pending_password_hash,t.destination_path,t.expires_at,t.consumed_at,c.email
     FROM identity_password_tokens t JOIN customers c ON c.user_id=t.user_id
     LEFT JOIN identity_passwords p ON p.user_id=t.user_id
     WHERE t.token_hash=?1 AND t.purpose='setup' AND p.user_id IS NULL`,
  ).bind(tokenHash).first();
  if (!proof || proof.consumed_at !== null || Number(proof.expires_at) <= now || !proof.pending_password_hash) {
    return noStoreRedirect(setupUrl, 302);
  }

  const gate = `EXISTS (SELECT 1 FROM identity_passwords p
    WHERE p.user_id=?3 AND p.change_token_hash=?4)`;
  const statements = [
    env.LIBRARY_DB.prepare(
      `INSERT INTO identity_passwords(user_id,password_hash,version,created_at,changed_at,change_token_hash)
       SELECT user_id,pending_password_hash,1,?1,?1,token_hash FROM identity_password_tokens
       WHERE token_hash=?2 AND purpose='setup' AND consumed_at IS NULL AND expires_at>?1
         AND pending_password_hash IS NOT NULL
       ON CONFLICT(user_id) DO NOTHING`,
    ).bind(now, tokenHash),
    env.LIBRARY_DB.prepare(`UPDATE customers SET email_verified_at=COALESCE(email_verified_at,?1),updated_at=?1
      WHERE user_id=?2 AND ${gate}`).bind(now, proof.user_id, proof.user_id, tokenHash),
    env.LIBRARY_DB.prepare(`UPDATE sessions SET revoked_at=?1 WHERE customer_email=?2 AND revoked_at IS NULL AND ${gate}`)
      .bind(now, proof.email, proof.user_id, tokenHash),
    env.LIBRARY_DB.prepare(`UPDATE identity_password_tokens SET consumed_at=?1,pending_password_hash=NULL
      WHERE user_id=?2 AND purpose='setup' AND consumed_at IS NULL AND ${gate}`)
      .bind(now, proof.user_id, proof.user_id, tokenHash),
  ];
  if (env.CIRCLE_ORIGIN) statements.splice(2, 0,
    env.LIBRARY_DB.prepare(`UPDATE circle_sessions SET revoked_at=?1 WHERE user_id=?2 AND revoked_at IS NULL AND ${gate}`)
      .bind(now, proof.user_id, proof.user_id, tokenHash));
  const result = await env.LIBRARY_DB.batch(statements);
  if (Number(result[0].meta?.changes || 0) !== 1) return noStoreRedirect(setupUrl, 302);

  const destination = await resolveRegistrationDestination(proof.email, proof.destination_path, env);
  const response = noStoreRedirect(new URL(destination.path, appOrigin(env)), 302);
  response.headers.append('Set-Cookie', await createLibrarySession(proof.email, 'password', env));
  response.headers.append('Set-Cookie', clearCheckoutContextCookie());
  return response;
}

async function resendLibraryVerification(request, env) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const turnstileToken = typeof body.turnstileToken === 'string' ? body.turnstileToken : '';
  if (!await verifyTurnstile(turnstileToken, ip, env)) {
    return json({ error: 'Please complete the security check and try again.' }, 400, noStoreHeaders());
  }
  if (!email || !isValidEmail(email)) return json({ error: 'Please enter a valid email address.' }, 400, noStoreHeaders());
  if (await isRateLimited(`verify:${email}`, ip, env)) {
    return json({ error: 'Too many attempts. Please try again in 15 minutes.' }, 429, noStoreHeaders());
  }
  const account = await passwordAccount(email, env);
  const pending = account && !account.password_hash
    ? await env.LIBRARY_DB.prepare(
      `SELECT t.user_id,t.pending_password_hash,t.destination_path FROM identity_password_tokens t
       WHERE t.user_id=?1 AND t.purpose='setup' AND t.pending_password_hash IS NOT NULL
       ORDER BY t.created_at DESC LIMIT 1`,
    ).bind(account.user_id).first()
    : null;
  if (!pending) {
    return json({ error: 'No unfinished account setup was found. You can create your account again using your purchase email.' }, 404, noStoreHeaders());
  }

  const rawToken = randomToken();
  const tokenHash = await sha256(rawToken);
  const now = unixTime();
  await env.LIBRARY_DB.prepare(
    `INSERT INTO identity_password_tokens
      (token_hash,user_id,purpose,credential_version,created_at,expires_at,consumed_at,pending_password_hash,destination_path)
     VALUES (?1,?2,'setup',0,?3,?4,NULL,?5,?6)`,
  ).bind(tokenHash, pending.user_id, now, now + ACCOUNT_VERIFICATION_TTL_SECONDS,
    pending.pending_password_hash, pending.destination_path).run();
  const link = new URL('/library/verify', appOrigin(env));
  link.searchParams.set('token', rawToken);
  try {
    await sendLibraryAccountVerification(email, link.toString(), env);
    await env.LIBRARY_DB.prepare(
      `UPDATE identity_password_tokens SET consumed_at=?1,pending_password_hash=NULL
       WHERE user_id=?2 AND purpose='setup' AND consumed_at IS NULL AND token_hash<>?3`,
    ).bind(now, pending.user_id, tokenHash).run();
  } catch (error) {
    await env.LIBRARY_DB.prepare('DELETE FROM identity_password_tokens WHERE token_hash=?1').bind(tokenHash).run();
    return json({ error: 'We could not send the verification email. Please try again.' }, 503, noStoreHeaders());
  }
  return json({
    message: ACCOUNT_CREATED_MESSAGE,
    detail: "We've sent you a new verification link. Open that email and click VERIFY MY EMAIL to finish setting up your account and begin your ritual.",
  }, 202, noStoreHeaders());
}

async function getCheckoutContext(request, env) {
  const context = await readCheckoutContext(request, env);
  if (!context) return json({ error: 'No verified checkout is available.' }, 401, noStoreHeaders());
  const account = await passwordAccount(context.email, env);
  return json({ email: context.email, hasPassword: Boolean(account?.password_hash), destinationPath: context.destinationPath }, 200, noStoreHeaders());
}

async function consumeMagicLink(request, env) {
  const url = new URL(request.url);
  const rawToken = url.searchParams.get('token') || '';
  const loginUrl = new URL('/library/login/', appOrigin(env));
  if (!rawToken) return Response.redirect(loginUrl, 302);

  const tokenHash = await sha256(rawToken);
  const now = unixTime();
  const link = await env.LIBRARY_DB.prepare(
    `SELECT customer_email, product_id, destination_path, expires_at, consumed_at
     FROM magic_links WHERE token_hash = ?1`,
  ).bind(tokenHash).first();

  if (!link || link.consumed_at !== null || Number(link.expires_at) < now) {
    const activeSession = link ? await authenticate(request, env, false) : null;
    const requestedPath = link?.destination_path || url.searchParams.get('next');
    const recoveryDestination = await resolveRecoveryDestination(requestedPath, env);
    if (activeSession && link && activeSession.email === link.customer_email) {
      const destination = await resolveStoredDestination(link, env, url.searchParams.get('companion'));
      if (destination) return noStoreRedirect(new URL(destination, appOrigin(env)), 302);
    }
    loginUrl.searchParams.set('status', 'invalid');
    if (recoveryDestination) loginUrl.searchParams.set('next', recoveryDestination);
    return noStoreRedirect(loginUrl, 302);
  }

  const destination = await resolveStoredDestination(link, env, url.searchParams.get('companion'));
  if (!destination) {
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
  await verifiedAccount(link.customer_email, env);
  await env.LIBRARY_DB.prepare(
    `INSERT INTO sessions
      (token_hash, customer_email, created_at, expires_at, last_seen_at, revoked_at, auth_method)
     VALUES (?1, ?2, ?3, ?4, ?3, NULL, 'email_magic_link')`,
  ).bind(sessionHash, link.customer_email, now, now + SESSION_TTL_SECONDS).run();

  const response = noStoreRedirect(new URL(destination, appOrigin(env)), 302);
  response.headers.append('Set-Cookie', sessionCookie(sessionToken, SESSION_TTL_SECONDS));
  return response;
}

async function getFireConversionReceipt(request, env) {
  const headers = { ...noStoreHeaders(), 'Set-Cookie': 'tf_pinterest_receipt=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax' };
  if (getCookie(request, 'tf_pinterest_consent') !== 'accepted' || isTestMode(env)) return json({}, 200, headers);
  const receipt = getCookie(request, 'tf_pinterest_receipt') || '';
  const [id, proof] = receipt.split('.');
  if (!id?.startsWith('cs_live_') || !proof
      || !constantTimeEqual(proof, await keyedHash(`pinterest-receipt:${id}`, env.TOKEN_PEPPER))) return json({}, 200, headers);
  const purchase = await env.LIBRARY_DB.prepare(`SELECT amount_total,currency FROM purchases
    WHERE stripe_checkout_session_id=?1 AND product_id=?2 AND payment_status='paid'`)
    .bind(id,STEP_INTO_YOUR_FIRE_PRODUCT_ID).first();
  // FIRE is denominated in USD. Do not guess minor-unit conversion for other currencies.
  if (!purchase || purchase.currency?.toLowerCase() !== 'usd') return json({}, 200, headers);
  const eventId = await sha256(`pinterest-fire:${id}`);
  return json({event_id:eventId,order_id:eventId,value:purchase.amount_total/100,currency:'USD',order_quantity:1,
    line_items:[{product_id:'step-into-your-fire',product_name:'Step Into Your Fire',product_price:purchase.amount_total/100,product_quantity:1}]},200,headers);
}

async function getFireAnalyticsReceipt(request, env) {
  const headers = { ...noStoreHeaders(), 'Set-Cookie': 'tf_analytics_receipt=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax' };
  if (isTestMode(env)) return json({}, 200, headers);
  const receipt = getCookie(request, 'tf_analytics_receipt') || '';
  const [id, proof] = receipt.split('.');
  if (!id?.startsWith('cs_live_') || !proof
      || !constantTimeEqual(proof, await keyedHash(`analytics-receipt:${id}`, env.TOKEN_PEPPER))) {
    return json({}, 200, headers);
  }
  const purchase = await env.LIBRARY_DB.prepare(`SELECT customer_email,amount_total,currency FROM purchases
    WHERE stripe_checkout_session_id=?1 AND product_id=?2 AND payment_status='paid'`)
    .bind(id, STEP_INTO_YOUR_FIRE_PRODUCT_ID).first();
  if (!purchase || isRecognizedQaEmail(purchase.customer_email, env)
      || !Number.isFinite(Number(purchase.amount_total))) return json({}, 200, headers);
  const currency = String(purchase.currency || '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return json({}, 200, headers);
  const transactionId = await sha256(`ga4-fire:${id}`);
  return json({
    transaction_id: transactionId,
    value: Number(purchase.amount_total) / 100,
    currency,
    items: [{ item_id: 'step-into-your-fire', item_name: 'Step Into Your Fire', price: Number(purchase.amount_total) / 100, quantity: 1 }],
  }, 200, headers);
}

function isRecognizedQaEmail(value, env) {
  const email = normalizeEmail(value);
  const owner = workbenchOwnerEmail(env);
  return Boolean(email) && (email === owner
    || /\+(?:tf-prod-verify|gyr-verify|tarotflower-qa|cleanup|leadtest|smtp-test|codex-send)[^@]*@/i.test(email)
    || /^codex-[^@]*@/i.test(email)
    || /@(example\.test|example\.com|web-library\.net)$/i.test(email));
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

  const now = unixTime();
  const claimed = await env.LIBRARY_DB.prepare(
    `UPDATE purchases
     SET access_claimed_at = ?2
     WHERE stripe_checkout_session_id = ?1 AND access_claimed_at IS NULL`,
  ).bind(sessionId, now).run();

  if (Number(claimed.meta?.changes || 0) !== 1) {
    const activeSession = await authenticate(request, env, false);
    if (activeSession?.email === fulfillment.email) {
      return noStoreRedirect(new URL(fulfillment.experiencePath, appOrigin(env)), 302);
    }
    const account = await passwordAccount(fulfillment.email, env);
    loginUrl.searchParams.set('status', account?.password_hash ? 'purchase' : 'setup');
    loginUrl.searchParams.set('next', fulfillment.experiencePath);
    const response = noStoreRedirect(
      account?.password_hash ? loginUrl : new URL('/library/setup/?status=request', appOrigin(env)),
      302,
    );
    response.headers.append('Set-Cookie', await checkoutContextCookie(fulfillment.email, fulfillment.experiencePath, env));
    return response;
  }

  const activeSession = await authenticate(request, env, false);
  if (activeSession?.email === fulfillment.email) {
    return withPurchaseCompletionBridge(
      noStoreRedirect(new URL(fulfillment.experiencePath, appOrigin(env)), 302),
      request,
      sessionId,
      env,
    );
  }

  const account = await passwordAccount(fulfillment.email, env);
  let destination;
  if (account?.password_hash) {
    destination = new URL('/library/login/', appOrigin(env));
    destination.searchParams.set('status', 'purchase');
    destination.searchParams.set('next', fulfillment.experiencePath);
  } else {
    destination = new URL('/library/setup/?status=request', appOrigin(env));
  }
  const response = noStoreRedirect(destination, 302);
  response.headers.append('Set-Cookie', await checkoutContextCookie(fulfillment.email, fulfillment.experiencePath, env));
  return withPurchaseCompletionBridge(response, request, sessionId, env);
}

async function withPurchaseCompletionBridge(response, request, sessionId, env) {
  if (isTestMode(env)) return response;
  const destination = new URL(response.headers.get('Location') || '/', appOrigin(env));
  if (destination.origin !== appOrigin(env) || !destination.pathname.startsWith('/library/')) return response;
  const bridge = new URL('/fire-purchase-complete/', appOrigin(env));
  bridge.searchParams.set('next', `${destination.pathname}${destination.search}${destination.hash}`);
  response.headers.set('Location', bridge.toString());
  const analyticsProof = await keyedHash(`analytics-receipt:${sessionId}`, env.TOKEN_PEPPER);
  response.headers.append('Set-Cookie', `tf_analytics_receipt=${sessionId}.${analyticsProof}; Max-Age=600; Path=/; Secure; HttpOnly; SameSite=Lax`);
  if (getCookie(request, 'tf_pinterest_consent') === 'accepted') {
    const pinterestProof = await keyedHash(`pinterest-receipt:${sessionId}`, env.TOKEN_PEPPER);
    response.headers.append('Set-Cookie', `tf_pinterest_receipt=${sessionId}.${pinterestProof}; Max-Age=600; Path=/; Secure; HttpOnly; SameSite=Lax`);
  }
  return response;
}

async function serveProtectedExperience(request, env) {
  const session = await authenticate(request, env, false);
  if (!session) {
    return noStoreRedirect(new URL('/library/login/', appOrigin(env)), 302);
  }

  const url = new URL(request.url);
  if (url.pathname === LEGACY_STEP_INTO_FIRE_PATH) {
    const legacyEntitlement = await env.LIBRARY_DB.prepare(
      `SELECT p.experience_path
       FROM products p
       JOIN entitlements e ON e.product_id = p.id
       WHERE p.id = ?1
         AND e.customer_email = ?2
         AND e.revoked_at IS NULL
         AND p.active = 1
       LIMIT 1`,
    ).bind(STEP_INTO_YOUR_FIRE_PRODUCT_ID, session.email).first();

    if (!legacyEntitlement) {
      return noStoreRedirect(new URL('/library/', appOrigin(env)), 302);
    }
    return noStoreRedirect(new URL(legacyEntitlement.experience_path, appOrigin(env)), 302);
  }

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

async function getProtectedFireVideo(request, env) {
  const session = await authenticate(request, env, false);
  if (!session) return json({ error: 'Unauthorized' }, 401, noStoreHeaders());

  const entitlement = await env.LIBRARY_DB.prepare(
    `SELECT 1
     FROM entitlements e
     JOIN products p ON p.id = e.product_id
     WHERE p.id = ?1
       AND e.customer_email = ?2
       AND e.revoked_at IS NULL
       AND p.active = 1
     LIMIT 1`,
  ).bind(STEP_INTO_YOUR_FIRE_PRODUCT_ID, session.email).first();
  if (!entitlement) return json({ error: 'Not found' }, 404, noStoreHeaders());

  if (!env.STREAM || !env.FIRE_STREAM_VIDEO_ID || !env.FIRE_STREAM_CUSTOMER_CODE) {
    return json({ error: 'The ritual video is temporarily unavailable.' }, 503, noStoreHeaders());
  }

  const token = await env.STREAM.video(env.FIRE_STREAM_VIDEO_ID).generateToken();
  const code = String(env.FIRE_STREAM_CUSTOMER_CODE).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!code) return json({ error: 'The ritual video is temporarily unavailable.' }, 503, noStoreHeaders());
  const embedUrl = `https://customer-${code}.cloudflarestream.com/${token}/iframe?preload=metadata`;
  return json({ embedUrl }, 200, noStoreHeaders());
}

async function logout(request, env, redirectPath = '') {
  const rawToken = getCookie(request, SESSION_COOKIE);
  if (rawToken) {
    await env.LIBRARY_DB.prepare(
      'UPDATE sessions SET revoked_at = ?2 WHERE token_hash = ?1 AND revoked_at IS NULL',
    ).bind(await sha256(rawToken), unixTime()).run();
  }
  const response = redirectPath
    ? noStoreRedirect(new URL(redirectPath, appOrigin(env)), 303)
    : json({ ok: true }, 200, noStoreHeaders());
  response.headers.append('Set-Cookie', clearSessionCookie());
  if (env.CIRCLE_ORIGIN) response.headers.append('Set-Cookie', await revokeSharedIdentity(request, env));
  return response;
}

async function serveProtectedFile(request, env) {
  const session = await authenticate(request, env, false);
  if (!session) return new Response('Unauthorized', { status: 401, headers: noStoreHeaders() });

  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length !== 5) return new Response('Not found', { status: 404 });
  const requestedProductSlug = decodeURIComponent(parts[3]);
  const productSlug = requestedProductSlug === LEGACY_STEP_INTO_FIRE_SLUG
    ? STEP_INTO_YOUR_FIRE_SLUG
    : requestedProductSlug;
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
  const supported = event.type === 'checkout.session.completed'
    || event.type === 'checkout.session.async_payment_succeeded';
  if (existing) {
    if (supported) {
      let duplicateSession = event.data?.object;
      if (duplicateSession?.id && !duplicateSession.line_items?.data?.length) {
        duplicateSession = await retrieveStripeSession(duplicateSession.id, env);
      }
      if (duplicateSession?.id) await fulfillStripeSession(duplicateSession, event, env);
    }
    return json({ received: true, duplicate: true });
  }

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
    `SELECT id, title, experience_path FROM products
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

  await ensurePurchaseAccessEmail(
    session.id,
    email,
    product.id,
    product.title,
    product.experience_path,
    env,
  );

  return { granted: true, email, productId: product.id, experiencePath: product.experience_path };
}

async function ensurePurchaseAccessEmail(checkoutSessionId, email, productId, productTitle, experiencePath, env) {
  const now = unixTime();
  await env.LIBRARY_DB.prepare(
    `INSERT OR IGNORE INTO purchase_access_emails
      (stripe_checkout_session_id, customer_email, created_at, claimed_at, sent_at,
       failed_at, attempts, last_error)
     VALUES (?1, ?2, ?3, NULL, NULL, NULL, 0, NULL)`,
  ).bind(checkoutSessionId, email, now).run();

  const claimed = await env.LIBRARY_DB.prepare(
    `UPDATE purchase_access_emails
     SET claimed_at = ?2, attempts = attempts + 1, last_error = NULL
     WHERE stripe_checkout_session_id = ?1
       AND sent_at IS NULL
       AND (claimed_at IS NULL OR claimed_at < ?3)`,
  ).bind(checkoutSessionId, now, now - PURCHASE_EMAIL_CLAIM_TTL_SECONDS).run();

  if (Number(claimed.meta?.changes || 0) !== 1) return;

  try {
    await sendPurchaseAccessEmail(email, productTitle, env);
    await env.LIBRARY_DB.prepare(
      `UPDATE purchase_access_emails
       SET sent_at = ?2, claimed_at = NULL, failed_at = NULL, last_error = NULL
       WHERE stripe_checkout_session_id = ?1`,
    ).bind(checkoutSessionId, unixTime()).run();
  } catch (error) {
    const message = String(error?.message || error || 'Unknown email error').slice(0, 500);
    await env.LIBRARY_DB.prepare(
      `UPDATE purchase_access_emails
       SET claimed_at = NULL, failed_at = ?2, last_error = ?3
       WHERE stripe_checkout_session_id = ?1`,
    ).bind(checkoutSessionId, unixTime(), message).run();
    console.error('Purchase-access email failed', error);
  }
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
  if (env.CIRCLE_ORIGIN) {
    const identity = await sharedIdentity(request, env);
    if (identity) return { email: identity.email, tokenHash: identity.token_hash };
  }
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
      subject: 'Your Tarot Flower Ritual Library ✨',
      magicLink: link,
      expiresInMinutes: 15,
    }),
  });
  if (!response.ok) throw new Error(`Email service rejected the message (${response.status})`);
}

async function sendPurchaseAccessEmail(email, productTitle, env) {
  if (!env.EMAIL_SERVICE?.fetch) throw new Error('EMAIL_SERVICE binding is not configured');
  const response = await env.EMAIL_SERVICE.fetch('https://email.internal/api/library-purchase-access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: email,
      subject: 'Your FIRE Ritual is ready 🔥',
      productTitle,
      libraryUrl: `${appOrigin(env)}/library/`,
    }),
  });
  if (!response.ok) throw new Error(`Email service rejected the message (${response.status})`);
}

async function issueLibraryPasswordLink(email, purpose, destinationPath, env) {
  const account = await passwordAccount(email, env);
  const entitlement = await env.LIBRARY_DB.prepare(
    'SELECT 1 FROM entitlements WHERE customer_email=?1 AND revoked_at IS NULL LIMIT 1',
  ).bind(email).first();
  if (!entitlement || (purpose === 'setup' ? account?.password_hash : !account?.password_hash)) return false;

  const user = await ensureCustomerIdentity(email, env);
  const rawToken = randomToken();
  const tokenHash = await sha256(rawToken);
  const time = unixTime();
  await env.LIBRARY_DB.prepare(
    `INSERT INTO identity_password_tokens(token_hash,user_id,purpose,credential_version,created_at,expires_at,consumed_at)
     VALUES (?1,?2,?3,?4,?5,?6,NULL)`,
  ).bind(tokenHash, user.user_id, purpose, Number(account?.version || 0), time, time + PASSWORD_LINK_TTL_SECONDS).run();

  const link = new URL(purpose === 'reset' ? '/library/forgot/' : '/library/setup/', appOrigin(env));
  link.searchParams.set('token', rawToken);
  link.searchParams.set('mode', purpose);
  const destination = await resolveRequestedDestination(email, destinationPath, env);
  if (destination.path !== '/library/') link.searchParams.set('next', destination.path);
  try {
    await sendLibraryPasswordLink(email, purpose, link.toString(), env);
    return true;
  } catch (error) {
    await env.LIBRARY_DB.prepare('DELETE FROM identity_password_tokens WHERE token_hash=?1').bind(tokenHash).run();
    throw error;
  }
}

async function issueWorkbenchPasswordLink(email, env) {
  let account = await passwordAccount(email, env);
  if (!account) {
    const now = unixTime();
    await env.LIBRARY_DB.prepare(
      `INSERT OR IGNORE INTO customers(email,user_id,email_verified_at,created_at,updated_at)
       VALUES (?1,?2,NULL,?3,?3)`,
    ).bind(email, crypto.randomUUID(), now).run();
    account = await passwordAccount(email, env);
  }
  if (!account?.user_id) {
    await ensureCustomerIdentity(email, env);
    account = await passwordAccount(email, env);
  }
  if (!account?.user_id) return false;

  const rawToken = randomToken();
  const tokenHash = await sha256(rawToken);
  const time = unixTime();
  await env.LIBRARY_DB.prepare(
    `INSERT INTO identity_password_tokens(token_hash,user_id,purpose,credential_version,created_at,expires_at,consumed_at)
     VALUES (?1,?2,'reset',?3,?4,?5,NULL)`,
  ).bind(tokenHash, account.user_id, Number(account.version || 0), time, time + PASSWORD_LINK_TTL_SECONDS).run();

  const link = new URL('/workbench/forgot/', appOrigin(env));
  link.searchParams.set('token', rawToken);
  link.searchParams.set('mode', 'reset');
  try {
    await sendLibraryPasswordLink(email, 'reset', link.toString(), env);
    return true;
  } catch (error) {
    await env.LIBRARY_DB.prepare('DELETE FROM identity_password_tokens WHERE token_hash=?1').bind(tokenHash).run();
    throw error;
  }
}

async function commitPasswordChange(proof, password, redirectPath, env, ctx, clearCheckoutContext) {
  const encoded = hashPassword(password);
  const time = unixTime();
  const gate = `EXISTS (SELECT 1 FROM identity_passwords p JOIN identity_password_tokens t ON t.token_hash=p.change_token_hash
    WHERE p.user_id=?3 AND p.change_token_hash=?4 AND t.consumed_at IS NULL)`;
  const statements = [
    env.LIBRARY_DB.prepare(`INSERT INTO identity_passwords(user_id,password_hash,version,created_at,changed_at,change_token_hash)
      SELECT t.user_id,?1,t.credential_version+1,?2,?2,t.token_hash FROM identity_password_tokens t
      LEFT JOIN identity_passwords p ON p.user_id=t.user_id
      WHERE t.token_hash=?3 AND t.consumed_at IS NULL AND t.expires_at>?2 AND t.credential_version=COALESCE(p.version,0)
      ON CONFLICT(user_id) DO UPDATE SET password_hash=excluded.password_hash,version=excluded.version,
      changed_at=excluded.changed_at,change_token_hash=excluded.change_token_hash WHERE identity_passwords.version=excluded.version-1`)
      .bind(encoded, time, proof.token_hash),
    env.LIBRARY_DB.prepare(`UPDATE customers SET email_verified_at=COALESCE(email_verified_at,?1),updated_at=?1
      WHERE user_id=?2 AND ${gate}`).bind(time, proof.user_id, proof.user_id, proof.token_hash),
    env.LIBRARY_DB.prepare(`UPDATE sessions SET revoked_at=?1 WHERE customer_email=?2 AND revoked_at IS NULL AND ${gate}`)
      .bind(time, proof.email, proof.user_id, proof.token_hash),
    env.LIBRARY_DB.prepare(`UPDATE identity_password_tokens SET consumed_at=?1 WHERE user_id=?2 AND consumed_at IS NULL AND ${gate}`)
      .bind(time, proof.user_id, proof.user_id, proof.token_hash),
  ];
  if (env.CIRCLE_ORIGIN) statements.splice(2, 0,
    env.LIBRARY_DB.prepare(`UPDATE circle_sessions SET revoked_at=?1 WHERE user_id=?2 AND revoked_at IS NULL AND ${gate}`)
      .bind(time, proof.user_id, proof.user_id, proof.token_hash));
  const result = await env.LIBRARY_DB.batch(statements);
  if (Number(result[0].meta?.changes || 0) !== 1) {
    return json({ error: 'This link has expired or has already been used. Please request a new one.' }, 400, noStoreHeaders());
  }

  const response = json({ ok: true, redirect: redirectPath }, 200, noStoreHeaders());
  response.headers.append('Set-Cookie', await createLibrarySession(proof.email, 'password', env));
  if (clearCheckoutContext) response.headers.append('Set-Cookie', clearCheckoutContextCookie());
  const passwordContext = redirectPath === '/workbench/' ? 'workbench' : 'library';
  ctx.waitUntil(sendLibraryPasswordChanged(proof.email, env, passwordContext)
    .catch(() => console.error('Library password-change notification failed')));
  return response;
}

async function sendLibraryPasswordLink(email, purpose, passwordLink, env) {
  if (!env.EMAIL_SERVICE?.fetch) throw new Error('EMAIL_SERVICE binding is not configured');
  const response = await env.EMAIL_SERVICE.fetch('https://email.internal/api/library-password-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: email, purpose, passwordLink, expiresInMinutes: PASSWORD_LINK_TTL_SECONDS / 60 }),
  });
  if (!response.ok) throw new Error(`Email service rejected the password message (${response.status})`);
}

async function sendLibraryAccountVerification(email, verificationLink, env) {
  if (!env.EMAIL_SERVICE?.fetch) throw new Error('EMAIL_SERVICE binding is not configured');
  const response = await env.EMAIL_SERVICE.fetch('https://email.internal/api/library-account-verification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: email, verificationLink, expiresInHours: ACCOUNT_VERIFICATION_TTL_SECONDS / 3600 }),
  });
  if (!response.ok) throw new Error(`Email service rejected the verification message (${response.status})`);
}

async function sendLibraryPasswordChanged(email, env, context = 'library') {
  if (!env.EMAIL_SERVICE?.fetch || isTestMode(env)) return;
  const response = await env.EMAIL_SERVICE.fetch('https://email.internal/api/library-password-changed', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: email, context }),
  });
  if (!response.ok) throw new Error(`Email service rejected the password notification (${response.status})`);
}

async function passwordAccount(email, env) {
  return env.LIBRARY_DB.prepare(`SELECT c.user_id,c.email,c.email_verified_at,p.password_hash,p.version
    FROM customers c LEFT JOIN identity_passwords p ON p.user_id=c.user_id WHERE c.email=?1`).bind(email).first();
}

async function ensureCustomerIdentity(email, env) {
  let account = await env.LIBRARY_DB.prepare('SELECT user_id,email FROM customers WHERE email=?1').bind(email).first();
  if (!account) return null;
  if (!account.user_id) {
    await env.LIBRARY_DB.prepare('UPDATE customers SET user_id=?1,updated_at=?2 WHERE email=?3 AND user_id IS NULL')
      .bind(crypto.randomUUID(), unixTime(), email).run();
    account = await env.LIBRARY_DB.prepare('SELECT user_id,email FROM customers WHERE email=?1').bind(email).first();
  }
  return account;
}

async function libraryPasswordProof(rawToken, env) {
  if (typeof rawToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(rawToken)) return null;
  return env.LIBRARY_DB.prepare(`SELECT t.token_hash,t.user_id,t.purpose,t.credential_version,c.email
    FROM identity_password_tokens t JOIN customers c ON c.user_id=t.user_id
    LEFT JOIN identity_passwords p ON p.user_id=t.user_id
    WHERE t.token_hash=?1 AND t.consumed_at IS NULL AND t.expires_at>?2
      AND t.credential_version=COALESCE(p.version,0)`)
    .bind(await sha256(rawToken), unixTime()).first();
}

async function createLibrarySession(email, authMethod, env) {
  const rawToken = randomToken();
  const time = unixTime();
  await env.LIBRARY_DB.prepare(`INSERT INTO sessions
    (token_hash,customer_email,created_at,expires_at,last_seen_at,revoked_at,auth_method)
    VALUES (?1,?2,?3,?4,?3,NULL,?5)`)
    .bind(await sha256(rawToken), email, time, time + SESSION_TTL_SECONDS, authMethod).run();
  return sessionCookie(rawToken, SESSION_TTL_SECONDS);
}

async function resolveRequestedDestination(email, requestedPath, env) {
  if (typeof requestedPath !== 'string' || !requestedPath.startsWith('/library/rituals/')) {
    return { productId: null, path: '/library/' };
  }
  const product = await env.LIBRARY_DB.prepare(
    `SELECT p.id, p.experience_path
     FROM products p
     JOIN entitlements e ON e.product_id = p.id
     WHERE p.experience_path = ?1
       AND e.customer_email = ?2
       AND e.revoked_at IS NULL
       AND p.active = 1
     LIMIT 1`,
  ).bind(requestedPath, email).first();
  return product
    ? { productId: product.id, path: product.experience_path }
    : { productId: null, path: '/library/' };
}

async function resolveRegistrationDestination(email, requestedPath, env) {
  const requested = await resolveRequestedDestination(email, requestedPath, env);
  if (requested.path !== '/library/') return requested;
  const product = await env.LIBRARY_DB.prepare(
    `SELECT p.id,p.experience_path FROM products p
     JOIN entitlements e ON e.product_id=p.id
     WHERE e.customer_email=?1 AND e.revoked_at IS NULL AND p.active=1
     ORDER BY e.granted_at DESC LIMIT 1`,
  ).bind(email).first();
  return product ? { productId: product.id, path: product.experience_path } : requested;
}

async function resolveStoredDestination(link, env, companionId = null) {
  if (!link.product_id) return '/library/';
  const product = await env.LIBRARY_DB.prepare(
    `SELECT p.experience_path, p.assets_json, p.slug
     FROM products p
     JOIN entitlements e ON e.product_id = p.id
     WHERE p.id = ?1
       AND p.experience_path = ?2
       AND e.customer_email = ?3
       AND e.revoked_at IS NULL
       AND p.active = 1
     LIMIT 1`,
  ).bind(link.product_id, link.destination_path, link.customer_email).first();
  if (product && companionId && companionId === env.FIRE_COMPANION_ASSET_ID && product.slug === STEP_INTO_YOUR_FIRE_SLUG) {
    const asset = JSON.parse(product.assets_json || '[]').find(a => a.id === companionId && a.kind === 'pdf');
    if (asset) return `/api/library/files/${product.slug}/${encodeURIComponent(asset.id)}?download=1`;
  }
  return product?.experience_path || null;
}

async function resolveRecoveryDestination(requestedPath, env) {
  if (typeof requestedPath !== 'string' || !requestedPath.startsWith('/library/rituals/')) return null;
  const product = await env.LIBRARY_DB.prepare(
    `SELECT experience_path FROM products
     WHERE experience_path = ?1 AND active = 1
     LIMIT 1`,
  ).bind(requestedPath).first();
  return product?.experience_path || null;
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

function base64UrlText(value) {
  return base64Url(new TextEncoder().encode(value));
}

function decodeBase64UrlText(value) {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
  } catch {
    return '';
  }
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

async function checkoutContextCookie(email, destinationPath, env) {
  const payload = base64UrlText(JSON.stringify({ email, destinationPath, expiresAt: unixTime() + 30 * 60 }));
  const signature = await keyedHash(`checkout-context:${payload}`, env.TOKEN_PEPPER);
  return `${CHECKOUT_CONTEXT_COOKIE}=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=1800`;
}

function clearCheckoutContextCookie() {
  return `${CHECKOUT_CONTEXT_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

async function readCheckoutContext(request, env) {
  const raw = getCookie(request, CHECKOUT_CONTEXT_COOKIE);
  const separator = raw.lastIndexOf('.');
  if (separator < 1) return null;
  const payload = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);
  const expected = await keyedHash(`checkout-context:${payload}`, env.TOKEN_PEPPER);
  if (!constantTimeEqual(signature, expected)) return null;
  try {
    const context = JSON.parse(decodeBase64UrlText(payload));
    if (!isValidEmail(normalizeEmail(context.email)) || Number(context.expiresAt) < unixTime()) return null;
    const destination = await resolveRequestedDestination(normalizeEmail(context.email), context.destinationPath, env);
    return { email: normalizeEmail(context.email), destinationPath: destination.path };
  } catch {
    return null;
  }
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

function workbenchSecurityHeaders() {
  return {
    ...noStoreHeaders(),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
  };
}

function workbenchOwnerEmail(env) {
  return normalizeEmail(env.WORKBENCH_OWNER_EMAIL || env.CIRCLE_OWNER_EMAIL);
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
