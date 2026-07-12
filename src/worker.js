var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/worker.js
var RECIPIENT = "vanessa@tarotflower.com";
var DEFAULT_FROM = "contact@tarotflower.com";
var MAX_BODY_BYTES = 32 * 1024;
var MAX_MESSAGE_CHARS = 5e3;
var MAX_TURNSTILE_TOKEN_CHARS = 2048;
var MAX_FIRST_NAME_CHARS = 80;
var MAX_SOURCE_PATH_CHARS = 240;
var GUIDE_DOWNLOAD_TOKEN_TTL_SECONDS = 15 * 60;
var GUIDE_EMAIL_DOWNLOAD_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
var EXPECTED_CONTACT_TURNSTILE_ACTION = "contact";
var EXPECTED_LEAD_MAGNET_TURNSTILE_ACTION = "lead_magnet_goddess_guide";
var GODDESS_GUIDE_LEAD_MAGNET_SLUG = "goddess-embodiment-guide";
var GODDESS_GUIDE_TAG = `lead:${GODDESS_GUIDE_LEAD_MAGNET_SLUG}`;
var GODDESS_GUIDE_SEQUENCE_SLUG = "goddess-guide-welcome";
var GODDESS_GUIDE_FULFILLMENT_STEP_SLUG = "guide-fulfillment";
var GODDESS_GUIDE_R2_KEY = "lead-magnets/goddess-embodiment-guide/goddess-embodiment-guide.pdf";
var GODDESS_GUIDE_DOWNLOAD_PATH = "/api/lead-magnet/goddess-embodiment-guide/download";
var UNSUBSCRIBE_PATH = "/api/email/unsubscribe";
var GODDESS_GUIDE_CONSENT_TEXT = "I agree to receive the Goddess Embodiment Guide and occasional Tarot Flower emails. I understand I can unsubscribe at any time.";
var DEFAULT_ALLOWED_HOSTNAMES = "tarotflower.com,www.tarotflower.com";
var TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/contact/config" && request.method === "GET") {
      return contactConfig(request, env);
    }
    if (url.pathname === "/api/contact") {
      return handleContact(request, env);
    }
    if (url.pathname === "/api/lead-magnet") {
      return handleLeadMagnet(request, env);
    }
    if (url.pathname === GODDESS_GUIDE_DOWNLOAD_PATH) {
      return handleGoddessGuideDownload(request, env);
    }
    if (url.pathname === "/api/campaign/dev/send-step") {
      return handleDevSendCampaignStep(request, env);
    }
    if (url.pathname === "/api/campaign/send-step") {
      return handleManualSendCampaignStep(request, env);
    }
    if (url.pathname === "/api/admin/campaign/review") {
      return handleCampaignReview(request, env);
    }
    if (url.pathname === UNSUBSCRIBE_PATH) {
      return handleUnsubscribe(request, env);
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(processDueCampaignDeliveries(env));
  }
};
async function handleContact(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: securityHeaders() });
  }
  if (request.method !== "POST") {
    return respond(request, { ok: false, error: "Method not allowed" }, 405);
  }
  try {
    const length = Number(request.headers.get("content-length") || "0");
    if (length > MAX_BODY_BYTES) {
      return respond(request, { ok: false, error: "Your message is too large." }, 413);
    }
    const originError = validateOrigin(request, env);
    if (originError) {
      return respond(request, { ok: false, error: originError }, 403);
    }
    const form = await readSubmission(request);
    const spamError = await validateSpamControls(form, request, env);
    if (spamError) {
      return respond(request, { ok: false, error: spamError }, 400);
    }
    const validation = validateContact(form);
    if (!validation.ok) {
      return respond(request, { ok: false, error: validation.error }, 400);
    }
    await sendContactEmail(env, validation.value, request);
    return respond(request, {
      ok: true,
      message: "Thank you. Your message has been sent.",
      redirect: "/contact/?sent=1"
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return respond(request, { ok: false, error: error.message }, error.status);
    }
    console.error("Contact form failed", error);
    return respond(request, { ok: false, error: "The message could not be sent. Please try again." }, 500);
  }
}
__name(handleContact, "handleContact");
async function handleLeadMagnet(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...securityHeaders(), ...corsHeaders(request) } });
  }
  if (request.method !== "POST") {
    return respond(request, { ok: false, error: "Method not allowed" }, 405);
  }
  try {
    const length = Number(request.headers.get("content-length") || "0");
    if (length > MAX_BODY_BYTES) {
      return respond(request, { ok: false, error: "Your submission is too large." }, 413);
    }
    const originError = validateOrigin(request, env);
    if (originError) {
      return respond(request, { ok: false, error: originError }, 403);
    }
    const form = await readSubmission(request);
    const spamError = await validateSpamControls(
      form,
      request,
      env,
      EXPECTED_LEAD_MAGNET_TURNSTILE_ACTION
    );
    if (spamError) {
      return respond(request, { ok: false, error: spamError }, 400);
    }
    const validation = validateLeadMagnet(form, request);
    if (!validation.ok) {
      return respond(request, { ok: false, error: validation.error }, 400);
    }
    const subscriberId = await saveLeadMagnetSubscriber(env, validation.value, request);
    await enrollGoddessGuideWelcomeSequence(env, subscriberId, validation.value);
    const downloadUrl = await createGuideDownloadUrl(request, env);
    return respond(request, {
      ok: true,
      message: "Thank you. Your email has been saved for the Goddess Embodiment Guide.",
      leadMagnet: GODDESS_GUIDE_LEAD_MAGNET_SLUG,
      downloadUrl,
      downloadExpiresIn: downloadUrl ? GUIDE_DOWNLOAD_TOKEN_TTL_SECONDS : 0
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return respond(request, { ok: false, error: error.message }, error.status);
    }
    console.error("Lead magnet capture failed", error);
    return respond(request, { ok: false, error: "Your email could not be saved. Please try again." }, 500);
  }
}
__name(handleLeadMagnet, "handleLeadMagnet");
async function handleGoddessGuideDownload(request, env) {
  if (request.method !== "GET") {
    return respond(request, { ok: false, error: "Method not allowed" }, 405);
  }
  const url = new URL(request.url);
  const token = clean(url.searchParams.get("token"));
  const validToken = await verifyGuideDownloadToken(token, env);
  if (!validToken) {
    return new Response("This guide download link has expired. Please request the guide again.", {
      status: 403,
      headers: { ...securityHeaders(), "content-type": "text/plain; charset=utf-8" }
    });
  }
  if (!env.GUIDE_ASSETS || typeof env.GUIDE_ASSETS.get !== "function") {
    return new Response("Guide downloads are not configured.", {
      status: 500,
      headers: { ...securityHeaders(), "content-type": "text/plain; charset=utf-8" }
    });
  }
  const object = await env.GUIDE_ASSETS.get(GODDESS_GUIDE_R2_KEY);
  if (!object) {
    return new Response("Guide file not found.", {
      status: 404,
      headers: { ...securityHeaders(), "content-type": "text/plain; charset=utf-8" }
    });
  }
  return new Response(object.body, {
    headers: {
      ...securityHeaders(),
      "cache-control": "private, no-store",
      "content-type": "application/pdf",
      "content-disposition": 'attachment; filename="Goddess Embodiment Guide.pdf"',
      "content-length": String(object.size)
    }
  });
}
__name(handleGoddessGuideDownload, "handleGoddessGuideDownload");
async function handleDevSendCampaignStep(request, env) {
  return handleCampaignSendStep(request, env, {
    tokenEnvName: "CAMPAIGN_DEV_SEND_TOKEN",
    devOnly: true
  });
}
__name(handleDevSendCampaignStep, "handleDevSendCampaignStep");
async function handleManualSendCampaignStep(request, env) {
  return handleCampaignSendStep(request, env, {
    tokenEnvName: "CAMPAIGN_SEND_TOKEN",
    devOnly: false
  });
}
__name(handleManualSendCampaignStep, "handleManualSendCampaignStep");
async function processDueCampaignDeliveries(env) {
  const due = await env.DB.prepare(`
    SELECT d.id AS delivery_id
    FROM subscriber_sequence_step_deliveries d
    JOIN subscribers s ON s.id = d.subscriber_id
    JOIN email_sequences seq ON seq.id = d.sequence_id
    JOIN email_sequence_steps step ON step.id = d.step_id
    WHERE d.status = 'pending'
      AND d.due_at <= ?
      AND s.status = 'active'
      AND seq.slug = ?
      AND step.slug = ?
    ORDER BY d.due_at ASC
    LIMIT 25
  `).bind(
    (/* @__PURE__ */ new Date()).toISOString(),
    GODDESS_GUIDE_SEQUENCE_SLUG,
    GODDESS_GUIDE_FULFILLMENT_STEP_SLUG
  ).all();
  for (const row of due.results || []) {
    const delivery = await findPendingCampaignDelivery(env, {
      deliveryId: row.delivery_id,
      email: "",
      subscriberId: "",
      stepSlug: GODDESS_GUIDE_FULFILLMENT_STEP_SLUG
    });
    if (!delivery || !await claimCampaignDelivery(env, delivery.delivery_id)) {
      continue;
    }
    try {
      await sendCampaignStepEmail(
        new Request("https://tarotflower-web-dev.embodiedgoddesses.workers.dev"),
        env,
        delivery
      );
    } catch (error) {
      console.error("Scheduled campaign fulfillment failed", error);
    }
  }
}
__name(processDueCampaignDeliveries, "processDueCampaignDeliveries");
async function handleCampaignSendStep(request, env, options) {
  if (request.method !== "POST") {
    return respond(request, { ok: false, error: "Method not allowed" }, 405);
  }
  if (options.devOnly && env.WORKER_ENV !== "dev") {
    return respond(request, { ok: false, error: "Not found" }, 404);
  }
  const authError = validateCampaignToken(request, env, options.tokenEnvName);
  if (authError) {
    return respond(request, { ok: false, error: authError }, authError === "Not configured." ? 500 : 403);
  }
  try {
    const body = await readJsonObject(request);
    const email = clean(body.email).toLowerCase();
    const deliveryId = clean(body.delivery_id || body.deliveryId);
    const subscriberId = clean(body.subscriber_id || body.subscriberId);
    const stepSlug = clean(body.step_slug || body.stepSlug) || GODDESS_GUIDE_FULFILLMENT_STEP_SLUG;
    if (!deliveryId && !email && !subscriberId) {
      return respond(request, { ok: false, error: "Provide delivery_id, email, or subscriber_id." }, 400);
    }
    if (email && !isValidEmail(email)) {
      return respond(request, { ok: false, error: "Please provide a valid email." }, 400);
    }
    const delivery = await findPendingCampaignDelivery(env, { deliveryId, email, subscriberId, stepSlug });
    if (!delivery) {
      return respond(request, { ok: false, error: "No pending delivery found." }, 404);
    }
    const claimed = await claimCampaignDelivery(env, delivery.delivery_id);
    if (!claimed) {
      return respond(request, {
        ok: false,
        error: "This delivery is no longer pending."
      }, 409);
    }
    const result = await sendCampaignStepEmail(request, env, delivery);
    return respond(request, {
      ok: true,
      message: "Campaign step email sent.",
      deliveryId: result.deliveryId,
      subscriberId: result.subscriberId,
      stepSlug: result.stepSlug,
      subject: result.subject
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return respond(request, { ok: false, error: error.message }, error.status);
    }
    console.error("Campaign send failed", error);
    return respond(request, { ok: false, error: "The campaign email could not be sent." }, 500);
  }
}
__name(handleCampaignSendStep, "handleCampaignSendStep");
async function handleCampaignReview(request, env) {
  if (request.method !== "GET") {
    return respond(request, { ok: false, error: "Method not allowed" }, 405);
  }
  const authError = validateCampaignToken(request, env, "ADMIN_REVIEW_TOKEN");
  if (authError) {
    return respond(request, { ok: false, error: "Unauthorized." }, 403);
  }
  const url = new URL(request.url);
  const email = clean(url.searchParams.get("email")).toLowerCase();
  if (email && !isValidEmail(email)) {
    return new Response(campaignReviewPage({
      error: "Please provide a valid email address for subscriber search."
    }), {
      status: 400,
      headers: { ...securityHeaders(), "content-type": "text/html; charset=utf-8" }
    });
  }
  const data = await loadCampaignReviewData(env, email);
  return new Response(campaignReviewPage(data), {
    headers: { ...securityHeaders(), "content-type": "text/html; charset=utf-8" }
  });
}
__name(handleCampaignReview, "handleCampaignReview");
async function handleUnsubscribe(request, env) {
  const url = new URL(request.url);
  const token = clean(url.searchParams.get("token"));
  if (request.method === "GET") {
    const subscriber2 = token ? await findSubscriberByUnsubscribeToken(env, token) : null;
    return new Response(subscriber2 ? unsubscribePage(token, subscriber2) : invalidUnsubscribePage(), {
      headers: { ...securityHeaders(), "content-type": "text/html; charset=utf-8" }
    });
  }
  if (request.method !== "POST") {
    return respond(request, { ok: false, error: "Method not allowed" }, 405);
  }
  const form = await readSubmission(request);
  const submittedToken = clean(form.get("token")) || token;
  if (!submittedToken) {
    return unsubscribeResponse(request, false, "This unsubscribe link is missing or invalid.", 400);
  }
  const subscriber = await findSubscriberByUnsubscribeToken(env, submittedToken);
  if (!subscriber) {
    return unsubscribeResponse(request, false, "This unsubscribe link is missing or invalid.", 400);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await env.DB.prepare(`
    UPDATE subscribers
    SET status = 'unsubscribed', unsubscribed_at = COALESCE(unsubscribed_at, ?), updated_at = ?
    WHERE id = ?
  `).bind(now, now, subscriber.id).run();
  const cancelResult = await env.DB.prepare(`
    UPDATE subscriber_sequence_step_deliveries
    SET status = 'canceled', updated_at = ?, last_error = 'Subscriber unsubscribed.'
    WHERE subscriber_id = ? AND status IN ('pending', 'sending')
  `).bind(now, subscriber.id).run();
  const canceledDeliveries = cancelResult.meta?.changes || 0;
  if (subscriber.status !== "unsubscribed" || canceledDeliveries > 0) {
    await recordSubscriberEvent(env, subscriber.id, "unsubscribed", {
      source: "unsubscribe_link",
      canceled_deliveries: canceledDeliveries
    });
  }
  return unsubscribeResponse(request, true, "You have been unsubscribed.", 200);
}
__name(handleUnsubscribe, "handleUnsubscribe");
async function loadCampaignReviewData(env, email) {
  const [
    subscribersByStatus,
    deliveriesByStatus,
    eventsByType,
    pendingGuideCount,
    pendingDeliveries,
    recentDeliveries,
    subscriber
  ] = await Promise.all([
    allRows(env.DB.prepare(`
      SELECT status, COUNT(*) AS count
      FROM subscribers
      GROUP BY status
      ORDER BY status
    `)),
    allRows(env.DB.prepare(`
      SELECT status, COUNT(*) AS count
      FROM subscriber_sequence_step_deliveries
      GROUP BY status
      ORDER BY status
    `)),
    allRows(env.DB.prepare(`
      SELECT event_type, COUNT(*) AS count
      FROM subscriber_events
      GROUP BY event_type
      ORDER BY event_type
    `)),
    env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM subscriber_sequence_step_deliveries d
      JOIN email_sequence_steps step ON step.id = d.step_id
      JOIN email_sequences seq ON seq.id = d.sequence_id
      WHERE d.status = 'pending'
        AND step.slug = ?
        AND seq.slug = ?
    `).bind(GODDESS_GUIDE_FULFILLMENT_STEP_SLUG, GODDESS_GUIDE_SEQUENCE_SLUG).first(),
    allRows(env.DB.prepare(`
      SELECT
        d.id AS delivery_id,
        s.email AS email,
        s.first_name AS first_name,
        seq.slug AS sequence_slug,
        step.slug AS step_slug,
        d.due_at AS due_at,
        d.attempts AS attempts,
        d.created_at AS created_at
      FROM subscriber_sequence_step_deliveries d
      JOIN subscribers s ON s.id = d.subscriber_id
      JOIN email_sequences seq ON seq.id = d.sequence_id
      JOIN email_sequence_steps step ON step.id = d.step_id
      WHERE d.status = 'pending'
      ORDER BY d.due_at ASC
      LIMIT 100
    `)),
    allRows(env.DB.prepare(`
      SELECT
        d.id AS delivery_id,
        s.email AS email,
        step.slug AS step_slug,
        d.status AS status,
        d.attempts AS attempts,
        d.sent_at AS sent_at,
        d.failed_at AS failed_at,
        d.updated_at AS updated_at,
        d.last_error AS last_error
      FROM subscriber_sequence_step_deliveries d
      JOIN subscribers s ON s.id = d.subscriber_id
      JOIN email_sequence_steps step ON step.id = d.step_id
      WHERE d.status IN ('sent', 'failed', 'canceled')
      ORDER BY d.updated_at DESC
      LIMIT 100
    `)),
    email ? env.DB.prepare(`
      SELECT id, email, first_name, status, unsubscribed_at, created_at, updated_at
      FROM subscribers
      WHERE email = ?
      LIMIT 1
    `).bind(email).first() : null
  ]);
  let subscriberDetails = null;
  if (subscriber) {
    const [
      consents,
      tags,
      enrollments,
      deliveries,
      events
    ] = await Promise.all([
      allRows(env.DB.prepare(`
        SELECT consent_text, source_path, lead_magnet_slug, consented_at
        FROM subscriber_consents
        WHERE subscriber_id = ?
        ORDER BY consented_at DESC
      `).bind(subscriber.id)),
      allRows(env.DB.prepare(`
        SELECT tag, created_at
        FROM subscriber_tags
        WHERE subscriber_id = ?
        ORDER BY created_at DESC
      `).bind(subscriber.id)),
      allRows(env.DB.prepare(`
        SELECT seq.slug AS sequence_slug, e.status, e.source_tag, e.enrolled_at
        FROM subscriber_sequence_enrollments e
        JOIN email_sequences seq ON seq.id = e.sequence_id
        WHERE e.subscriber_id = ?
        ORDER BY e.enrolled_at DESC
      `).bind(subscriber.id)),
      allRows(env.DB.prepare(`
        SELECT
          d.id AS delivery_id,
          seq.slug AS sequence_slug,
          step.slug AS step_slug,
          d.status,
          d.attempts,
          d.due_at,
          d.sent_at,
          d.failed_at,
          d.last_error,
          d.created_at,
          d.updated_at
        FROM subscriber_sequence_step_deliveries d
        JOIN email_sequences seq ON seq.id = d.sequence_id
        JOIN email_sequence_steps step ON step.id = d.step_id
        WHERE d.subscriber_id = ?
        ORDER BY d.created_at DESC
      `).bind(subscriber.id)),
      allRows(env.DB.prepare(`
        SELECT event_type, metadata_json, created_at
        FROM subscriber_events
        WHERE subscriber_id = ?
        ORDER BY created_at DESC
        LIMIT 100
      `).bind(subscriber.id))
    ]);
    subscriberDetails = {
      subscriber,
      consents,
      tags,
      enrollments,
      deliveries,
      events
    };
  }
  return {
    email,
    subscribersByStatus,
    deliveriesByStatus,
    eventsByType,
    pendingGuideCount: pendingGuideCount?.count || 0,
    pendingDeliveries,
    recentDeliveries,
    subscriberDetails
  };
}
__name(loadCampaignReviewData, "loadCampaignReviewData");
async function allRows(statement) {
  const result = await statement.all();
  return result.results || [];
}
__name(allRows, "allRows");
function unsubscribeResponse(request, ok, message, status) {
  if ((request.headers.get("accept") || "").includes("text/html")) {
    return new Response(ok ? unsubscribeSuccessPage(message) : invalidUnsubscribePage(message), {
      status,
      headers: { ...securityHeaders(), "content-type": "text/html; charset=utf-8" }
    });
  }
  return respond(request, {
    ok,
    message
  }, status);
}
__name(unsubscribeResponse, "unsubscribeResponse");
function contactConfig(request, env) {
  if (!env.CONTACT_TURNSTILE_SITE_KEY) {
    return json({ ok: false, error: "Contact form verification is not configured." }, 500, request);
  }
  return json({ ok: true, siteKey: env.CONTACT_TURNSTILE_SITE_KEY }, 200, request);
}
__name(contactConfig, "contactConfig");
async function readSubmission(request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const jsonBody = await request.json();
    return new Map(Object.entries(jsonBody || {}).map(([key, value]) => [key, String(value ?? "")]));
  }
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    return await request.formData();
  }
  throw new HttpError("Unsupported submission format.", 415);
}
__name(readSubmission, "readSubmission");
async function readJsonObject(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new HttpError("Please send JSON.", 415);
  }
  const body = await request.json();
  if (!body || Array.isArray(body) || typeof body !== "object") {
    throw new HttpError("Invalid JSON body.", 400);
  }
  return body;
}
__name(readJsonObject, "readJsonObject");
var HttpError = class extends Error {
  static {
    __name(this, "HttpError");
  }
  constructor(message, status) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
};
function validateContact(form) {
  const name = clean(form.get("name"));
  const email = clean(form.get("email")).toLowerCase();
  const message = clean(form.get("message"));
  if (name.length < 2 || name.length > 80) {
    return { ok: false, error: "Please enter your name." };
  }
  if (!isValidEmail(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (message.length < 10) {
    return { ok: false, error: "Please write a little more detail in your message." };
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return { ok: false, error: "Please shorten your message." };
  }
  if (containsHeaderInjection(name) || containsHeaderInjection(email)) {
    return { ok: false, error: "Invalid submission." };
  }
  return { ok: true, value: { name, email, message } };
}
__name(validateContact, "validateContact");
async function validateSpamControls(form, request, env, expectedAction = EXPECTED_CONTACT_TURNSTILE_ACTION) {
  const honeypotFields = ["website", "url", "company", "bot-field"];
  if (honeypotFields.some((field) => clean(form.get(field)).length > 0)) {
    return "Invalid submission.";
  }
  if (!env.TURNSTILE_SECRET_KEY) {
    return "Verification is not configured.";
  }
  const token = clean(form.get("cf-turnstile-response") || form.get("turnstileToken"));
  if (!token) {
    return "Please complete the verification challenge.";
  }
  if (token.length > MAX_TURNSTILE_TOKEN_CHARS) {
    return "Verification failed. Please try again.";
  }
  const result = await verifyTurnstile(token, request, env.TURNSTILE_SECRET_KEY);
  if (!result.success) {
    console.warn("Turnstile rejected contact submission", result["error-codes"]);
    return "Verification failed. Please try again.";
  }
  if (!isAllowedTurnstileHostname(result.hostname, env)) {
    console.warn("Turnstile hostname mismatch", result.hostname);
    return "Verification failed. Please try again.";
  }
  if (result.action !== expectedAction) {
    console.warn("Turnstile action mismatch", result.action);
    return "Verification failed. Please try again.";
  }
  return "";
}
__name(validateSpamControls, "validateSpamControls");
function validateLeadMagnet(form, request) {
  const email = clean(form.get("email")).toLowerCase();
  const firstName = clean(form.get("first_name") || form.get("firstName"));
  const consent = clean(form.get("consent")).toLowerCase();
  const leadMagnet = clean(form.get("lead_magnet") || form.get("leadMagnet")) || GODDESS_GUIDE_LEAD_MAGNET_SLUG;
  const sourcePath = normalizeSourcePath(clean(form.get("source_path") || form.get("sourcePath")), request);
  if (!isValidEmail(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (firstName.length > MAX_FIRST_NAME_CHARS) {
    return { ok: false, error: "Please shorten your first name." };
  }
  if (containsHeaderInjection(firstName) || containsHeaderInjection(email)) {
    return { ok: false, error: "Invalid submission." };
  }
  if (!isAcceptedConsent(consent)) {
    return { ok: false, error: "Please agree before requesting the guide." };
  }
  if (leadMagnet !== GODDESS_GUIDE_LEAD_MAGNET_SLUG) {
    return { ok: false, error: "Invalid guide request." };
  }
  return {
    ok: true,
    value: {
      email,
      firstName,
      sourcePath,
      leadMagnet,
      consentText: GODDESS_GUIDE_CONSENT_TEXT
    }
  };
}
__name(validateLeadMagnet, "validateLeadMagnet");
async function saveLeadMagnetSubscriber(env, lead, request) {
  if (!env.DB || typeof env.DB.prepare !== "function") {
    throw new Error("Missing DB D1 binding");
  }
  const existing = await env.DB.prepare(
    "SELECT id, first_name, unsubscribe_token FROM subscribers WHERE email = ? LIMIT 1"
  ).bind(lead.email).first();
  const subscriberId = existing?.id || crypto.randomUUID();
  const firstName = lead.firstName || existing?.first_name || "";
  const unsubscribeToken = existing?.unsubscribe_token || createOpaqueToken();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (existing) {
    await env.DB.prepare(`
      UPDATE subscribers
      SET first_name = ?, status = 'active', unsubscribed_at = NULL,
        unsubscribe_token = COALESCE(NULLIF(unsubscribe_token, ''), ?),
        updated_at = ?
      WHERE id = ?
    `).bind(firstName, unsubscribeToken, now, subscriberId).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO subscribers (
        id, email, first_name, status, unsubscribe_token, created_at, updated_at
      ) VALUES (?, ?, ?, 'active', ?, ?, ?)
    `).bind(subscriberId, lead.email, firstName, unsubscribeToken, now, now).run();
  }
  await env.DB.prepare(`
    INSERT INTO subscriber_consents (
      id, subscriber_id, consent_text, source_path, lead_magnet_slug,
      ip, user_agent, consented_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    subscriberId,
    lead.consentText,
    lead.sourcePath,
    lead.leadMagnet,
    request.headers.get("CF-Connecting-IP") || "",
    request.headers.get("user-agent") || "",
    now
  ).run();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO subscriber_tags (subscriber_id, tag, created_at) VALUES (?, ?, ?)"
  ).bind(subscriberId, GODDESS_GUIDE_TAG, now).run();
  return subscriberId;
}
__name(saveLeadMagnetSubscriber, "saveLeadMagnetSubscriber");
async function enrollGoddessGuideWelcomeSequence(env, subscriberId, lead) {
  const sequence = await env.DB.prepare(
    "SELECT id, slug FROM email_sequences WHERE slug = ? AND trigger_tag = ? AND status = 'active' LIMIT 1"
  ).bind(GODDESS_GUIDE_SEQUENCE_SLUG, GODDESS_GUIDE_TAG).first();
  if (!sequence) {
    console.warn("Goddess guide welcome sequence is not configured");
    return;
  }
  const enrollmentId = crypto.randomUUID();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const result = await env.DB.prepare(`
    INSERT OR IGNORE INTO subscriber_sequence_enrollments (
      id, subscriber_id, sequence_id, status, source_tag, lead_magnet_slug, enrolled_at
    ) VALUES (?, ?, ?, 'active', ?, ?, ?)
  `).bind(
    enrollmentId,
    subscriberId,
    sequence.id,
    GODDESS_GUIDE_TAG,
    lead.leadMagnet,
    now
  ).run();
  if (result.meta?.changes) {
    await recordSubscriberEvent(env, subscriberId, "sequence_enrolled", {
      sequence_slug: sequence.slug,
      lead_magnet_slug: lead.leadMagnet
    });
  }
  await createPendingSequenceStepDeliveries(env, subscriberId, sequence.id);
}
__name(enrollGoddessGuideWelcomeSequence, "enrollGoddessGuideWelcomeSequence");
async function createPendingSequenceStepDeliveries(env, subscriberId, sequenceId) {
  const now = Date.now();
  const steps = await env.DB.prepare(`
    SELECT id, delay_hours
    FROM email_sequence_steps
    WHERE sequence_id = ? AND status = 'active'
    ORDER BY step_order
  `).bind(sequenceId).all();
  for (const step of steps.results || []) {
    const delayHours = Number(step.delay_hours || 0);
    const dueAt = new Date(now + delayHours * 60 * 60 * 1e3).toISOString();
    await env.DB.prepare(`
      INSERT OR IGNORE INTO subscriber_sequence_step_deliveries (
        id, subscriber_id, sequence_id, step_id, status, due_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      subscriberId,
      sequenceId,
      step.id,
      dueAt,
      (/* @__PURE__ */ new Date()).toISOString(),
      (/* @__PURE__ */ new Date()).toISOString()
    ).run();
  }
}
__name(createPendingSequenceStepDeliveries, "createPendingSequenceStepDeliveries");
async function recordSubscriberEvent(env, subscriberId, eventType, metadata) {
  await env.DB.prepare(`
    INSERT INTO subscriber_events (id, subscriber_id, event_type, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    subscriberId,
    eventType,
    JSON.stringify(metadata || {}),
    (/* @__PURE__ */ new Date()).toISOString()
  ).run();
}
__name(recordSubscriberEvent, "recordSubscriberEvent");
async function createGuideDownloadUrl(request, env, options = {}) {
  if (!env.GUIDE_DOWNLOAD_TOKEN_SECRET || !env.GUIDE_ASSETS) {
    return "";
  }
  const expiresAt = Math.floor(Date.now() / 1e3) + (options.ttlSeconds || GUIDE_DOWNLOAD_TOKEN_TTL_SECONDS);
  const payload = {
    exp: expiresAt,
    slug: GODDESS_GUIDE_LEAD_MAGNET_SLUG,
    nonce: crypto.randomUUID()
  };
  if (options.purpose) {
    payload.purpose = options.purpose;
  }
  if (options.subscriberId) {
    payload.subscriber_id = options.subscriberId;
  }
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await signGuideDownloadPayload(encodedPayload, env.GUIDE_DOWNLOAD_TOKEN_SECRET);
  const url = new URL(GODDESS_GUIDE_DOWNLOAD_PATH, request.url);
  url.searchParams.set("token", `${encodedPayload}.${signature}`);
  return options.absolute ? url.toString() : url.pathname + url.search;
}
__name(createGuideDownloadUrl, "createGuideDownloadUrl");
async function verifyGuideDownloadToken(token, env) {
  if (!env.GUIDE_DOWNLOAD_TOKEN_SECRET || !token) {
    return false;
  }
  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra) {
    return false;
  }
  const expectedSignature = await signGuideDownloadPayload(
    encodedPayload,
    env.GUIDE_DOWNLOAD_TOKEN_SECRET
  );
  if (!constantTimeEqual(signature, expectedSignature)) {
    return false;
  }
  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1e3);
    return payload.slug === GODDESS_GUIDE_LEAD_MAGNET_SLUG && Number.isFinite(payload.exp) && payload.exp >= now;
  } catch {
    return false;
  }
}
__name(verifyGuideDownloadToken, "verifyGuideDownloadToken");
async function signGuideDownloadPayload(encodedPayload, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encodedPayload)
  );
  return base64UrlEncode(signature);
}
__name(signGuideDownloadPayload, "signGuideDownloadPayload");
async function verifyTurnstile(token, request, secret) {
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) {
    body.append("remoteip", ip);
  }
  const response = await fetch(TURNSTILE_VERIFY_URL, { method: "POST", body });
  if (!response.ok) {
    return { success: false, "error-codes": ["siteverify-http-error"] };
  }
  return response.json();
}
__name(verifyTurnstile, "verifyTurnstile");
async function sendContactEmail(env, submission, request) {
  if (env.CONTACT_DRY_RUN === "true") {
    console.log("Contact dry run", submission);
    return;
  }
  if (!env.EMAIL || typeof env.EMAIL.send !== "function") {
    throw new Error("Missing EMAIL send_email binding");
  }
  const from = env.CONTACT_FROM || DEFAULT_FROM;
  const subject = `Tarot Flower contact form: ${submission.name}`;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";
  const submittedAt = (/* @__PURE__ */ new Date()).toISOString();
  const text = [
    "New Tarot Flower contact form submission",
    "",
    `Name: ${submission.name}`,
    `Email: ${submission.email}`,
    `Submitted: ${submittedAt}`,
    `IP: ${ip}`,
    `User-Agent: ${userAgent}`,
    "",
    "Message:",
    submission.message
  ].join("\n");
  await env.EMAIL.send({
    to: RECIPIENT,
    from,
    replyTo: submission.email,
    subject,
    text
  });
}
__name(sendContactEmail, "sendContactEmail");
function validateCampaignToken(request, env, tokenEnvName) {
  const expected = env[tokenEnvName];
  if (!expected) {
    return "Not configured.";
  }
  const bearer = request.headers.get("authorization") || "";
  const headerToken = clean(request.headers.get("x-campaign-dev-token"));
  const token = bearer.toLowerCase().startsWith("bearer ") ? bearer.slice("bearer ".length).trim() : headerToken;
  if (!token || !constantTimeEqual(token, expected)) {
    return "Unauthorized.";
  }
  return "";
}
__name(validateCampaignToken, "validateCampaignToken");
async function findPendingCampaignDelivery(env, { deliveryId, email, subscriberId, stepSlug }) {
  const filters = [
    "d.status = 'pending'",
    "s.status = 'active'",
    "seq.slug = ?",
    "step.slug = ?"
  ];
  const params = [GODDESS_GUIDE_SEQUENCE_SLUG, GODDESS_GUIDE_FULFILLMENT_STEP_SLUG];
  if (stepSlug !== GODDESS_GUIDE_FULFILLMENT_STEP_SLUG) {
    return null;
  }
  if (deliveryId) {
    filters.push("d.id = ?");
    params.push(deliveryId);
  } else if (subscriberId) {
    filters.push("s.id = ?");
    params.push(subscriberId);
  } else {
    filters.push("s.email = ?");
    params.push(email);
  }
  return await env.DB.prepare(`
    SELECT
      d.id AS delivery_id,
      d.status AS delivery_status,
      d.attempts AS attempts,
      s.id AS subscriber_id,
      s.email AS email,
      s.first_name AS first_name,
      s.unsubscribe_token AS unsubscribe_token,
      seq.id AS sequence_id,
      seq.slug AS sequence_slug,
      step.id AS step_id,
      step.slug AS step_slug,
      step.subject AS subject,
      step.html_template AS html_template,
      step.text_template AS text_template,
      step.email_type AS email_type
    FROM subscriber_sequence_step_deliveries d
    JOIN subscribers s ON s.id = d.subscriber_id
    JOIN email_sequences seq ON seq.id = d.sequence_id
    JOIN email_sequence_steps step ON step.id = d.step_id
    WHERE ${filters.join(" AND ")}
    ORDER BY d.due_at ASC
    LIMIT 1
  `).bind(...params).first();
}
__name(findPendingCampaignDelivery, "findPendingCampaignDelivery");
async function claimCampaignDelivery(env, deliveryId) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const result = await env.DB.prepare(`
    UPDATE subscriber_sequence_step_deliveries
    SET status = 'sending', attempts = attempts + 1, updated_at = ?
    WHERE id = ? AND status = 'pending'
  `).bind(now, deliveryId).run();
  return Boolean(result.meta?.changes);
}
__name(claimCampaignDelivery, "claimCampaignDelivery");
async function sendCampaignStepEmail(request, env, delivery) {
  if (!env.EMAIL || typeof env.EMAIL.send !== "function") {
    throw new Error("Missing EMAIL send_email binding");
  }
  if (!delivery.subject || !delivery.html_template || !delivery.text_template) {
    throw new HttpError("Campaign step is missing email content.", 500);
  }
  const unsubscribeToken = delivery.unsubscribe_token || await ensureSubscriberUnsubscribeToken(
    env,
    delivery.subscriber_id
  );
  const guideDownloadUrl = await createGuideDownloadUrl(request, env, {
    ttlSeconds: GUIDE_EMAIL_DOWNLOAD_TOKEN_TTL_SECONDS,
    purpose: "guide_email",
    subscriberId: delivery.subscriber_id,
    absolute: true
  });
  const unsubscribeUrl = createUnsubscribeUrl(request, unsubscribeToken);
  const context = {
    email: delivery.email,
    first_name: delivery.first_name || "there",
    guide_download_url: guideDownloadUrl,
    unsubscribe_url: unsubscribeUrl
  };
  const html = renderTemplate(delivery.html_template, context);
  const text = renderTemplate(delivery.text_template, context);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  try {
    await env.EMAIL.send({
      to: delivery.email,
      from: env.CAMPAIGN_FROM || env.CONTACT_FROM || DEFAULT_FROM,
      replyTo: env.CAMPAIGN_REPLY_TO || env.CONTACT_FROM || DEFAULT_FROM,
      subject: delivery.subject,
      html,
      text
    });
    await env.DB.prepare(`
      UPDATE subscriber_sequence_step_deliveries
      SET status = 'sent', sent_at = ?, failed_at = NULL, last_error = NULL, updated_at = ?
      WHERE id = ? AND status = 'sending'
    `).bind(now, now, delivery.delivery_id).run();
    await recordSubscriberEvent(env, delivery.subscriber_id, "email_sent", {
      sequence_slug: delivery.sequence_slug,
      step_slug: delivery.step_slug,
      lead_magnet_slug: GODDESS_GUIDE_LEAD_MAGNET_SLUG,
      subject: delivery.subject,
      email_type: delivery.email_type
    });
    return {
      deliveryId: delivery.delivery_id,
      subscriberId: delivery.subscriber_id,
      stepSlug: delivery.step_slug,
      subject: delivery.subject
    };
  } catch (error) {
    const failedAt = (/* @__PURE__ */ new Date()).toISOString();
    const message = errorMessage(error);
    await env.DB.prepare(`
      UPDATE subscriber_sequence_step_deliveries
      SET status = 'failed', failed_at = ?, last_error = ?, updated_at = ?
      WHERE id = ? AND status = 'sending'
    `).bind(failedAt, message.slice(0, 500), failedAt, delivery.delivery_id).run();
    await recordSubscriberEvent(env, delivery.subscriber_id, "email_failed", {
      sequence_slug: delivery.sequence_slug,
      step_slug: delivery.step_slug,
      lead_magnet_slug: GODDESS_GUIDE_LEAD_MAGNET_SLUG,
      subject: delivery.subject,
      error: message.slice(0, 500)
    });
    throw error;
  }
}
__name(sendCampaignStepEmail, "sendCampaignStepEmail");
async function ensureSubscriberUnsubscribeToken(env, subscriberId) {
  const token = createOpaqueToken();
  await env.DB.prepare(`
    UPDATE subscribers
    SET unsubscribe_token = COALESCE(NULLIF(unsubscribe_token, ''), ?), updated_at = ?
    WHERE id = ?
  `).bind(token, (/* @__PURE__ */ new Date()).toISOString(), subscriberId).run();
  const subscriber = await env.DB.prepare(
    "SELECT unsubscribe_token FROM subscribers WHERE id = ? LIMIT 1"
  ).bind(subscriberId).first();
  return subscriber?.unsubscribe_token || token;
}
__name(ensureSubscriberUnsubscribeToken, "ensureSubscriberUnsubscribeToken");
function renderTemplate(template, context) {
  return String(template || "").replace(/\{\{([a-z0-9_]+)\}\}/gi, (_, key) => {
    return escapeHtml(context[key] || "");
  });
}
__name(renderTemplate, "renderTemplate");
function createUnsubscribeUrl(request, token) {
  const url = new URL(UNSUBSCRIBE_PATH, request.url);
  url.searchParams.set("token", token);
  return url.toString();
}
__name(createUnsubscribeUrl, "createUnsubscribeUrl");
async function findSubscriberByUnsubscribeToken(env, token) {
  return await env.DB.prepare(`
    SELECT id, email, first_name, status
    FROM subscribers
    WHERE unsubscribe_token = ?
    LIMIT 1
  `).bind(token).first();
}
__name(findSubscriberByUnsubscribeToken, "findSubscriberByUnsubscribeToken");
function unsubscribePage(token, subscriber) {
  const name = subscriber.first_name || subscriber.email || "there";
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Unsubscribe</title></head>
<body>
  <main style="max-width:42rem;margin:4rem auto;font-family:serif;line-height:1.5;padding:0 1rem;">
    <h1>Unsubscribe</h1>
    <p>Hello ${escapeHtml(name)}. You can stop receiving Tarot Flower emails here.</p>
    <form method="post" action="${UNSUBSCRIBE_PATH}">
      <input type="hidden" name="token" value="${escapeHtml(token)}">
      <button type="submit">Unsubscribe me</button>
    </form>
  </main>
</body>
</html>`;
}
__name(unsubscribePage, "unsubscribePage");
function invalidUnsubscribePage(message = "This unsubscribe link is missing, expired, or invalid.") {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Invalid unsubscribe link</title></head>
<body>
  <main style="max-width:42rem;margin:4rem auto;font-family:serif;line-height:1.5;padding:0 1rem;">
    <h1>Invalid unsubscribe link</h1>
    <p>${escapeHtml(message)}</p>
    <p>If you need help, please contact Vanessa through the Tarot Flower contact page.</p>
  </main>
</body>
</html>`;
}
__name(invalidUnsubscribePage, "invalidUnsubscribePage");
function unsubscribeSuccessPage(message) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Unsubscribed</title></head>
<body>
  <main style="max-width:42rem;margin:4rem auto;font-family:serif;line-height:1.5;padding:0 1rem;">
    <h1>Unsubscribed</h1>
    <p>${escapeHtml(message)}</p>
  </main>
</body>
</html>`;
}
__name(unsubscribeSuccessPage, "unsubscribeSuccessPage");
function campaignReviewPage(data) {
  const generatedAt = (/* @__PURE__ */ new Date()).toISOString();
  const searchValue = data.email || "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tarot Flower Campaign Review</title>
  <style>
    body { margin: 0; color: #241812; background: #fffaf6; font-family: Georgia, serif; line-height: 1.5; }
    main { max-width: 72rem; margin: 0 auto; padding: 2rem 1rem 4rem; }
    h1, h2, h3 { line-height: 1.15; }
    section { margin-top: 2rem; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #ead7cb; font-size: 0.95rem; }
    th, td { padding: 0.55rem 0.65rem; border-bottom: 1px solid #f0e2da; text-align: left; vertical-align: top; }
    th { background: #f8eee8; font-weight: 700; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.88em; }
    .muted { color: #725c50; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 1rem; }
    .panel { background: #fff; border: 1px solid #ead7cb; padding: 1rem; }
    .error { border-color: #b91c1c; color: #7f1d1d; background: #fef2f2; }
    input { max-width: 24rem; width: 100%; padding: 0.55rem; border: 1px solid #d8c3b8; }
    button { padding: 0.58rem 0.9rem; border: 1px solid #5f3b2e; background: #5f3b2e; color: white; cursor: pointer; }
    form { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: end; }
  </style>
</head>
<body>
  <main>
    <h1>Campaign Review</h1>
    <p class="muted">Read-only campaign visibility. Generated ${escapeHtml(generatedAt)}.</p>
    ${data.error ? `<div class="panel error">${escapeHtml(data.error)}</div>` : ""}

    <section>
      <h2>Summary Counts</h2>
      <div class="grid">
        <div class="panel">
          <h3>Subscribers by Status</h3>
          ${summaryTable(data.subscribersByStatus || [], "status")}
        </div>
        <div class="panel">
          <h3>Deliveries by Status</h3>
          ${summaryTable(data.deliveriesByStatus || [], "status")}
        </div>
        <div class="panel">
          <h3>Events by Type</h3>
          ${summaryTable(data.eventsByType || [], "event_type")}
        </div>
        <div class="panel">
          <h3>Pending Guide Fulfillment</h3>
          <p><strong>${escapeHtml(data.pendingGuideCount || 0)}</strong> pending <code>${GODDESS_GUIDE_FULFILLMENT_STEP_SLUG}</code> deliveries.</p>
        </div>
      </div>
    </section>

    <section>
      <h2>Pending Deliveries</h2>
      ${table(
    ["delivery id", "email", "first name", "sequence", "step", "due date", "attempts", "created"],
    data.pendingDeliveries || [],
    ["delivery_id", "email", "first_name", "sequence_slug", "step_slug", "due_at", "attempts", "created_at"]
  )}
    </section>

    <section>
      <h2>Recent Sent / Failed / Canceled Deliveries</h2>
      ${table(
    ["status", "recipient", "step", "attempts", "sent", "failed", "updated", "last error"],
    data.recentDeliveries || [],
    ["status", "email", "step_slug", "attempts", "sent_at", "failed_at", "updated_at", "last_error"]
  )}
    </section>

    <section>
      <h2>Subscriber Search</h2>
      <form method="get" action="/api/admin/campaign/review">
        <label>
          <span>Email</span><br>
          <input type="email" name="email" value="${escapeHtml(searchValue)}" placeholder="vanessa@tarotflower.com">
        </label>
        <button type="submit">Search</button>
      </form>
      ${subscriberReviewHtml(data)}
    </section>
  </main>
</body>
</html>`;
}
__name(campaignReviewPage, "campaignReviewPage");
function subscriberReviewHtml(data) {
  if (!data.email) {
    return `<p class="muted">Enter an email address to inspect subscriber details.</p>`;
  }
  if (!data.subscriberDetails) {
    return `<p class="muted">No subscriber found for ${escapeHtml(data.email)}.</p>`;
  }
  const details = data.subscriberDetails;
  return `
    <h3>Subscriber</h3>
    ${table(
    ["id", "email", "first name", "status", "unsubscribed at", "created", "updated"],
    [details.subscriber],
    ["id", "email", "first_name", "status", "unsubscribed_at", "created_at", "updated_at"]
  )}
    <h3>Consent Records</h3>
    ${table(
    ["text", "source path", "lead magnet", "consented"],
    details.consents,
    ["consent_text", "source_path", "lead_magnet_slug", "consented_at"]
  )}
    <h3>Tags</h3>
    ${table(
    ["tag", "created"],
    details.tags,
    ["tag", "created_at"]
  )}
    <h3>Enrollments</h3>
    ${table(
    ["sequence", "status", "source tag", "enrolled"],
    details.enrollments,
    ["sequence_slug", "status", "source_tag", "enrolled_at"]
  )}
    <h3>Deliveries</h3>
    ${table(
    ["delivery id", "sequence", "step", "status", "attempts", "due", "sent", "failed", "last error", "created", "updated"],
    details.deliveries,
    ["delivery_id", "sequence_slug", "step_slug", "status", "attempts", "due_at", "sent_at", "failed_at", "last_error", "created_at", "updated_at"]
  )}
    <h3>Events</h3>
    ${table(
    ["event type", "metadata", "created"],
    details.events,
    ["event_type", "metadata_json", "created_at"]
  )}
  `;
}
__name(subscriberReviewHtml, "subscriberReviewHtml");
function summaryTable(rows, labelKey) {
  return table(["name", "count"], rows, [labelKey, "count"]);
}
__name(summaryTable, "summaryTable");
function table(headers, rows, keys) {
  if (!rows.length) {
    return `<p class="muted">No records found.</p>`;
  }
  return `<table>
    <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
    <tbody>
      ${rows.map((row) => `<tr>${keys.map((key) => `<td>${formatCell(row[key])}</td>`).join("")}</tr>`).join("")}
    </tbody>
  </table>`;
}
__name(table, "table");
function formatCell(value) {
  if (value === null || value === void 0 || value === "") {
    return `<span class="muted">-</span>`;
  }
  return escapeHtml(value);
}
__name(formatCell, "formatCell");
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "Unknown error");
}
__name(errorMessage, "errorMessage");
function validateOrigin(request, env) {
  const allowed = new Set(
    (env.ALLOWED_ORIGINS || "https://tarotflower.com,https://www.tarotflower.com").split(",").map((origin2) => origin2.trim()).filter(Boolean)
  );
  const origin = request.headers.get("origin");
  if (origin && !allowed.has(origin)) {
    return "Invalid submission origin.";
  }
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (!allowed.has(refererOrigin)) {
        return "Invalid submission source.";
      }
    } catch {
      return "Invalid submission source.";
    }
  }
  return "";
}
__name(validateOrigin, "validateOrigin");
function isAllowedTurnstileHostname(hostname, env) {
  const allowed = new Set(
    (env.TURNSTILE_ALLOWED_HOSTNAMES || DEFAULT_ALLOWED_HOSTNAMES).split(",").map((host) => host.trim().toLowerCase()).filter(Boolean)
  );
  return allowed.has(String(hostname || "").toLowerCase());
}
__name(isAllowedTurnstileHostname, "isAllowedTurnstileHostname");
function respond(request, payload, status = payload.ok ? 200 : 400) {
  const acceptsHtml = (request.headers.get("accept") || "").includes("text/html");
  if (payload.ok && acceptsHtml && payload.redirect) {
    return new Response(null, {
      status: 303,
      headers: { ...securityHeaders(), ...corsHeaders(request), location: new URL(payload.redirect, request.url).toString() }
    });
  }
  if (!payload.ok && acceptsHtml) {
    return new Response(errorPage(payload.error), {
      status,
      headers: { ...securityHeaders(), ...corsHeaders(request), "content-type": "text/html; charset=utf-8" }
    });
  }
  return json(payload, status, request);
}
__name(respond, "respond");
function json(payload, status = 200, request) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...securityHeaders(), ...(request ? corsHeaders(request) : {}), "content-type": "application/json; charset=utf-8" }
  });
}
__name(json, "json");
function errorPage(error) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Message not sent</title></head>
<body>
  <main style="max-width:42rem;margin:4rem auto;font-family:serif;line-height:1.5;padding:0 1rem;">
    <h1>Message not sent</h1>
    <p>${escapeHtml(error)}</p>
    <p><a href="/contact/">Return to the contact form</a></p>
  </main>
</body>
</html>`;
}
__name(errorPage, "errorPage");
function securityHeaders() {
  return {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin"
  };
}
__name(securityHeaders, "securityHeaders");
function corsHeaders(request) {
  const origin = request.headers.get("origin");
  if (origin !== "https://tarotflower.com" && origin !== "https://www.tarotflower.com") {
    return {};
  }
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Accept, Content-Type",
    "vary": "Origin"
  };
}
__name(corsHeaders, "corsHeaders");
function clean(value) {
  return String(value || "").replace(/\u0000/g, "").trim();
}
__name(clean, "clean");
function isValidEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
__name(isValidEmail, "isValidEmail");
function containsHeaderInjection(value) {
  return /[\r\n]/.test(value);
}
__name(containsHeaderInjection, "containsHeaderInjection");
function isAcceptedConsent(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}
__name(isAcceptedConsent, "isAcceptedConsent");
function normalizeSourcePath(value, request) {
  const fallback = new URL(request.url).pathname || "/";
  const source = clean(value).slice(0, MAX_SOURCE_PATH_CHARS);
  if (!source) {
    return fallback;
  }
  if (source.startsWith("/")) {
    return source;
  }
  try {
    const parsed = new URL(source);
    return `${parsed.pathname}${parsed.search}`.slice(0, MAX_SOURCE_PATH_CHARS) || fallback;
  } catch {
    return fallback;
  }
}
__name(normalizeSourcePath, "normalizeSourcePath");
function base64UrlEncode(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
__name(base64UrlEncode, "base64UrlEncode");
function base64UrlDecode(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "="
  );
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
__name(base64UrlDecode, "base64UrlDecode");
function createOpaqueToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(createOpaqueToken, "createOpaqueToken");
function constantTimeEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}
__name(constantTimeEqual, "constantTimeEqual");
function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
__name(escapeHtml, "escapeHtml");
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
