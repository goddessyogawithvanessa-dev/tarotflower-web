import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('public desktop, mobile, and footer navigation use the durable My Library doorway', async () => {
  const base = await read('src/layouts/Base.astro');
  assert.equal((base.match(/href="\/library\/">MY LIBRARY<\/a>/g) || []).length, 2);
  assert.match(base, /href="\/library\/">My Library<\/a>/);
  assert.doesNotMatch(base, /href="\/library\/login\/">My (?:Ritual )?Library<\/a>/);
});

test('customer-facing library copy uses My Library while preserving ritual-specific language', async () => {
  const paths = [
    'src/components/LibraryHeader.astro',
    'src/pages/library/index.astro',
    'src/pages/library/login.astro',
    'src/pages/library/setup.astro',
    'src/pages/library/forgot.astro',
    'src/pages/library/rituals/step-into-your-fire.astro',
    'src/pages/step-into-your-fire.astro',
    'public/scripts/library-login.js',
    'public/scripts/library-password.js',
    'worker/email-service/index.js',
    'worker/email-service/tarot-email-suite.js',
  ];
  const contents = await Promise.all(paths.map(read));
  for (const [index, content] of contents.entries()) {
    assert.doesNotMatch(content, /My Rituals|My Ritual Library/i, paths[index]);
  }
  assert.match(contents[5], /Step Into Your Fire/);
  assert.match(contents[5], /Return to My Library/);
});

test('one unified consent interface controls optional services and persists for six months', async () => {
  const consent = await read('src/components/GoogleAnalytics.astro');
  assert.equal((consent.match(/id="privacy-consent"/g) || []).length, 1);
  assert.match(consent, /data-consent-action="accept">Accept all/);
  assert.match(consent, /data-consent-action="reject">Reject non-essential/);
  assert.match(consent, /data-consent-action="preferences"/);
  assert.match(consent, /data-consent-preference="analytics"/);
  assert.match(consent, /data-consent-preference="pinterest"/);
  assert.match(consent, /const key = 'tf_consent_v2'/);
  assert.match(consent, /const maxAge = 15552000/);
  assert.match(consent, /navigator\.globalPrivacyControl/);
  assert.match(consent, /navigator\.doNotTrack/);
  assert.match(consent, /PUBLIC_PINTEREST_TAG_ID/);
  assert.match(consent, /2613107381993/);
  assert.match(consent, /tf_pinterest_consent/);
});

test('Pinterest purchase measurement uses a public bridge while private pages remain tracker-free', async () => {
  const bridge = await read('src/pages/fire-purchase-complete.astro');
  const pinterest = await read('public/scripts/pinterest.js');
  const worker = await read('worker/index.js');
  assert.match(bridge, /noindex=\{true\}/);
  assert.match(bridge, /tf:pinterest-purchase/);
  assert.match(pinterest, /\/fire-purchase-complete/);
  assert.match(pinterest, /sessionStorage\.setItem\(seen/);
  assert.match(worker, /tf_pinterest_receipt=.*Max-Age=600/);
});

test('private account pages stay free of marketing tracking and consent panels', async () => {
  for (const path of [
    'src/pages/library/index.astro',
    'src/pages/library/login.astro',
    'src/pages/library/setup.astro',
    'src/pages/library/forgot.astro',
  ]) {
    assert.match(await read(path), /enableMarketingTracking=\{false\}/, path);
  }
  const ritualLayout = await read('src/layouts/RitualExperience.astro');
  assert.doesNotMatch(ritualLayout, /GoogleAnalytics|pinterest\.js|privacy-consent/);
});

test('FIRE offers the same Stripe checkout near the hero and at the closing CTA', async () => {
  const page = await read('src/pages/step-into-your-fire.astro');
  const rituals = await read('src/data/ritualExperiences.ts');
  const stripeHref = rituals.match(/purchaseHref: '(https:\/\/buy\.stripe\.com\/[^']+)'/)?.[1];
  assert.ok(stripeHref, 'FIRE Stripe checkout URL is configured');
  assert.equal((page.match(/href=\{fireRitual\.purchaseHref\}/g) || []).length, 2);
  assert.equal((page.match(/data-pinterest-fire-checkout/g) || []).length, 2);
  assert.match(page, /fire-hero-offer/);
  assert.match(page, /fire-product-subtitle[\s\S]*fire-hero-offer[\s\S]*fire-offer-icons/);
  assert.match(page, /BEGIN THE RITUAL/);
  assert.match(page, /\{fireRitual\.priceLabel\}/);
  assert.match(page, /One-time purchase · Permanent access/);
  assert.match(stripeHref, /^https:\/\/buy\.stripe\.com\//);
});
