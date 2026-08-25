import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLibraryPurchaseAccessEmail } from '../worker/email-service/library-purchase-email.js';

test('purchase email provides a stable, permanent route back without a magic token', () => {
  const libraryUrl = 'https://tarotflower.com/library/login/';
  const email = buildLibraryPurchaseAccessEmail({
    productTitle: 'Step Into Your Fire',
    libraryUrl,
  });

  for (const content of [email.html, email.text]) {
    assert.match(content, /Step Into Your Fire is ready/i);
    assert.match(content, /access is permanent/i);
    assert.match(content, /same email address you used at checkout/i);
    assert.match(content, /contact@tarotflower\.com/i);
    assert.match(content, /library\/login\//i);
    assert.doesNotMatch(content, /library\/auth/i);
    assert.doesNotMatch(content, /[?&]token=/i);
  }
});
