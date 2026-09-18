import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLibraryPurchaseAccessEmail } from '../worker/email-service/library-purchase-email.js';

test('purchase email provides direct ritual access and a permanent library route', () => {
  const ritualAccessUrl = 'https://tarotflower.com/library/auth?token=single-use-token&next=%2Flibrary%2Frituals%2Fstep-into-your-fire%2F';
  const libraryUrl = 'https://tarotflower.com/library/';
  const email = buildLibraryPurchaseAccessEmail({
    productTitle: 'Step Into Your Fire',
    ritualAccessUrl,
    libraryUrl,
    expiresInMinutes: 15,
  });

  for (const content of [email.html, email.text]) {
    assert.match(content, /Hey, Warrior Goddess/i);
    assert.match(content, /decided to join the circle/i);
    assert.match(content, /ritual is ready for you/i);
    assert.match(content, /private access link/i);
    assert.match(content, /about an hour/i);
    assert.match(content, /ritual is yours permanently/i);
    assert.match(content, /BEGIN THE RITUAL/i);
    assert.match(content, /MY RITUALS/i);
    assert.match(content, /Let’s make some magic together/i);
    assert.match(content, /XOXO/i);
    assert.match(content, /library\/auth/i);
    assert.match(content, /token=/i);
    assert.match(content, /library\//i);
    assert.doesNotMatch(content, /RITUAL GRIMOIRE/i);
  }
});

test('purchase email renders the protected download suite only when all final assets are available', () => {
  const downloads = [
    ['RITUAL GRIMOIRE', 'grimoire'],
    ['COMPLETE RITUAL VIDEO', 'complete-video'],
    ['RITUAL MUSIC', 'ritual-music'],
  ].map(([label, id]) => ({
    label,
    url: `https://tarotflower.com/api/library/files/step-into-your-fire/${id}?download=1`,
  }));
  const email = buildLibraryPurchaseAccessEmail({
    ritualAccessUrl: 'https://tarotflower.com/library/auth?token=single-use-token&next=%2Flibrary%2Frituals%2Fstep-into-your-fire%2F',
    libraryUrl: 'https://tarotflower.com/library/',
    downloads,
  });

  for (const content of [email.html, email.text]) {
    assert.match(content, /YOURS TO KEEP/i);
    assert.match(content, /RITUAL GRIMOIRE/i);
    assert.match(content, /COMPLETE RITUAL VIDEO/i);
    assert.match(content, /RITUAL MUSIC/i);
    assert.match(content, /api\/library\/files\/step-into-your-fire/i);
  }
});
