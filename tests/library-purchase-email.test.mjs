import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLibraryPurchaseAccessEmail } from '../worker/email-service/library-purchase-email.js';
import { EMAILS, renderEmail } from '../worker/email-service/tarot-email-suite.js';

test('FIRE uses approved copy and keeps unfinished video/music disabled', () => {
  const email = buildLibraryPurchaseAccessEmail({libraryUrl:'https://tarotflower.com/library/'});
  assert.equal(email.subject, 'Your FIRE Ritual is ready 🔥');
  assert.match(email.text,/I'm so excited you're here!/);
  assert.match(email.text,/OPEN MY LIBRARY/);
  assert.match(email.text,/same email address you used at checkout/);
  assert.match(email.text,/existing password/);
  assert.doesNotMatch(email.html,/href=""/);
  assert.doesNotMatch(email.text,/DOWNLOAD YOUR RITUAL COMPANION|BEGIN THE RITUAL|magic link/i);
});
test('FIRE email has one durable library CTA and no asset attachments or expiring URLs', () => {
  const email=buildLibraryPurchaseAccessEmail({libraryUrl:'https://tarotflower.com/library/'});
  assert.equal((email.html.match(/<a href=/g) || []).length,1);
  assert.match(email.text,/OPEN MY LIBRARY\nhttps:\/\/tarotflower\.com\/library\//);
  assert.doesNotMatch(email.text,/token=|companion=|expires/i);
});
test('all eight approved templates produce HTML and real paragraph breaks', () => {
  assert.equal(Object.keys(EMAILS).length,8);
  for (const key of Object.keys(EMAILS)) {
    const e=renderEmail(key,{unsubscribe_url:'https://example.test/unsubscribe',guide_download_url:'https://example.test/guide',
      ritual_url:'https://example.test/ritual',library_url:'https://example.test/library',login_url:'https://example.test/login',
      verification_url:'https://example.test/library/verify?token=preview'});
    assert.ok(e.text.includes('\n\n'));
    assert.ok(e.html.includes('<html'));
    assert.doesNotMatch(e.text,/\\n/);
    assert.doesNotMatch(e.text,/\{\{/);
  }
  assert.match(EMAILS.transmutation.text,/crazy shit/);
  assert.match(EMAILS['fire-followup'].text,/That’s transmutation/);
  assert.match(EMAILS['library-verification'].text,/VERIFY MY EMAIL/);
  assert.match(EMAILS['library-verification'].text,/24 hours/);
});
