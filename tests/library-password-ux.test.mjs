import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { passwordError } from '../worker/circle/passwords.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('private library pages disable marketing tracking', async () => {
  for (const path of ['src/pages/library/index.astro', 'src/pages/library/login.astro',
    'src/pages/library/setup.astro', 'src/pages/library/forgot.astro']) {
    assert.match(await read(path), /enableMarketingTracking=\{false\}/, path);
  }
  assert.doesNotMatch(await read('src/layouts/RitualExperience.astro'), /GoogleAnalytics|pinterest\.js/);
});

test('login and recovery use password-manager-friendly fields', async () => {
  const login = await read('src/pages/library/login.astro');
  assert.match(login, /autocomplete="email"/);
  assert.match(login, /autocomplete="current-password"/);
  assert.match(login, /Forgot Password\?/);
  const setup = await read('src/pages/library/setup.astro');
  assert.equal((setup.match(/autocomplete="new-password"/g) || []).length, 2);
  assert.match(setup, /Create My Account/i);
  assert.match(setup, /Almost there! Please check your email\./);
  assert.match(setup, /VERIFY MY EMAIL/);
  assert.match(setup, /Resend Verification Email/i);
  assert.match(login, /New here\?/);
  assert.match(login, /Create your account/i);
  assert.equal((setup.match(/minlength="10"/g) || []).length, 2);
  assert.match(setup, /Use at least 10 characters/);
  assert.match(setup, /library-password-policy\.js/);
  const recovery = await read('src/pages/library/forgot.astro');
  assert.equal((recovery.match(/minlength="10"/g) || []).length, 2);
  assert.match(recovery, /Use at least 10 characters/);
  assert.match(recovery, /library-password-policy\.js/);
});

test('shared password policy accepts 10 characters and rejects 9', async () => {
  assert.equal(passwordError('Ember!2345', 'owner@example.test'), null);
  assert.match(passwordError('Ember!234', 'owner@example.test'), /10–128 characters/);
  assert.match(passwordError('password12', 'owner@example.test'), /less predictable/);
  const clientPolicy = await read('public/scripts/library-password-policy.js');
  assert.match(clientPolicy, /const minimum = 10/);
  assert.match(clientPolicy, /Use 10–128 characters/);
});

test('ritual is a concise companion-first gateway with the video directly after its introduction', async () => {
  const ritual = await read('src/pages/library/rituals/step-into-your-fire.astro');
  assert.match(ritual, /<h1>Step Into Your Fire<\/h1>/);
  assert.match(ritual, /Welcome, Warrior Goddess\./);
  assert.match(ritual, /Before you begin, please take a moment to read your Ritual Companion\./);
  assert.match(ritual, /<h2 id="companion-title">Your Ritual Companion<\/h2>/);
  assert.match(ritual, /OPEN \/ READ<\/a>/);
  assert.match(ritual, /target="_blank" rel="noopener">OPEN \/ READ/);
  assert.match(ritual, /fire-download-link--primary/);
  assert.match(ritual, />DOWNLOAD PDF<\/a>/);
  assert.match(ritual, />PRINT COMPANION<\/button>/);
  assert.match(ritual, /<h2 id="let-us-begin-title">Let's Begin<\/h2>\s*<p>When you're ready, press Play\.<\/p>/);
  assert.match(ritual, /When you're ready, press Play\.[\s\S]*data-unified-video-target/);
  assert.doesNotMatch(ritual, /GO TO VIDEO|THE SACRED LAW|ANCIENT REMEMBRANCE|RADICAL HONESTY|PREPARE YOUR RITUAL|THE FOUR THRESHOLDS/);
});

test('post-video discovery preserves all six appropriate destinations and the library return', async () => {
  const ritual = await read('src/pages/library/rituals/step-into-your-fire.astro');
  const videoIndex = ritual.indexOf('data-unified-video-target');
  const discoveryIndex = ritual.indexOf('CONTINUE THE SACRED BECOMING');
  assert.ok(videoIndex >= 0 && discoveryIndex > videoIndex, 'discovery must follow the protected player');
  for (const href of [
    '/sacred-becoming/oracle-deck/',
    '/rituals/',
    '/sacred-becoming/mentorship/',
    'https://goddess-yoga-retreats.com/retreats/',
    '/readings-with-vanessa/',
    '/goddess-embodiment-practices/',
  ]) assert.match(ritual, new RegExp(`href="${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  assert.equal((ritual.match(/class="fire-continuation-links"[\s\S]*?<\/nav>/)?.[0].match(/<a /g) || []).length, 6);
  assert.match(ritual, /<a class="fire-return-library" href="\/library\/">Return to My Library<\/a>/);
  assert.match(ritual, /class="fire-private-wordmark" href="\/"/);
  assert.match(ritual, /aria-label="Private ritual navigation"/);
  assert.match(await read('src/pages/sacred-becoming/oracle-deck.astro'), /Join the Waitlist/);
});
