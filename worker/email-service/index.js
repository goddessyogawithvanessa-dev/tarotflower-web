import { connect } from "cloudflare:sockets";
import { WorkerEntrypoint } from "cloudflare:workers";
import { buildLibraryPurchaseAccessEmail } from "./library-purchase-email.js";
import { handleCircleEmailConsent } from "./circle-consent.js";
import { renderEmail } from "./tarot-email-suite.js";

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/worker.js
var RECIPIENT = "vanessa@tarotflower.com";
var DEFAULT_TAROT_FROM = "Tarot Flower <vanessa@tarotflower.com>";
var DEFAULT_TAROT_REPLY_TO = "vanessa@tarotflower.com";
var NEWSLETTER_FROM_NAME = "Vanessa Hylande";
var NEWSLETTER_FROM_EMAIL = "vanessa@tarotflower.com";
var NEWSLETTER_FROM = `${NEWSLETTER_FROM_NAME} <${NEWSLETTER_FROM_EMAIL}>`;
var NEWSLETTER_REPLY_TO = NEWSLETTER_FROM_EMAIL;
var NEWSLETTER_OWNER_COPY = NEWSLETTER_FROM_EMAIL;
var NEWSLETTER_PUBLIC_ORIGIN = "https://tarotflower.com";
var NEWSLETTER_BATCH_SIZE = 25;
var NEWSLETTER_MAX_ATTEMPTS = 3;
// Moonlight Circle uses the shared Tarot Flower transport with its approved display identity.
var DEFAULT_CIRCLE_FROM = "Moonlight Circle <vanessa@tarotflower.com>";
var DEFAULT_CIRCLE_REPLY_TO = "vanessa@tarotflower.com";
var MAX_BODY_BYTES = 32 * 1024;
var MAX_MESSAGE_CHARS = 5e3;
var MAX_TURNSTILE_TOKEN_CHARS = 2048;
var MAX_FIRST_NAME_CHARS = 80;
var MAX_SOURCE_PATH_CHARS = 240;
var GUIDE_DOWNLOAD_TOKEN_TTL_SECONDS = 15 * 60;
var GUIDE_EMAIL_DOWNLOAD_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
var EXPECTED_CONTACT_TURNSTILE_ACTION = "contact";
var EXPECTED_LEAD_MAGNET_TURNSTILE_ACTION = "lead_magnet_goddess_guide";
var EXPECTED_NEWSLETTER_TURNSTILE_ACTION = "newsletter";
var GODDESS_GUIDE_LEAD_MAGNET_SLUG = "goddess-embodiment-guide";
var GODDESS_GUIDE_TAG = `lead:${GODDESS_GUIDE_LEAD_MAGNET_SLUG}`;
var GODDESS_GUIDE_SEQUENCE_SLUG = "goddess-guide-welcome";
var GODDESS_GUIDE_FULFILLMENT_STEP_SLUG = "guide-fulfillment";
var GODDESS_GUIDE_R2_KEY = "lead-magnets/goddess-embodiment-guide/goddess-embodiment-guide.pdf";
var GODDESS_GUIDE_DOWNLOAD_PATH = "/api/lead-magnet/goddess-embodiment-guide/download";
var UNSUBSCRIBE_PATH = "/api/email/unsubscribe";
var GODDESS_GUIDE_CONSENT_TEXT = "I agree to receive the Goddess Embodiment Guide and occasional Tarot Flower emails. I understand I can unsubscribe at any time.";
var GYR_NEWSLETTER_CONSENT_TEXT = "I agree to receive Goddess Yoga Retreats updates and occasional news from Vanessa. I understand I can unsubscribe at any time.";
var GYR_NEWSLETTER_SOURCE_TAG = "source:goddess-yoga-retreats";
var ECOSYSTEM_SUBSCRIBER_TAG = "ecosystem:vanessa";
var ACTIVITY_CLASSIFICATION_HEADER = "x-tarotflower-activity-classification";
var ACTIVITY_CLASSIFICATION_TOKEN_HEADER = "x-tarotflower-qa-token";
var GYR_DESTINATION_INTERESTS = new Set(["puglia-italy", "morocco", "wachau-austria", "zillertal-tirol"]);
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
    if (url.pathname === "/api/newsletter") {
      return handleNewsletter(request, env);
    }
    if (url.pathname === "/api/oracle-waitlist") return handleTarotSignup(request, env, "oracle");
    if (url.pathname === "/api/tarot-newsletter") return handleTarotSignup(request, env, "newsletter");
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
    ctx.waitUntil(Promise.all([
      processDueCampaignDeliveries(env),
      processDueNewsletterCampaigns(env)
    ]));
  }
};
class LibraryEmailService extends WorkerEntrypoint {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === UNSUBSCRIBE_PATH) {
      return handleUnsubscribe(request, this.env);
    }
    if (request.method === "GET" && url.pathname === "/api/admin/campaign/review") {
      return campaignReviewResponse(this.env, "");
    }
    if (request.method === "POST" && url.pathname === "/api/admin/campaign/review") {
      const form = await readSubmission(request);
      return campaignReviewResponse(this.env, clean(form.get("email")).toLowerCase());
    }
    if (request.method === "GET" && url.pathname === "/api/admin/business/overview") {
      return businessOverviewResponse(this.env);
    }
    if (request.method === "GET" && url.pathname === "/api/admin/newsletters") {
      return newsletterCampaignsResponse(this.env);
    }
    const newsletterMatch = url.pathname.match(/^\/api\/admin\/newsletters\/([^/]+)(?:\/(preview|approve))?$/);
    if (newsletterMatch && request.method === "GET" && newsletterMatch[2] === "preview") {
      return newsletterPreviewResponse(this.env, newsletterMatch[1]);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/newsletters/draft") {
      return createNewsletterDraftResponse(request, this.env);
    }
    if (newsletterMatch && request.method === "POST" && newsletterMatch[2] === "approve") {
      return approveNewsletterCampaignResponse(this.env, newsletterMatch[1]);
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }
    if (url.pathname === "/api/library-magic-link") {
      return handleLibraryMagicLink(request, this.env);
    }
    if (url.pathname === "/api/library-purchase-access") {
      return handleLibraryPurchaseAccess(request, this.env);
    }
    if (url.pathname === "/api/library-password-link") {
      return handleLibraryPasswordLink(request, this.env);
    }
    if (url.pathname === "/api/library-account-verification") {
      return handleLibraryAccountVerification(request, this.env);
    }
    if (url.pathname === "/api/library-password-changed") {
      return handleLibraryPasswordChanged(request, this.env);
    }
    if (url.pathname === "/api/circle-password-link") {
      return handleCirclePasswordLink(request, this.env);
    }
    if (url.pathname === "/api/circle-password-changed") return handleCirclePasswordChanged(request, this.env);
    if (url.pathname === "/api/circle-email-consent") return handleCircleEmailConsent(request, this.env);
    return new Response("Not found", { status: 404 });
  }
}
async function handleCirclePasswordChanged(request, env) {
  try {
    const text = await request.text();
    if (text.length > 8192) return new Response("Request too large", { status: 413 });
    const to = clean(JSON.parse(text).to).toLowerCase();
    if (!isValidEmail(to) || containsHeaderInjection(to)) return new Response("Invalid recipient", { status: 400 });
    await sendSmtpEmail(env, {
      to, from: env.CIRCLE_FROM || DEFAULT_CIRCLE_FROM, replyTo: env.CIRCLE_REPLY_TO || DEFAULT_CIRCLE_REPLY_TO,
      subject: "Your Moonlight Circle password was changed",
      text: "Your Moonlight Circle password has been changed. If this was not you, visit https://moonlightcircle.com and use Forgot your password to recover your account, and contact Vanessa.",
      html: '<p>Your Moonlight Circle password has been changed.</p><p>If this was not you, visit <a href="https://moonlightcircle.com">Moonlight Circle</a> and use Forgot your password to recover your account, and contact Vanessa.</p>',
    });
    return Response.json({ok:true});
  } catch { console.error("Circle password-change notification failed"); return new Response("Email delivery unavailable", {status:503}); }
}
async function handleCirclePasswordLink(request, env) {
  try {
    const text = await request.text();
    if (text.length > 8192) return new Response("Request too large", { status: 413 });
    const body = JSON.parse(text), to = clean(body.to).toLowerCase(), link = new URL(clean(body.passwordLink));
    if (!isValidEmail(to) || containsHeaderInjection(to) || link.origin !== "https://moonlightcircle.com" || link.username || link.password ||
      link.pathname !== "/api/auth/password/open" || !/^[A-Za-z0-9_-]{43}$/.test(link.searchParams.get("token") || "") ||
      !["setup", "reset"].includes(body.purpose)) return new Response("Invalid password request", { status: 400 });
    const action = body.purpose === "reset" ? "Reset" : "Set";
    await sendSmtpEmail(env, {
      to, from: env.CIRCLE_FROM || DEFAULT_CIRCLE_FROM, replyTo: env.CIRCLE_REPLY_TO || DEFAULT_CIRCLE_REPLY_TO,
      subject: `${action} your Moonlight Circle password`,
      text: `${action} your password using this private link:\n\n${link}\n\nIt expires in 15 minutes and can be used once. If you did not request this, you can ignore this email.`,
      html: `<p><a href="${escapeHtml(String(link))}">${action} your Moonlight Circle password</a></p><p>This private link expires in 15 minutes and can be used once. If you did not request this, you can ignore this email.</p>`,
    });
    return Response.json({ ok: true });
  } catch { console.error("Circle password email delivery failed"); return new Response("Email delivery unavailable", { status: 503 }); }
}
async function handleLibraryMagicLink(request, env) {
  try {
    const length = Number(request.headers.get("content-length") || "0");
    if (length > MAX_BODY_BYTES) {
      return new Response("Request too large", { status: 413 });
    }
    const body = await request.json();
    const to = clean(body.to).toLowerCase();
    const subject = clean(body.subject);
    const magicLink = clean(body.magicLink);
    const expiresInMinutes = Number(body.expiresInMinutes);
    if (!isValidEmail(to) || containsHeaderInjection(to)) {
      return new Response("Invalid recipient", { status: 400 });
    }
    if (!subject || subject.length > 160 || containsHeaderInjection(subject)) {
      return new Response("Invalid subject", { status: 400 });
    }
    let parsedLink;
    try {
      parsedLink = new URL(magicLink);
    } catch {
      return new Response("Invalid magic link", { status: 400 });
    }
    if (
      parsedLink.protocol !== "https:" ||
      !["tarotflower.com", "www.tarotflower.com"].includes(parsedLink.hostname) ||
      parsedLink.pathname !== "/library/auth" ||
      !parsedLink.searchParams.get("token")
    ) {
      return new Response("Invalid magic link", { status: 400 });
    }
    if (!Number.isInteger(expiresInMinutes) || expiresInMinutes < 1 || expiresInMinutes > 60) {
      return new Response("Invalid expiry", { status: 400 });
    }
    const safeLink = escapeHtml(magicLink);
    await sendSmtpEmail(env, {
      to,
      from: env.TAROT_FROM || DEFAULT_TAROT_FROM,
      replyTo: env.TAROT_REPLY_TO || DEFAULT_TAROT_REPLY_TO,
      ...renderEmail("library", { login_url: magicLink })
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  } catch (error) {
    console.error("Library magic-link email failed", error);
    return new Response("The email could not be sent", { status: 500 });
  }
}
__name(handleLibraryMagicLink, "handleLibraryMagicLink");
async function handleLibraryPurchaseAccess(request, env) {
  try {
    const length = Number(request.headers.get("content-length") || "0");
    if (length > MAX_BODY_BYTES) {
      return new Response("Request too large", { status: 413 });
    }
    const body = await request.json();
    const to = clean(body.to).toLowerCase();
    const subject = clean(body.subject);
    const productTitle = clean(body.productTitle);
    const libraryUrl = clean(body.libraryUrl);
    if (!isValidEmail(to) || containsHeaderInjection(to)) {
      return new Response("Invalid recipient", { status: 400 });
    }
    if (!subject || subject.length > 160 || containsHeaderInjection(subject)) {
      return new Response("Invalid subject", { status: 400 });
    }
    if (!productTitle || productTitle.length > 160) {
      return new Response("Invalid product title", { status: 400 });
    }
    let parsedLibraryUrl;
    try {
      parsedLibraryUrl = new URL(libraryUrl);
    } catch {
      return new Response("Invalid access URL", { status: 400 });
    }
    if (
      parsedLibraryUrl.protocol !== "https:" ||
      !["tarotflower.com", "www.tarotflower.com"].includes(parsedLibraryUrl.hostname) ||
      parsedLibraryUrl.pathname !== "/library/" ||
      parsedLibraryUrl.search ||
      parsedLibraryUrl.hash
    ) {
      return new Response("Invalid access URL", { status: 400 });
    }
    const email = buildLibraryPurchaseAccessEmail({
      productTitle,
      libraryUrl
    });
    await sendSmtpEmail(env, {
      to,
      from: env.TAROT_FROM || DEFAULT_TAROT_FROM,
      replyTo: env.TAROT_REPLY_TO || DEFAULT_TAROT_REPLY_TO,
      subject,
      html: email.html,
      text: email.text
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  } catch (error) {
    console.error("Library purchase-access email failed", error);
    return new Response("The email could not be sent", { status: 500 });
  }
}
__name(handleLibraryPurchaseAccess, "handleLibraryPurchaseAccess");
async function handleLibraryPasswordLink(request, env) {
  try {
    const text = await request.text();
    if (text.length > 8192) return new Response("Request too large", { status: 413 });
    const body = JSON.parse(text);
    const to = clean(body.to).toLowerCase();
    const purpose = body.purpose === "setup" ? "setup" : body.purpose === "reset" ? "reset" : "";
    const expiresInMinutes = Number(body.expiresInMinutes);
    const link = new URL(clean(body.passwordLink));
    const workbenchReset = purpose === "reset" && link.pathname === "/workbench/forgot/";
    const expectedPath = purpose === "setup" ? "/library/setup/" : workbenchReset ? "/workbench/forgot/" : "/library/forgot/";
    if (!isValidEmail(to) || containsHeaderInjection(to) || !purpose ||
      link.protocol !== "https:" || !["tarotflower.com", "www.tarotflower.com"].includes(link.hostname) ||
      link.pathname !== expectedPath || !/^[A-Za-z0-9_-]{43}$/.test(link.searchParams.get("token") || "") ||
      link.searchParams.get("mode") !== purpose || !Number.isInteger(expiresInMinutes) ||
      expiresInMinutes < 1 || expiresInMinutes > 60) {
      return new Response("Invalid password request", { status: 400 });
    }
    const action = purpose === "reset" ? "Reset" : "Create";
    const destinationName = workbenchReset ? "Tarot Flower Workbench" : "My Library";
    const subject = `${action} your ${destinationName} password`;
    const safeLink = escapeHtml(String(link));
    const textBody = `${action} your ${destinationName} password using this private link:\n\n${link}\n\nThis link expires in ${expiresInMinutes} minutes and can be used once. If you did not request this, you can ignore this email.\n\nXOXO,\nVanessa`;
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#121113;font-family:Georgia,serif;color:#211c19"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" style="max-width:620px;background:#f3ead9;border:1px solid #9b773c"><tr><td style="padding:24px;background:#181416;color:#c5a15c;text-align:center;font:12px Arial;letter-spacing:.2em">TAROT FLOWER</td></tr><tr><td style="padding:32px 24px"><p style="font-size:17px;line-height:1.7">${action} your ${destinationName} password using this private link:</p><p style="margin:26px 0"><a href="${safeLink}" style="display:inline-block;padding:14px 22px;border:1px solid #a17d47;background:#211c19;color:#f3ead9;text-decoration:none;font:13px Arial;letter-spacing:.08em">${action.toUpperCase()} MY PASSWORD</a></p><p style="font-size:15px;line-height:1.7">This link expires in ${expiresInMinutes} minutes and can be used once. If you did not request this, you can ignore this email.</p><p style="font-size:17px;line-height:1.7">XOXO,<br>Vanessa</p></td></tr></table></td></tr></table></body></html>`;
    await sendSmtpEmail(env, { to, from: env.TAROT_FROM || DEFAULT_TAROT_FROM,
      replyTo: env.TAROT_REPLY_TO || DEFAULT_TAROT_REPLY_TO, subject, text: textBody, html });
    return Response.json({ ok: true });
  } catch {
    console.error("Library password email delivery failed");
    return new Response("Email delivery unavailable", { status: 503 });
  }
}
__name(handleLibraryPasswordLink, "handleLibraryPasswordLink");

async function handleLibraryAccountVerification(request, env) {
  try {
    const text = await request.text();
    if (text.length > 8192) return new Response("Request too large", { status: 413 });
    const body = JSON.parse(text);
    const to = clean(body.to).toLowerCase();
    const expiresInHours = Number(body.expiresInHours);
    const link = new URL(clean(body.verificationLink));
    if (!isValidEmail(to) || containsHeaderInjection(to) ||
      link.protocol !== "https:" || !["tarotflower.com", "www.tarotflower.com"].includes(link.hostname) ||
      link.username || link.password || link.pathname !== "/library/verify" ||
      !/^[A-Za-z0-9_-]{43}$/.test(link.searchParams.get("token") || "") ||
      !Number.isInteger(expiresInHours) || expiresInHours < 1 || expiresInHours > 72) {
      return new Response("Invalid verification request", { status: 400 });
    }
    await sendSmtpEmail(env, {
      to,
      from: env.TAROT_FROM || DEFAULT_TAROT_FROM,
      replyTo: env.TAROT_REPLY_TO || DEFAULT_TAROT_REPLY_TO,
      ...renderEmail("library-verification", { verification_url: String(link) }),
    });
    return Response.json({ ok: true });
  } catch {
    console.error("Library verification email delivery failed");
    return new Response("Email delivery unavailable", { status: 503 });
  }
}
__name(handleLibraryAccountVerification, "handleLibraryAccountVerification");

async function handleLibraryPasswordChanged(request, env) {
  try {
    const text = await request.text();
    if (text.length > 8192) return new Response("Request too large", { status: 413 });
    const body = JSON.parse(text);
    const to = clean(body.to).toLowerCase();
    const context = body.context === "workbench" ? "workbench" : "library";
    if (!isValidEmail(to) || containsHeaderInjection(to)) return new Response("Invalid recipient", { status: 400 });
    const destinationName = context === "workbench" ? "Tarot Flower Workbench" : "My Library";
    const resetUrl = context === "workbench" ? "https://tarotflower.com/workbench/forgot/" : "https://tarotflower.com/library/forgot/";
    await sendSmtpEmail(env, {
      to, from: env.TAROT_FROM || DEFAULT_TAROT_FROM, replyTo: env.TAROT_REPLY_TO || DEFAULT_TAROT_REPLY_TO,
      subject: `Your ${destinationName} password was changed`,
      text: `Your ${destinationName} password has been changed. If this was not you, visit ${resetUrl} to reset it and reply to this email for help.`,
      html: `<p>Your ${destinationName} password has been changed.</p><p>If this was not you, <a href="${resetUrl}">reset it here</a> and reply to this email for help.</p>`,
    });
    return Response.json({ ok: true });
  } catch {
    console.error("Library password-change notification failed");
    return new Response("Email delivery unavailable", { status: 503 });
  }
}
__name(handleLibraryPasswordChanged, "handleLibraryPasswordChanged");
async function handleContact(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...securityHeaders(), ...corsHeaders(request) } });
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
      redirect: validation.value.site === "goddess-yoga-retreats"
        ? "https://goddess-yoga-retreats.com/contact/?sent=1"
        : "/contact/?sent=1"
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
async function handleTarotSignup(request, env, kind) {
  if (request.method === "OPTIONS") return new Response(null, {status:204, headers:{...securityHeaders(), ...corsHeaders(request)}});
  if (request.method !== "POST") return respond(request, {ok:false,error:"Method not allowed"}, 405);
  try {
    if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) throw new HttpError("Your submission is too large.",413);
    const originError = validateOrigin(request, env);
    if (originError) throw new HttpError(originError,403);
    const origin = request.headers.get("origin");
    if (origin && !["https://tarotflower.com","https://www.tarotflower.com","https://tarotflower-web-dev.embodiedgoddesses.workers.dev"].includes(origin))
      throw new HttpError("Invalid signup source.",403);
    const form = await readSubmission(request);
    const spam = await validateSpamControls(form,request,env,kind === "oracle" ? "contact" : "newsletter");
    if (spam) throw new HttpError(spam,400);
    const email = clean(form.get("email")).toLowerCase();
    const firstName = clean(form.get("name") || form.get("first_name"));
    if (!isValidEmail(email) || containsHeaderInjection(email) || containsHeaderInjection(firstName) || firstName.length > 80)
      throw new HttpError("Please enter a valid name and email address.",400);
    if (!isAcceptedConsent(clean(form.get("consent")).toLowerCase())) throw new HttpError("Please agree before joining the list.",400);
    const consentText = kind === "oracle"
      ? "I agree to receive Sacred Becoming Oracle launch updates by email."
      : "I agree to receive Tarot Flower emails. I can unsubscribe at any time.";
    const sourcePath = normalizeSourcePath(clean(form.get("source_path")),request);
    const tag = kind === "oracle" ? "interest:sacred-becoming-oracle" : "list:tarot-flower-newsletter";
    const slug = kind === "oracle" ? "oracle-waitlist-welcome" : "tarot-newsletter-welcome";
    const id = crypto.randomUUID(), now = new Date().toISOString();
    // Case-insensitive shared identity; unique normalized email also makes concurrent retries safe.
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO subscribers(id,email,first_name,status,unsubscribe_token,created_at,updated_at)
        SELECT ?,?,?,'active',?,?,? WHERE NOT EXISTS (SELECT 1 FROM subscribers WHERE lower(trim(email))=?)`)
        .bind(id,email,firstName,createOpaqueToken(),now,now,email),
      env.DB.prepare(`UPDATE subscribers SET first_name=COALESCE(NULLIF(?,''),first_name),
        status=CASE WHEN status='suppressed' THEN 'suppressed' ELSE 'active' END,
        unsubscribed_at=CASE WHEN status='suppressed' THEN unsubscribed_at ELSE NULL END,
        unsubscribe_token=COALESCE(NULLIF(unsubscribe_token,''),?),updated_at=?
        WHERE lower(trim(email))=?`).bind(firstName,createOpaqueToken(),now,email),
    ]);
    const subscriber = await env.DB.prepare("SELECT id,status FROM subscribers WHERE lower(trim(email))=? LIMIT 1").bind(email).first();
    await recordSubscriberActivityClassification(env, subscriber.id, request, {
      route: kind === "oracle" ? "/api/oracle-waitlist" : "/api/tarot-newsletter",
      sourcePath
    });
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO subscriber_consents(id,subscriber_id,consent_text,source_path,lead_magnet_slug,ip,user_agent,consented_at)
        VALUES (?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),subscriber.id,consentText,sourcePath,kind === "oracle" ? "oracle-waitlist" : "tarot-newsletter",
          request.headers.get("CF-Connecting-IP") || "",request.headers.get("user-agent") || "",now),
      env.DB.prepare("INSERT OR IGNORE INTO subscriber_tags(subscriber_id,tag,created_at) VALUES (?,?,?)").bind(subscriber.id,tag,now),
      env.DB.prepare("INSERT OR IGNORE INTO subscriber_tags(subscriber_id,tag,created_at) VALUES (?,?,?)").bind(subscriber.id,"source:tarot-flower",now),
    ]);
    let enrolled = false;
    if (subscriber.status === "active") {
      enrolled = await enrollGoddessGuideWelcomeSequence(env,subscriber.id,{leadMagnet:kind},slug,tag);
      if (kind === "oracle" && enrolled) {
        try { await sendContactEmail(env,{name:firstName || "Oracle subscriber",email,
          message:"Sacred Becoming Oracle waitlist signup. Please add me to the Oracle launch waitlist.",site:"tarot-flower"},request); }
        catch { console.error("Oracle owner notification failed; subscriber confirmation remains queued."); }
      }
    }
    return respond(request,{ok:true,newSubscription:enrolled,message:kind === "oracle" ? "You're on the Sacred Becoming Oracle waitlist. Thank you." : "Thank you. You’re on the list."});
  } catch (error) {
    if (error instanceof HttpError) return respond(request,{ok:false,error:error.message},error.status);
    console.error("Tarot signup failed",error);
    return respond(request,{ok:false,error:"Your email could not be saved. Please try again."},500);
  }
}
async function handleNewsletter(request, env) {
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
    const spamError = await validateSpamControls(form, request, env, EXPECTED_NEWSLETTER_TURNSTILE_ACTION);
    if (spamError) {
      return respond(request, { ok: false, error: spamError }, 400);
    }
    const validation = validateNewsletter(form, request);
    if (!validation.ok) {
      return respond(request, { ok: false, error: validation.error }, 400);
    }
    await saveNewsletterSubscriber(env, validation.value, request);
    return respond(request, {
      ok: true,
      message: "Thank you. You’re on the list.",
      redirect: "https://goddess-yoga-retreats.com/contact/?subscribed=1"
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return respond(request, { ok: false, error: error.message }, error.status);
    }
    console.error("Newsletter signup failed", error);
    return respond(request, { ok: false, error: "Your email could not be saved. Please try again." }, 500);
  }
}
__name(handleNewsletter, "handleNewsletter");
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
    SELECT d.id AS delivery_id, step.slug AS step_slug
    FROM subscriber_sequence_step_deliveries d
    JOIN subscribers s ON s.id = d.subscriber_id
    JOIN email_sequences seq ON seq.id = d.sequence_id
    JOIN email_sequence_steps step ON step.id = d.step_id
    WHERE d.status = 'pending'
      AND d.due_at <= ?
      AND s.status = 'active'
      AND seq.status = 'active' AND step.status = 'active'
      AND seq.slug IN ('goddess-guide-welcome', 'oracle-waitlist-welcome', 'tarot-newsletter-welcome')
    ORDER BY d.due_at ASC
    LIMIT 25
  `).bind(
    (/* @__PURE__ */ new Date()).toISOString()
  ).all();
  for (const row of due.results || []) {
    const delivery = await findPendingCampaignDelivery(env, {
      deliveryId: row.delivery_id,
      email: "",
      subscriberId: "",
      stepSlug: row.step_slug
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
async function newsletterCampaignsResponse(env) {
  const campaigns = await allRows(env.DB.prepare(`
    SELECT id,subject,preview_text,from_name,from_email,reply_to,status,
      eligible_recipient_count,provider_accepted_count,failed_count,skipped_count,
      unsubscribe_count,bounce_count,complaint_count,owner_copy_status,tracking_mode,provider_name,
      provider_delivery_visibility,approved_at,sending_started_at,completed_at,created_at,updated_at
    FROM newsletter_campaigns
    ORDER BY created_at DESC
    LIMIT 50
  `));
  return json({
    campaigns,
    sender: newsletterSenderConfiguration(env),
    reporting: {
      providerAcceptanceOnly: true,
      inboxPlacementAvailable: false,
      bounceAndComplaintFeedAvailable: false,
      openTrackingEnabled: false,
      clickTrackingEnabled: false
    }
  });
}
__name(newsletterCampaignsResponse, "newsletterCampaignsResponse");
async function createNewsletterDraftResponse(request, env) {
  try {
    const body = await readJsonObject(request);
    const subject = clean(body.subject);
    const previewText = clean(body.preview_text || body.previewText);
    const htmlTemplate = String(body.html_template || body.htmlTemplate || "").trim();
    const textTemplate = String(body.text_template || body.textTemplate || "").trim();
    if (!subject || subject.length > 200 || containsHeaderInjection(subject)) {
      throw new HttpError("A valid subject is required.", 400);
    }
    if (previewText.length > 300 || containsHeaderInjection(previewText)) {
      throw new HttpError("Preview text must be 300 characters or fewer.", 400);
    }
    if (!htmlTemplate || !textTemplate || htmlTemplate.length > 500000 || textTemplate.length > 200000) {
      throw new HttpError("Both HTML and plain-text campaign content are required.", 400);
    }
    if (!htmlTemplate.includes("{{unsubscribe_url}}") || !textTemplate.includes("{{unsubscribe_url}}")) {
      throw new HttpError("Both campaign versions must contain {{unsubscribe_url}}.", 400);
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const id = crypto.randomUUID();
    const contentHash = await newsletterContentHash({ subject, previewText, htmlTemplate, textTemplate });
    await env.DB.prepare(`INSERT INTO newsletter_campaigns(
      id,subject,preview_text,html_template,text_template,from_name,from_email,reply_to,public_origin,
      content_hash,status,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,'draft',?,?)`).bind(
      id, subject, previewText, htmlTemplate, textTemplate,
      NEWSLETTER_FROM_NAME, NEWSLETTER_FROM_EMAIL, NEWSLETTER_REPLY_TO, NEWSLETTER_PUBLIC_ORIGIN,
      contentHash, now, now
    ).run();
    const campaign = await loadNewsletterCampaign(env, id);
    const preflight = await newsletterPreflight(env, campaign, { requireDraft: true });
    return json({ ok: true, campaign: publicNewsletterCampaign(campaign), preflight }, 201);
  } catch (error) {
    if (error instanceof HttpError) return json({ ok: false, error: error.message }, error.status);
    console.error("Newsletter draft creation failed", error);
    return json({ ok: false, error: "The newsletter draft could not be created." }, 500);
  }
}
__name(createNewsletterDraftResponse, "createNewsletterDraftResponse");
async function newsletterPreviewResponse(env, id) {
  const campaign = await loadNewsletterCampaign(env, id);
  if (!campaign) return new Response("Newsletter campaign not found.", { status: 404 });
  const preflight = await newsletterPreflight(env, campaign, { requireDraft: false });
  const previewUrl = `${NEWSLETTER_PUBLIC_ORIGIN}${UNSUBSCRIBE_PATH}?token=PREVIEW`;
  const html = renderNewsletterHtml(campaign, {
    email: "preview@tarotflower.com",
    first_name: "Goddess",
    unsubscribe_url: previewUrl
  });
  return new Response(html, {
    headers: {
      ...securityHeaders(),
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https: data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "x-newsletter-subject": encodeURIComponent(campaign.subject),
      "x-newsletter-eligible-recipients": String(preflight.eligibleRecipientCount)
    }
  });
}
__name(newsletterPreviewResponse, "newsletterPreviewResponse");
async function approveNewsletterCampaignResponse(env, id) {
  const campaign = await loadNewsletterCampaign(env, id);
  if (!campaign) return json({ ok: false, error: "Newsletter campaign not found." }, 404);
  if (campaign.status !== "draft") {
    return json({ ok: false, error: "This campaign has already been approved or is no longer a draft." }, 409);
  }
  const preflight = await newsletterPreflight(env, campaign, { requireDraft: true });
  if (!preflight.ok) {
    return json({ ok: false, error: "Mandatory pre-send checks failed.", preflight }, 409);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const claim = await env.DB.prepare(`UPDATE newsletter_campaigns
    SET status='approving',updated_at=? WHERE id=? AND status='draft'`).bind(now, id).run();
  if (!claim.meta?.changes) {
    return json({ ok: false, error: "This campaign has already been approved." }, 409);
  }
  try {
    const eligibleCount = await eligibleNewsletterRecipientCount(env);
    const production = productionSubscriberSql("s");
    const statements = [env.DB.prepare(`INSERT OR IGNORE INTO newsletter_campaign_recipients(
      id,campaign_id,subscriber_id,email,first_name,recipient_kind,unsubscribe_token,status,next_attempt_at,created_at,updated_at
    ) SELECT ? || ':' || s.id,?,s.id,lower(trim(s.email)),coalesce(s.first_name,''),'subscriber',s.unsubscribe_token,'pending',?,?,?
      FROM subscribers s
      JOIN subscriber_tags t ON t.subscriber_id=s.id AND t.tag='list:tarot-flower-newsletter'
      WHERE s.status='active' AND lower(trim(s.email))<>? AND ${production}
        AND EXISTS (SELECT 1 FROM subscriber_consents c
          WHERE c.subscriber_id=s.id AND c.lead_magnet_slug='tarot-newsletter')
        AND s.unsubscribe_token IS NOT NULL AND s.unsubscribe_token<>''
      GROUP BY s.id,lower(trim(s.email)),s.first_name,s.unsubscribe_token`).bind(
      id, id, now, now, now, newsletterOwnerCopy(env)
    )];
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO newsletter_campaign_recipients(
      id,campaign_id,subscriber_id,email,first_name,recipient_kind,unsubscribe_token,status,next_attempt_at,created_at,updated_at
    ) VALUES (?,?,NULL,?,'Vanessa','owner',NULL,'pending',?,?,?)`).bind(
      crypto.randomUUID(), id, newsletterOwnerCopy(env), now, now, now
    ));
    statements.push(env.DB.prepare(`UPDATE newsletter_campaigns SET
      status='sending',approved_content_hash=content_hash,eligible_recipient_count=?,owner_copy_status='pending',
      approved_by='workbench-owner',approved_at=?,sending_started_at=?,updated_at=?
      WHERE id=? AND status='approving'`).bind(eligibleCount, now, now, now, id));
    statements.push(env.DB.prepare(`INSERT INTO newsletter_campaign_events(id,campaign_id,event_type,metadata_json,created_at)
      VALUES (?,?,'campaign_approved',?,?)`).bind(crypto.randomUUID(), id, JSON.stringify({
      eligible_recipient_count: eligibleCount,
      owner_copy: newsletterOwnerCopy(env),
      approval_scope: "entire_campaign"
    }), now));
    await env.DB.batch(statements);
    return json({
      ok: true,
      campaignId: id,
      status: "sending",
      eligibleRecipientCount: eligibleCount,
      ownerCopyIncluded: true,
      message: "The entire campaign was approved once and queued for automatic delivery."
    });
  } catch (error) {
    await env.DB.prepare(`UPDATE newsletter_campaigns SET status='blocked',updated_at=? WHERE id=? AND status='approving'`)
      .bind((/* @__PURE__ */ new Date()).toISOString(), id).run();
    console.error("Newsletter approval failed", error);
    return json({ ok: false, error: "The campaign could not be queued; no delivery was started." }, 500);
  }
}
__name(approveNewsletterCampaignResponse, "approveNewsletterCampaignResponse");
async function processDueNewsletterCampaigns(env) {
  const due = await allRows(env.DB.prepare(`SELECT r.id AS recipient_id,r.campaign_id
    FROM newsletter_campaign_recipients r
    JOIN newsletter_campaigns c ON c.id=r.campaign_id
    WHERE c.status='sending' AND r.status IN ('pending','retry') AND r.next_attempt_at<=?
    ORDER BY r.next_attempt_at ASC
    LIMIT ?`).bind((/* @__PURE__ */ new Date()).toISOString(), newsletterBatchSize(env)));
  const checkedCampaigns = new Map();
  for (const row of due) {
    if (!checkedCampaigns.has(row.campaign_id)) {
      const campaign = await loadNewsletterCampaign(env, row.campaign_id);
      const preflight = await newsletterPreflight(env, campaign, { requireDraft: false, includeAudience: false });
      checkedCampaigns.set(row.campaign_id, { campaign, preflight });
      if (!preflight.ok || campaign.approved_content_hash !== campaign.content_hash) {
        await blockNewsletterCampaign(env, row.campaign_id, preflight.errors.join(" ") || "Approved content changed.");
      }
    }
    const checked = checkedCampaigns.get(row.campaign_id);
    if (!checked.preflight.ok || checked.campaign.approved_content_hash !== checked.campaign.content_hash) continue;
    const claim = await env.DB.prepare(`UPDATE newsletter_campaign_recipients
      SET status='sending',attempts=attempts+1,updated_at=?
      WHERE id=? AND status IN ('pending','retry')`).bind((/* @__PURE__ */ new Date()).toISOString(), row.recipient_id).run();
    if (!claim.meta?.changes) continue;
    try {
      await sendNewsletterRecipient(env, row.recipient_id, checked.campaign);
    } catch (error) {
      console.error("Newsletter recipient delivery failed", error);
    }
    await refreshNewsletterCampaignStatus(env, row.campaign_id);
  }
}
__name(processDueNewsletterCampaigns, "processDueNewsletterCampaigns");
async function sendNewsletterRecipient(env, recipientId, campaign) {
  const recipient = await env.DB.prepare(`SELECT * FROM newsletter_campaign_recipients WHERE id=? LIMIT 1`)
    .bind(recipientId).first();
  if (!recipient || recipient.status !== "sending") return;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (recipient.recipient_kind === "subscriber" && !await subscriberStillEligibleForNewsletter(env, recipient)) {
    await env.DB.prepare(`UPDATE newsletter_campaign_recipients SET status='skipped',last_error='No longer eligible at send time.',updated_at=?
      WHERE id=? AND status='sending'`).bind(now, recipient.id).run();
    await recordNewsletterEvent(env, campaign.id, recipient.id, "recipient_skipped", { reason: "no_longer_eligible" });
    return;
  }
  const unsubscribeUrl = recipient.recipient_kind === "subscriber"
    ? createUnsubscribeUrl(env, recipient.unsubscribe_token, campaign.id)
    : `${newsletterPublicOrigin(env)}${UNSUBSCRIBE_PATH}?owner=copy`;
  const context = {
    email: recipient.email,
    first_name: recipient.first_name || "there",
    unsubscribe_url: unsubscribeUrl
  };
  try {
    const delivery = await sendSmtpEmail(env, {
      to: recipient.email,
      from: newsletterFrom(env),
      replyTo: newsletterReplyTo(env),
      subject: campaign.subject,
      html: renderNewsletterHtml(campaign, context),
      text: renderTemplate(campaign.text_template, context, false),
      headers: recipient.recipient_kind === "subscriber" ? {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
      } : {}
    });
    await env.DB.prepare(`UPDATE newsletter_campaign_recipients SET
      status='accepted',provider_message_id=?,accepted_at=?,failed_at=NULL,last_error=NULL,updated_at=?
      WHERE id=? AND status='sending'`).bind(delivery.messageId || "", now, now, recipient.id).run();
    await recordNewsletterEvent(env, campaign.id, recipient.id, "provider_accepted", {
      provider: "gmail_smtp",
      provider_message_id: delivery.messageId || "",
      recipient_kind: recipient.recipient_kind,
      inbox_placement_confirmed: false
    });
  } catch (error) {
    const message = errorMessage(error).slice(0, 500);
    if (Number(recipient.attempts) < NEWSLETTER_MAX_ATTEMPTS) {
      const retryDelayMinutes = Number(recipient.attempts) <= 1 ? 1 : 5;
      const retryAt = new Date(Date.now() + retryDelayMinutes * 60 * 1e3).toISOString();
      await env.DB.prepare(`UPDATE newsletter_campaign_recipients SET status='retry',next_attempt_at=?,last_error=?,updated_at=?
        WHERE id=? AND status='sending'`).bind(retryAt, message, now, recipient.id).run();
      await recordNewsletterEvent(env, campaign.id, recipient.id, "retry_scheduled", { retry_at: retryAt, error: message });
    } else {
      await env.DB.prepare(`UPDATE newsletter_campaign_recipients SET status='failed',failed_at=?,last_error=?,updated_at=?
        WHERE id=? AND status='sending'`).bind(now, message, now, recipient.id).run();
      await recordNewsletterEvent(env, campaign.id, recipient.id, "provider_rejected", { error: message });
    }
    throw error;
  }
}
__name(sendNewsletterRecipient, "sendNewsletterRecipient");
async function refreshNewsletterCampaignStatus(env, campaignId) {
  const counts = await env.DB.prepare(`SELECT
    SUM(CASE WHEN recipient_kind='subscriber' AND status='accepted' THEN 1 ELSE 0 END) AS accepted,
    SUM(CASE WHEN recipient_kind='subscriber' AND status='failed' THEN 1 ELSE 0 END) AS failed,
    SUM(CASE WHEN recipient_kind='subscriber' AND status='skipped' THEN 1 ELSE 0 END) AS skipped,
    SUM(CASE WHEN status IN ('pending','sending','retry') THEN 1 ELSE 0 END) AS remaining,
    MAX(CASE WHEN recipient_kind='owner' THEN status END) AS owner_status
    FROM newsletter_campaign_recipients WHERE campaign_id=?`).bind(campaignId).first();
  const accepted = Number(counts?.accepted || 0);
  const failed = Number(counts?.failed || 0);
  const skipped = Number(counts?.skipped || 0);
  const remaining = Number(counts?.remaining || 0);
  const ownerStatus = counts?.owner_status || "not_queued";
  let status = "sending";
  let completedAt = null;
  if (remaining === 0) {
    completedAt = (/* @__PURE__ */ new Date()).toISOString();
    status = failed > 0 ? (accepted > 0 ? "partial" : "failed") : "sent";
    if (ownerStatus === "failed" && status === "sent") status = "partial";
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await env.DB.prepare(`UPDATE newsletter_campaigns SET status=?,provider_accepted_count=?,failed_count=?,skipped_count=?,
    owner_copy_status=?,completed_at=COALESCE(?,completed_at),updated_at=? WHERE id=? AND status='sending'`)
    .bind(status, accepted, failed, skipped, ownerStatus, completedAt, now, campaignId).run();
}
__name(refreshNewsletterCampaignStatus, "refreshNewsletterCampaignStatus");
async function newsletterPreflight(env, campaign, options = {}) {
  const errors = [];
  const checks = [];
  const check = (name, ok, detail) => {
    checks.push({ name, ok: Boolean(ok), detail });
    if (!ok) errors.push(detail);
  };
  const sender = newsletterSenderConfiguration(env);
  check("authenticated_sender", sender.from === NEWSLETTER_FROM && sender.authorizedFrom === NEWSLETTER_FROM_EMAIL
    && sender.authenticationVerified, "Authenticated Tarot Flower sender verification is incomplete.");
  check("reply_to", sender.replyTo === NEWSLETTER_REPLY_TO, "Reply-To must be vanessa@tarotflower.com.");
  check("campaign_sender_snapshot", campaign?.from_name === NEWSLETTER_FROM_NAME
    && campaign?.from_email === NEWSLETTER_FROM_EMAIL && campaign?.reply_to === NEWSLETTER_REPLY_TO,
  "The campaign sender snapshot does not match the approved Tarot Flower identity.");
  check("smtp_credentials", Boolean(env.SMTP_USERNAME && env.SMTP_APP_PASSWORD), "Gmail SMTP credentials are not configured.");
  check("branded_unsubscribe", newsletterPublicOrigin(env) === NEWSLETTER_PUBLIC_ORIGIN
    && campaign?.html_template?.includes("{{unsubscribe_url}}")
    && campaign?.text_template?.includes("{{unsubscribe_url}}"), "A branded Tarot Flower unsubscribe link is required in HTML and text.");
  check("owner_copy", newsletterOwnerCopy(env) === NEWSLETTER_OWNER_COPY, "The automatic Vanessa owner copy is not configured.");
  if (options.requireDraft) check("draft_status", campaign?.status === "draft", "Only a draft can be approved.");
  const computedHash = campaign ? await newsletterContentHash({
    subject: campaign.subject,
    previewText: campaign.preview_text,
    htmlTemplate: campaign.html_template,
    textTemplate: campaign.text_template
  }) : "";
  check("content_integrity", Boolean(campaign && computedHash === campaign.content_hash), "Campaign content integrity check failed.");
  const duplicate = campaign ? await env.DB.prepare(`SELECT id FROM newsletter_campaigns
    WHERE id<>? AND content_hash=? AND status IN ('approving','sending','sent','partial','failed') LIMIT 1`)
    .bind(campaign.id, campaign.content_hash).first() : null;
  check("duplicate_dispatch", !duplicate, "This exact campaign content has already been approved for dispatch.");
  let eligibleRecipientCount = Number(campaign?.eligible_recipient_count || 0);
  if (options.includeAudience !== false) {
    eligibleRecipientCount = await eligibleNewsletterRecipientCount(env);
    check("eligible_audience", eligibleRecipientCount > 0, "No eligible consenting production subscribers were found.");
  }
  return { ok: errors.length === 0, checks, errors, eligibleRecipientCount };
}
__name(newsletterPreflight, "newsletterPreflight");
async function eligibleNewsletterRecipientCount(env) {
  const production = productionSubscriberSql("s");
  const row = await env.DB.prepare(`SELECT COUNT(DISTINCT lower(trim(s.email))) AS count
    FROM subscribers s
    JOIN subscriber_tags t ON t.subscriber_id=s.id AND t.tag='list:tarot-flower-newsletter'
    WHERE s.status='active' AND lower(trim(s.email))<>? AND ${production}
      AND EXISTS (SELECT 1 FROM subscriber_consents c
        WHERE c.subscriber_id=s.id AND c.lead_magnet_slug='tarot-newsletter')
      AND s.unsubscribe_token IS NOT NULL AND s.unsubscribe_token<>''`).bind(newsletterOwnerCopy(env)).first();
  return Number(row?.count || 0);
}
__name(eligibleNewsletterRecipientCount, "eligibleNewsletterRecipientCount");
async function subscriberStillEligibleForNewsletter(env, recipient) {
  const production = productionSubscriberSql("s");
  const row = await env.DB.prepare(`SELECT 1 AS eligible FROM subscribers s
    WHERE s.id=? AND lower(trim(s.email))=lower(trim(?)) AND s.status='active' AND ${production}
      AND EXISTS (SELECT 1 FROM subscriber_tags t WHERE t.subscriber_id=s.id AND t.tag='list:tarot-flower-newsletter')
      AND EXISTS (SELECT 1 FROM subscriber_consents c WHERE c.subscriber_id=s.id AND c.lead_magnet_slug='tarot-newsletter')
    LIMIT 1`).bind(recipient.subscriber_id, recipient.email).first();
  return Boolean(row?.eligible);
}
__name(subscriberStillEligibleForNewsletter, "subscriberStillEligibleForNewsletter");
async function loadNewsletterCampaign(env, id) {
  return env.DB.prepare(`SELECT * FROM newsletter_campaigns WHERE id=? LIMIT 1`).bind(clean(id)).first();
}
__name(loadNewsletterCampaign, "loadNewsletterCampaign");
function publicNewsletterCampaign(campaign) {
  if (!campaign) return null;
  const { html_template, text_template, ...publicFields } = campaign;
  return publicFields;
}
__name(publicNewsletterCampaign, "publicNewsletterCampaign");
function newsletterSenderConfiguration(env) {
  return {
    from: newsletterFrom(env),
    replyTo: newsletterReplyTo(env),
    authorizedFrom: clean(env.SMTP_AUTHORIZED_FROM).toLowerCase(),
    authenticationVerified: env.CAMPAIGN_AUTHENTICATION_VERIFIED === "true"
  };
}
__name(newsletterSenderConfiguration, "newsletterSenderConfiguration");
function newsletterFrom(env) {
  return clean(env.CAMPAIGN_FROM || NEWSLETTER_FROM);
}
__name(newsletterFrom, "newsletterFrom");
function newsletterReplyTo(env) {
  return clean(env.CAMPAIGN_REPLY_TO || NEWSLETTER_REPLY_TO).toLowerCase();
}
__name(newsletterReplyTo, "newsletterReplyTo");
function newsletterOwnerCopy(env) {
  return clean(env.CAMPAIGN_OWNER_COPY || NEWSLETTER_OWNER_COPY).toLowerCase();
}
__name(newsletterOwnerCopy, "newsletterOwnerCopy");
function newsletterPublicOrigin(env) {
  return clean(env.CAMPAIGN_PUBLIC_ORIGIN || NEWSLETTER_PUBLIC_ORIGIN).replace(/\/$/, "");
}
__name(newsletterPublicOrigin, "newsletterPublicOrigin");
function newsletterBatchSize(env) {
  const configured = Number(env.CAMPAIGN_BATCH_SIZE || NEWSLETTER_BATCH_SIZE);
  return Number.isInteger(configured) && configured >= 1 && configured <= 100 ? configured : NEWSLETTER_BATCH_SIZE;
}
__name(newsletterBatchSize, "newsletterBatchSize");
async function newsletterContentHash({ subject, previewText, htmlTemplate, textTemplate }) {
  const data = new TextEncoder().encode(JSON.stringify([subject, previewText, htmlTemplate, textTemplate]));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(newsletterContentHash, "newsletterContentHash");
function renderNewsletterHtml(campaign, context) {
  const rendered = renderTemplate(campaign.html_template, context);
  if (!campaign.preview_text) return rendered;
  const preheader = `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;color:transparent;">${escapeHtml(campaign.preview_text)}</div>`;
  return /<body\b[^>]*>/i.test(rendered)
    ? rendered.replace(/<body\b[^>]*>/i, (body) => `${body}${preheader}`)
    : `${preheader}${rendered}`;
}
__name(renderNewsletterHtml, "renderNewsletterHtml");
async function recordNewsletterEvent(env, campaignId, recipientId, eventType, metadata = {}) {
  await env.DB.prepare(`INSERT INTO newsletter_campaign_events(id,campaign_id,recipient_id,event_type,metadata_json,created_at)
    VALUES (?,?,?,?,?,?)`).bind(crypto.randomUUID(), campaignId, recipientId, eventType, JSON.stringify(metadata),
    (/* @__PURE__ */ new Date()).toISOString()).run();
}
__name(recordNewsletterEvent, "recordNewsletterEvent");
async function blockNewsletterCampaign(env, campaignId, reason) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await env.DB.prepare(`UPDATE newsletter_campaigns SET status='blocked',updated_at=? WHERE id=? AND status='sending'`)
    .bind(now, campaignId).run();
  await recordNewsletterEvent(env, campaignId, null, "campaign_blocked", { reason: String(reason).slice(0, 500) });
}
__name(blockNewsletterCampaign, "blockNewsletterCampaign");
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
  if (request.method !== "GET" && request.method !== "POST") {
    return respond(request, { ok: false, error: "Method not allowed" }, 405);
  }
  const authError = validateCampaignToken(request, env, "ADMIN_REVIEW_TOKEN");
  if (authError) {
    return respond(request, { ok: false, error: "Unauthorized." }, 403);
  }
  const email = request.method === "POST"
    ? clean((await readSubmission(request)).get("email")).toLowerCase()
    : "";
  return campaignReviewResponse(env, email);
}
__name(handleCampaignReview, "handleCampaignReview");
async function campaignReviewResponse(env, email) {
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
__name(campaignReviewResponse, "campaignReviewResponse");
async function handleUnsubscribe(request, env) {
  const url = new URL(request.url);
  const token = clean(url.searchParams.get("token"));
  const campaignId = clean(url.searchParams.get("campaign"));
  if (url.searchParams.get("owner") === "copy") {
    return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tarot Flower owner copy</title></head><body><main><h1>Tarot Flower owner copy</h1><p>This is Vanessa's automatic owner copy. It is separate from the subscriber list and does not change consent or campaign statistics.</p></main></body></html>`, {
      headers: { ...securityHeaders(), "content-type": "text/html; charset=utf-8" }
    });
  }
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
  await env.DB.batch([env.DB.prepare(`
    UPDATE subscribers
    SET status = 'unsubscribed', unsubscribed_at = ?, updated_at = ?
    WHERE id = ?
  `).bind(now, now, subscriber.id),
    env.DB.prepare(`UPDATE ecosystem_email_consents SET status='withdrawn',withdrawn_at=COALESCE(withdrawn_at,?)
      WHERE subscriber_id=? AND status='granted'`).bind(now, subscriber.id)]);
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
  if (campaignId) {
    const campaignRecipient = await env.DB.prepare(`SELECT id FROM newsletter_campaign_recipients
      WHERE campaign_id=? AND subscriber_id=? AND recipient_kind='subscriber' LIMIT 1`)
      .bind(campaignId, subscriber.id).first();
    if (campaignRecipient) {
      const recorded = await env.DB.prepare(`SELECT 1 AS recorded FROM newsletter_campaign_events
        WHERE campaign_id=? AND recipient_id=? AND event_type='unsubscribed' LIMIT 1`)
        .bind(campaignId, campaignRecipient.id).first();
      if (!recorded) {
        await env.DB.batch([
          env.DB.prepare(`INSERT INTO newsletter_campaign_events(id,campaign_id,recipient_id,event_type,metadata_json,created_at)
            VALUES (?,?,?,'unsubscribed',?,?)`).bind(crypto.randomUUID(), campaignId, campaignRecipient.id,
            JSON.stringify({ source: "campaign_unsubscribe_link" }), now),
          env.DB.prepare(`UPDATE newsletter_campaigns SET unsubscribe_count=unsubscribe_count+1,updated_at=? WHERE id=?`)
            .bind(now, campaignId)
        ]);
      }
    }
  }
  return unsubscribeResponse(request, true, "You have been unsubscribed.", 200);
}
__name(handleUnsubscribe, "handleUnsubscribe");
async function loadCampaignReviewData(env, email) {
  const production = productionSubscriberSql("s");
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
      SELECT s.status, COUNT(*) AS count
      FROM subscribers s
      WHERE ${production}
      GROUP BY s.status
      ORDER BY s.status
    `)),
    allRows(env.DB.prepare(`
      SELECT d.status, COUNT(*) AS count
      FROM subscriber_sequence_step_deliveries d
      JOIN subscribers s ON s.id=d.subscriber_id
      WHERE ${production}
      GROUP BY d.status
      ORDER BY d.status
    `)),
    allRows(env.DB.prepare(`
      SELECT e.event_type, COUNT(*) AS count
      FROM subscriber_events e
      JOIN subscribers s ON s.id=e.subscriber_id
      WHERE ${production}
      GROUP BY e.event_type
      ORDER BY e.event_type
    `)),
    env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM subscriber_sequence_step_deliveries d
      JOIN email_sequence_steps step ON step.id = d.step_id
      JOIN email_sequences seq ON seq.id = d.sequence_id
      JOIN subscribers s ON s.id = d.subscriber_id
      WHERE d.status = 'pending'
        AND step.slug = ?
        AND seq.slug = ?
        AND ${production}
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
      WHERE d.status = 'pending' AND ${production}
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
      WHERE d.status IN ('sent', 'failed', 'canceled') AND ${production}
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
async function businessOverviewResponse(env) {
  const production = productionSubscriberSql("s");
  const nonProduction = `NOT (${production})`;
  const [summary, recentSignups, oracleWaitlist, newsletterAudience, attention, classifications, qaRecords] = await Promise.all([
    env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM subscribers s WHERE s.status='active' AND ${production}) AS activeSubscribers,
      (SELECT COUNT(DISTINCT t.subscriber_id) FROM subscriber_tags t JOIN subscribers s ON s.id=t.subscriber_id
        WHERE t.tag='list:tarot-flower-newsletter' AND s.status='active' AND ${production}
          AND EXISTS (SELECT 1 FROM subscriber_consents c WHERE c.subscriber_id=s.id AND c.lead_magnet_slug='tarot-newsletter')) AS newsletter,
      (SELECT COUNT(DISTINCT t.subscriber_id) FROM subscriber_tags t JOIN subscribers s ON s.id=t.subscriber_id
        WHERE t.tag=?1 AND s.status='active' AND ${production}
          AND EXISTS (SELECT 1 FROM subscriber_consents c WHERE c.subscriber_id=s.id AND c.lead_magnet_slug='goddess-embodiment-guide')) AS goddessGuide,
      (SELECT COUNT(DISTINCT t.subscriber_id) FROM subscriber_tags t JOIN subscribers s ON s.id=t.subscriber_id
        WHERE t.tag='interest:sacred-becoming-oracle' AND s.status='active' AND ${production}
          AND EXISTS (SELECT 1 FROM subscriber_consents c WHERE c.subscriber_id=s.id AND c.lead_magnet_slug='oracle-waitlist')) AS oracleWaitlist,
      (SELECT COUNT(*) FROM subscribers s WHERE s.created_at >= datetime('now','-30 days') AND ${production}) AS newLeads30d,
      (SELECT COUNT(*) FROM subscriber_consents c JOIN subscribers s ON s.id=c.subscriber_id
        WHERE c.consented_at >= datetime('now','-30 days') AND ${production}) AS consentActivity30d`)
      .bind(GODDESS_GUIDE_TAG).first(),
    allRows(env.DB.prepare(`SELECT s.email,s.first_name,s.status,c.lead_magnet_slug,c.source_path,c.consented_at
      FROM subscriber_consents c JOIN subscribers s ON s.id=c.subscriber_id
      WHERE ${production} ORDER BY c.consented_at DESC LIMIT 25`)),
    allRows(env.DB.prepare(`SELECT s.email,s.first_name,s.status,c.source_path,c.consented_at
      FROM subscriber_consents c JOIN subscribers s ON s.id=c.subscriber_id
      WHERE c.lead_magnet_slug='oracle-waitlist' AND s.status='active' AND ${production}
      ORDER BY c.consented_at DESC LIMIT 50`)),
    allRows(env.DB.prepare(`SELECT DISTINCT s.id,s.email,s.first_name,s.status
      FROM subscribers s
      JOIN subscriber_consents c ON c.subscriber_id=s.id AND c.lead_magnet_slug='tarot-newsletter'
      JOIN subscriber_tags t ON t.subscriber_id=s.id AND t.tag='list:tarot-flower-newsletter'
      WHERE s.status='active' AND ${production}
      ORDER BY s.email`)),
    env.DB.prepare(`SELECT
      SUM(CASE WHEN d.status='failed' AND ${production}
        AND coalesce(d.failed_at,d.updated_at,d.created_at) >= datetime('now','-30 days') THEN 1 ELSE 0 END) AS activeProductionFailedDeliveries,
      SUM(CASE WHEN d.status='failed' AND ${production}
        AND coalesce(d.failed_at,d.updated_at,d.created_at) < datetime('now','-30 days') THEN 1 ELSE 0 END) AS historicalProductionFailedDeliveries,
      SUM(CASE WHEN d.status='failed' AND ${nonProduction} THEN 1 ELSE 0 END) AS testFailedDeliveries,
      SUM(CASE WHEN d.status='pending' AND d.due_at < datetime('now') AND ${production} THEN 1 ELSE 0 END) AS overdueProductionDeliveries
      FROM subscriber_sequence_step_deliveries d JOIN subscribers s ON s.id=d.subscriber_id`).first(),
    allRows(env.DB.prepare(`SELECT coalesce(ac.classification,'review') AS classification,COUNT(*) AS count
      FROM subscribers s LEFT JOIN subscriber_activity_classifications ac ON ac.subscriber_id=s.id
      GROUP BY coalesce(ac.classification,'review') ORDER BY classification`)),
    allRows(env.DB.prepare(`SELECT s.email,s.first_name,s.status,coalesce(ac.classification,'review') AS classification,
        coalesce(ac.reason_code,'unclassified') AS reason_code,s.created_at
      FROM subscribers s LEFT JOIN subscriber_activity_classifications ac ON ac.subscriber_id=s.id
      WHERE ${nonProduction} ORDER BY s.created_at DESC LIMIT 100`)),
  ]);
  return new Response(JSON.stringify({
    summary: summary || {},
    recentSignups,
    oracleWaitlist,
    newsletterAudience,
    attention: attention || {},
    qaDebug: { classifications, records: qaRecords },
  }), {
    headers: {
      ...securityHeaders(),
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store, max-age=0',
    },
  });
}
__name(businessOverviewResponse, "businessOverviewResponse");
function productionSubscriberSql(alias) {
  return `EXISTS (SELECT 1 FROM subscriber_activity_classifications ac
    WHERE ac.subscriber_id=${alias}.id AND ac.classification='production')`;
}
__name(productionSubscriberSql, "productionSubscriberSql");
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
  const site = clean(form.get("site")) || "tarot-flower";
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
  if (!["tarot-flower", "goddess-yoga-retreats"].includes(site)) {
    return { ok: false, error: "Invalid submission." };
  }
  return { ok: true, value: { name, email, message, site } };
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
function validateNewsletter(form, request) {
  const email = clean(form.get("email")).toLowerCase();
  const firstName = clean(form.get("first_name") || form.get("firstName"));
  const consent = clean(form.get("consent")).toLowerCase();
  const site = clean(form.get("site"));
  const destinationInterest = clean(form.get("destination_interest") || form.get("destinationInterest"));
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
    return { ok: false, error: "Please agree before joining the list." };
  }
  if (site !== "goddess-yoga-retreats") {
    return { ok: false, error: "Invalid newsletter source." };
  }
  if (destinationInterest && !GYR_DESTINATION_INTERESTS.has(destinationInterest)) {
    return { ok: false, error: "Invalid destination interest." };
  }
  return {
    ok: true,
    value: {
      email,
      firstName,
      sourcePath: `https://goddess-yoga-retreats.com${sourcePath}`,
      destinationInterest,
      consentText: GYR_NEWSLETTER_CONSENT_TEXT
    }
  };
}
__name(validateNewsletter, "validateNewsletter");
async function saveLeadMagnetSubscriber(env, lead, request) {
  if (!env.DB?.prepare) throw new Error("Missing DB D1 binding");
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO subscribers(id,email,first_name,status,unsubscribe_token,created_at,updated_at)
      SELECT ?,?,?,'active',?,?,? WHERE NOT EXISTS (SELECT 1 FROM subscribers WHERE lower(trim(email))=?)`)
      .bind(crypto.randomUUID(),lead.email,lead.firstName,createOpaqueToken(),now,now,lead.email),
    env.DB.prepare(`UPDATE subscribers SET first_name=COALESCE(NULLIF(?,''),first_name),
      status=CASE WHEN status='suppressed' THEN 'suppressed' ELSE 'active' END,
      unsubscribed_at=CASE WHEN status='suppressed' THEN unsubscribed_at ELSE NULL END,
      unsubscribe_token=COALESCE(NULLIF(unsubscribe_token,''),?),updated_at=? WHERE lower(trim(email))=?`)
      .bind(lead.firstName,createOpaqueToken(),now,lead.email),
  ]);
  const subscriber = await env.DB.prepare("SELECT id FROM subscribers WHERE lower(trim(email))=? LIMIT 1").bind(lead.email).first();
  const subscriberId = subscriber.id;
  await recordSubscriberActivityClassification(env, subscriberId, request, {
    route: "/api/lead-magnet",
    sourcePath: lead.sourcePath
  });
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
async function saveNewsletterSubscriber(env, subscriber, request) {
  if (!env.DB || typeof env.DB.prepare !== "function") {
    throw new Error("Missing DB D1 binding");
  }
  const existing = await env.DB.prepare(
    "SELECT id, first_name, status, unsubscribe_token FROM subscribers WHERE lower(email) = ? LIMIT 1"
  ).bind(subscriber.email).first();
  const subscriberId = existing?.id || crypto.randomUUID();
  const firstName = subscriber.firstName || existing?.first_name || "";
  const unsubscribeToken = existing?.unsubscribe_token || createOpaqueToken();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (existing) {
    const nextStatus = existing.status === "suppressed" ? "suppressed" : "active";
    await env.DB.prepare(`
      UPDATE subscribers
      SET first_name = ?, status = ?, unsubscribed_at = CASE WHEN ? = 'active' THEN NULL ELSE unsubscribed_at END,
        unsubscribe_token = COALESCE(NULLIF(unsubscribe_token, ''), ?), updated_at = ?
      WHERE id = ?
    `).bind(firstName, nextStatus, nextStatus, unsubscribeToken, now, subscriberId).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO subscribers (
        id, email, first_name, status, unsubscribe_token, created_at, updated_at
      ) VALUES (?, ?, ?, 'active', ?, ?, ?)
    `).bind(subscriberId, subscriber.email, firstName, unsubscribeToken, now, now).run();
  }
  await recordSubscriberActivityClassification(env, subscriberId, request, {
    route: "/api/newsletter",
    sourcePath: subscriber.sourcePath
  });
  await env.DB.prepare(`
    INSERT INTO subscriber_consents (
      id, subscriber_id, consent_text, source_path, lead_magnet_slug,
      ip, user_agent, consented_at
    ) VALUES (?, ?, ?, ?, 'newsletter', ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    subscriberId,
    subscriber.consentText,
    subscriber.sourcePath,
    request.headers.get("CF-Connecting-IP") || "",
    request.headers.get("user-agent") || "",
    now
  ).run();
  const tags = [GYR_NEWSLETTER_SOURCE_TAG, ECOSYSTEM_SUBSCRIBER_TAG];
  if (subscriber.destinationInterest) tags.push(`interest:gyr-destination:${subscriber.destinationInterest}`);
  for (const tag of tags) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO subscriber_tags (subscriber_id, tag, created_at) VALUES (?, ?, ?)"
    ).bind(subscriberId, tag, now).run();
  }
  await recordSubscriberEvent(env, subscriberId, "newsletter_subscribed", {
    source: "goddess-yoga-retreats",
    source_path: subscriber.sourcePath,
    ...(subscriber.destinationInterest ? { destination_interest: subscriber.destinationInterest } : {})
  });
  return subscriberId;
}
__name(saveNewsletterSubscriber, "saveNewsletterSubscriber");
async function recordSubscriberActivityClassification(env, subscriberId, request, provenance) {
  const requested = clean(request.headers.get(ACTIVITY_CLASSIFICATION_HEADER)).toLowerCase();
  let classification = "production";
  let reasonCode = "verified_public_signup";
  let classifiedBy = "signup-ingress";
  if (requested) {
    if (!new Set(["qa", "test"]).has(requested)) {
      throw new HttpError("Invalid activity classification.", 400);
    }
    const expected = clean(env.QA_RECORD_TOKEN);
    const supplied = clean(request.headers.get(ACTIVITY_CLASSIFICATION_TOKEN_HEADER));
    if (!expected || !supplied || !constantTimeEqual(supplied, expected)) {
      throw new HttpError("Invalid QA activity credentials.", 403);
    }
    classification = requested;
    reasonCode = "authenticated_internal_signup";
    classifiedBy = "authenticated-qa-ingress";
  }
  const now = new Date().toISOString();
  const evidence = JSON.stringify({
    route: provenance.route,
    source_path: provenance.sourcePath,
    origin: request.headers.get("origin") || ""
  });
  await env.DB.prepare(`INSERT INTO subscriber_activity_classifications
    (subscriber_id,classification,reason_code,evidence,classified_at,classified_by)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(subscriber_id) DO UPDATE SET
      classification=CASE
        WHEN subscriber_activity_classifications.classification='production' THEN 'production'
        WHEN excluded.classification='production' THEN 'production'
        ELSE excluded.classification
      END,
      reason_code=CASE
        WHEN subscriber_activity_classifications.classification='production' THEN subscriber_activity_classifications.reason_code
        WHEN excluded.classification='production' THEN excluded.reason_code
        ELSE excluded.reason_code
      END,
      evidence=CASE
        WHEN subscriber_activity_classifications.classification='production' THEN subscriber_activity_classifications.evidence
        ELSE excluded.evidence
      END,
      classified_at=CASE
        WHEN subscriber_activity_classifications.classification='production' THEN subscriber_activity_classifications.classified_at
        ELSE excluded.classified_at
      END,
      classified_by=CASE
        WHEN subscriber_activity_classifications.classification='production' THEN subscriber_activity_classifications.classified_by
        ELSE excluded.classified_by
      END`)
    .bind(subscriberId, classification, reasonCode, evidence, now, classifiedBy).run();
}
__name(recordSubscriberActivityClassification, "recordSubscriberActivityClassification");
async function enrollGoddessGuideWelcomeSequence(env, subscriberId, lead, sequenceSlug = GODDESS_GUIDE_SEQUENCE_SLUG, triggerTag = GODDESS_GUIDE_TAG) {
  const sequence = await env.DB.prepare(
    "SELECT id, slug FROM email_sequences WHERE slug = ? AND trigger_tag = ? AND status = 'active' LIMIT 1"
  ).bind(sequenceSlug, triggerTag).first();
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
    triggerTag,
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
  return Boolean(result.meta?.changes);
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
  assertSmtpConfigured(env);
  const from = env.TAROT_FROM || DEFAULT_TAROT_FROM;
  const brand = submission.site === "goddess-yoga-retreats" ? "Goddess Yoga Retreats" : "Tarot Flower";
  const subject = `${brand} contact form: ${submission.name}`;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";
  const submittedAt = (/* @__PURE__ */ new Date()).toISOString();
  const text = [
    `New ${brand} contact form submission`,
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
  const delivery = await sendSmtpEmail(env, {
    to: RECIPIENT,
    from,
    replyTo: submission.email,
    subject,
    text
  });
  console.log("Contact email accepted by Google Workspace SMTP", {
    recipient: RECIPIENT,
    messageId: delivery.messageId
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
    "seq.status = 'active'",
    "step.status = 'active'",
    "seq.slug IN ('goddess-guide-welcome', 'oracle-waitlist-welcome', 'tarot-newsletter-welcome')",
    "step.slug = ?"
  ];
  const params = [stepSlug];
  if (!['guide-fulfillment', 'related-rituals-resources', 'sacred-becoming-oracle-introduction', 'oracle-confirmation', 'newsletter-welcome'].includes(stepSlug)) {
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
      s.email AS recipient_email,
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
  assertSmtpConfigured(env);
  assertAuthenticatedNewsletterSender(env);
  if (!delivery.subject || !delivery.html_template || !delivery.text_template) {
    throw new HttpError("Campaign step is missing email content.", 500);
  }
  const unsubscribeToken = delivery.unsubscribe_token || await ensureSubscriberUnsubscribeToken(
    env,
    delivery.subscriber_id
  );
  const guideDownloadUrl = delivery.step_slug === GODDESS_GUIDE_FULFILLMENT_STEP_SLUG ? await createGuideDownloadUrl(request, env, {
    ttlSeconds: GUIDE_EMAIL_DOWNLOAD_TOKEN_TTL_SECONDS,
    purpose: "guide_email",
    subscriberId: delivery.subscriber_id,
    absolute: true
  }) : "";
  const unsubscribeUrl = createUnsubscribeUrl(env, unsubscribeToken);
  const context = {
    email: delivery.recipient_email,
    first_name: delivery.first_name || "there",
    guide_download_url: guideDownloadUrl,
    unsubscribe_url: unsubscribeUrl
  };
  const html = renderTemplate(delivery.html_template, context);
  const text = renderTemplate(delivery.text_template, context, false);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  try {
    await sendSmtpEmail(env, {
      to: delivery.recipient_email,
      from: env.CAMPAIGN_FROM || env.TAROT_FROM || DEFAULT_TAROT_FROM,
      replyTo: env.CAMPAIGN_REPLY_TO || env.TAROT_REPLY_TO || DEFAULT_TAROT_REPLY_TO,
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
    const attemptNumber = Number(delivery.attempts || 0) + 1;
    if (isRetryableSmtpAuthFailure(error) && attemptNumber < 3) {
      const retryAt = new Date(Date.now() + 60 * 1e3).toISOString();
      await env.DB.prepare(`
        UPDATE subscriber_sequence_step_deliveries
        SET status = 'pending', due_at = ?, failed_at = NULL, last_error = ?, updated_at = ?
        WHERE id = ? AND status = 'sending'
      `).bind(retryAt, message.slice(0, 500), failedAt, delivery.delivery_id).run();
      await recordSubscriberEvent(env, delivery.subscriber_id, "email_retry_scheduled", {
        sequence_slug: delivery.sequence_slug,
        step_slug: delivery.step_slug,
        lead_magnet_slug: GODDESS_GUIDE_LEAD_MAGNET_SLUG,
        subject: delivery.subject,
        attempt: attemptNumber,
        retry_at: retryAt,
        error: message.slice(0, 500)
      });
      return {
        deliveryId: delivery.delivery_id,
        subscriberId: delivery.subscriber_id,
        stepSlug: delivery.step_slug,
        retryScheduled: true
      };
    }
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
function assertSmtpConfigured(env) {
  if (!env.SMTP_USERNAME) {
    throw new Error("Missing SMTP_USERNAME secret");
  }
  if (!env.SMTP_APP_PASSWORD) {
    throw new Error("Missing SMTP_APP_PASSWORD secret");
  }
}
__name(assertSmtpConfigured, "assertSmtpConfigured");
function assertAuthenticatedNewsletterSender(env) {
  const sender = newsletterSenderConfiguration(env);
  if (sender.from !== NEWSLETTER_FROM || sender.replyTo !== NEWSLETTER_REPLY_TO
    || sender.authorizedFrom !== NEWSLETTER_FROM_EMAIL || !sender.authenticationVerified) {
    throw new Error("Authenticated Tarot Flower newsletter sender verification is incomplete");
  }
}
__name(assertAuthenticatedNewsletterSender, "assertAuthenticatedNewsletterSender");
async function sendSmtpEmail(env, message) {
  // Private local preview binding; absent from production configuration.
  if (env.EMAIL_PREVIEW?.fetch) {
    const response = await env.EMAIL_PREVIEW.fetch("https://preview.internal", {method:"POST",
      headers:{"content-type":"application/json"},body:JSON.stringify(message)});
    if (!response.ok) throw new Error("Email preview failed");
    return {messageId:"local-preview"};
  }
  assertSmtpConfigured(env);
  try {
    return await sendSmtpEmailAttempt(env, message);
  } catch (error) {
    if (!isRetryableSmtpAuthFailure(error)) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1e3));
    return sendSmtpEmailAttempt(env, message);
  }
}
__name(sendSmtpEmail, "sendSmtpEmail");
function isRetryableSmtpAuthFailure(error) {
  return /SMTP authentication returned 535/i.test(errorMessage(error));
}
__name(isRetryableSmtpAuthFailure, "isRetryableSmtpAuthFailure");
async function sendSmtpEmailAttempt(env, message) {
  const smtpUsername = env.SMTP_USERNAME.trim();
  const smtpPassword = env.SMTP_APP_PASSWORD.replace(/\s+/g, "");
  const socket = connect(
    { hostname: "smtp.gmail.com", port: 465 },
    { secureTransport: "on" }
  );
  const reader = socket.readable.getReader();
  const writer = socket.writable.getWriter();
  const smtp = createSmtpReader(reader);
  try {
    await withSmtpTimeout(socket.opened, "connect");
    await expectSmtp(smtp, [220], "greeting");
    await writeSmtp(writer, "EHLO tarotflower.com\r\n");
    await expectSmtp(smtp, [250], "EHLO");
    await writeSmtp(writer, "AUTH LOGIN\r\n");
    await expectSmtp(smtp, [334], "AUTH LOGIN");
    await writeSmtp(writer, `${btoa(smtpUsername)}\r\n`);
    await expectSmtp(smtp, [334], "SMTP username");
    await writeSmtp(writer, `${btoa(smtpPassword)}\r\n`);
    await expectSmtp(smtp, [235], "SMTP authentication");
    const envelopeFrom = smtpAddress(message.from, "from");
    const envelopeTo = smtpAddress(message.to, "to");
    await writeSmtp(writer, `MAIL FROM:<${envelopeFrom}>\r\n`);
    await expectSmtp(smtp, [250], "MAIL FROM");
    await writeSmtp(writer, `RCPT TO:<${envelopeTo}>\r\n`);
    await expectSmtp(smtp, [250, 251], "RCPT TO");
    await writeSmtp(writer, "DATA\r\n");
    await expectSmtp(smtp, [354], "DATA");
    await writeSmtp(writer, `${dotStuff(buildMimeMessage(message))}\r\n.\r\n`);
    const accepted = await expectSmtp(smtp, [250], "message delivery");
    await writeSmtp(writer, "QUIT\r\n");
    await expectSmtp(smtp, [221], "QUIT");
    return { messageId: smtpMessageId(accepted.text) };
  } catch (error) {
    throw new Error(`Google Workspace SMTP failed: ${errorMessage(error)}`);
  } finally {
    try {
      reader.releaseLock();
      writer.releaseLock();
      await socket.close();
    } catch {
    }
  }
}
__name(sendSmtpEmailAttempt, "sendSmtpEmailAttempt");
function createSmtpReader(reader) {
  const decoder = new TextDecoder();
  let buffer = "";
  async function readLine() {
    while (!buffer.includes("\n")) {
      const result = await withSmtpTimeout(reader.read(), "SMTP response");
      if (result.done) {
        throw new Error("SMTP connection closed unexpectedly");
      }
      buffer += decoder.decode(result.value, { stream: true });
    }
    const newline = buffer.indexOf("\n");
    const line = buffer.slice(0, newline).replace(/\r$/, "");
    buffer = buffer.slice(newline + 1);
    return line;
  }
  return { readLine };
}
__name(createSmtpReader, "createSmtpReader");
async function expectSmtp(smtp, allowedCodes, stage) {
  const lines = [];
  let code = 0;
  while (true) {
    const line = await smtp.readLine();
    lines.push(line);
    const match = /^(\d{3})([ -])/.exec(line);
    if (!match) {
      throw new Error(`SMTP ${stage} returned malformed response: ${lines.join(" | ")}`);
    }
    code = Number(match[1]);
    if (match[2] === " ") {
      break;
    }
  }
  const text = lines.join(" | ");
  if (!allowedCodes.includes(code)) {
    throw new Error(`SMTP ${stage} returned ${code}: ${text}`);
  }
  return { code, text };
}
__name(expectSmtp, "expectSmtp");
async function writeSmtp(writer, value) {
  await withSmtpTimeout(writer.write(new TextEncoder().encode(value)), "SMTP write");
}
__name(writeSmtp, "writeSmtp");
async function withSmtpTimeout(promise, stage) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`SMTP ${stage} timed out`)), 15e3);
      })
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
__name(withSmtpTimeout, "withSmtpTimeout");
function smtpAddress(value, field) {
  const raw = typeof value === "string" ? value : value?.email;
  const match = /<([^<>]+)>/.exec(raw || "");
  const email = (match ? match[1] : raw || "").trim();
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)) {
    throw new Error(`Invalid SMTP ${field} address`);
  }
  return email;
}
__name(smtpAddress, "smtpAddress");
function buildMimeMessage(message) {
  const boundary = `tarotflower-${crypto.randomUUID()}`;
  const headers = [
    `From: ${safeHeader(message.from)}`,
    `To: ${safeHeader(message.to)}`,
    message.replyTo ? `Reply-To: ${safeHeader(message.replyTo)}` : "",
    `Subject: ${mimeHeader(message.subject)}`,
    `Date: ${(/* @__PURE__ */ new Date()).toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@tarotflower.com>`,
    "MIME-Version: 1.0",
    ...safeAdditionalHeaders(message.headers)
  ].filter(Boolean);
  if (message.html) {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    return [
      ...headers,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(message.text || ""),
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(message.html),
      `--${boundary}--`
    ].join("\r\n");
  }
  headers.push('Content-Type: text/plain; charset="UTF-8"');
  headers.push("Content-Transfer-Encoding: base64");
  return [...headers, "", wrapBase64(message.text || "")].join("\r\n");
}
__name(buildMimeMessage, "buildMimeMessage");
function safeAdditionalHeaders(headers) {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return [];
  const allowed = new Set(["List-Unsubscribe", "List-Unsubscribe-Post"]);
  return Object.entries(headers).map(([name, value]) => {
    if (!allowed.has(name) || /[\r\n:]/.test(name)) throw new Error("Invalid SMTP header name");
    return `${name}: ${safeHeader(String(value))}`;
  });
}
__name(safeAdditionalHeaders, "safeAdditionalHeaders");
function safeHeader(value) {
  const text = typeof value === "string" ? value : value?.email;
  if (!text || /[\r\n]/.test(text)) {
    throw new Error("Invalid SMTP header value");
  }
  return text;
}
__name(safeHeader, "safeHeader");
function mimeHeader(value) {
  const text = safeHeader(String(value || ""));
  if (/^[\x20-\x7E]*$/.test(text)) {
    return text;
  }
  return `=?UTF-8?B?${utf8Base64(text)}?=`;
}
__name(mimeHeader, "mimeHeader");
function utf8Base64(value) {
  const bytes = new TextEncoder().encode(String(value));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
__name(utf8Base64, "utf8Base64");
function wrapBase64(value) {
  return utf8Base64(value).replace(/.{1,76}/g, "$&\r\n").replace(/\r\n$/, "");
}
__name(wrapBase64, "wrapBase64");
function dotStuff(value) {
  return value.replace(/(^|\r\n)\./g, "$1..");
}
__name(dotStuff, "dotStuff");
function smtpMessageId(responseText) {
  const match = /\bOK\s+([A-Za-z0-9_-]+)\b/i.exec(responseText);
  return match?.[1] || responseText;
}
__name(smtpMessageId, "smtpMessageId");
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
function renderTemplate(template, context, html = true) {
  return String(template || "").replace(/\{\{([a-z0-9_]+)\}\}/gi, (_, key) => {
    return html ? escapeHtml(context[key] || "") : String(context[key] || "");
  });
}
__name(renderTemplate, "renderTemplate");
function createUnsubscribeUrl(env, token, campaignId = "") {
  const url = new URL(UNSUBSCRIBE_PATH, newsletterPublicOrigin(env));
  url.searchParams.set("token", token);
  if (campaignId) url.searchParams.set("campaign", campaignId);
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
    .table-scroll { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
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
      <form method="post" action="/api/admin/campaign/review">
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
  return `<div class="table-scroll" tabindex="0"><table>
    <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
    <tbody>
      ${rows.map((row) => `<tr>${keys.map((key) => `<td>${formatCell(row[key])}</td>`).join("")}</tr>`).join("")}
    </tbody>
  </table></div>`;
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
  if (!["https://tarotflower.com", "https://www.tarotflower.com", "https://goddess-yoga-retreats.com", "https://www.goddess-yoga-retreats.com"].includes(origin)) {
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
  LibraryEmailService,
  worker_default as default
};
//# sourceMappingURL=worker.js.map
