import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const oracleDestination = 'https://tarotflower.com/sacred-becoming/oracle-deck/';

test('the approved Oracle Deck CTA preserves its copy, artwork, styling and destination', async () => {
  const source = await read('src/components/SacredBecomingOracleDeckCTA.astro');
  assert.match(source, /class="dare-dream-oracle-cta"/);
  assert.match(source, /oracle-spiral-spread-textured\.jpg/);
  assert.match(source, />Sacred Becoming Oracle Deck<\/h2>/);
  assert.match(source, /If you’d like to work with the deck I made,/);
  assert.match(source, /join the Sacred Becoming Oracle Deck waitlist/);
  assert.ok(source.includes(`href="${oracleDestination}"`));
});

test('Pinterest-audited article CTA routing is scoped to the approved pages', async () => {
  const post = await read('src/layouts/Post.astro');
  const evergreen = await read('src/data/evergreenJourneys.ts');
  const kali = await read('src/content/posts/the-goddess-kali-unleashing-your-sacred-sexuality.md');

  for (const slug of ['the-reign-of-lady-justice', 'aphrodite-goddess-of-love']) {
    assert.match(post, new RegExp(`'${slug}'`));
  }
  assert.match(post, /hasDirectFireCTA = slug === 'sound-bath-meditations'/);
  assert.match(post, /'capricorn-dates-traits-persistent-ambition'/);
  assert.match(post, /'taurus-dates-traits-the-loyal-dependable-romantic'/);
  assert.match(post, /'creating-sacred-space-how-to-cast-a-goddess-circle'/);
  assert.match(post, /'embodiment-dance-for-high-vibe-living'/);

  const sixOfSwords = post.match(/'six-of-swords-tarot': \{([^\n]+)\}/)?.[1] ?? '';
  assert.ok(sixOfSwords.includes(oracleDestination));
  assert.doesNotMatch(sixOfSwords, /Flow Like the Goddess|Root Into the Earth/);

  const wheel = post.match(/\{isWheelOfFortunePage && \(([\s\S]*?)\n      \)\}/)?.[1] ?? '';
  assert.ok(wheel.includes(oracleDestination));
  assert.doesNotMatch(wheel, /Sacred Becoming Mentorship|Flow Like the Goddess/);

  for (const slug of ['creating-sacred-space-how-to-cast-a-goddess-circle', 'embodiment-dance-for-high-vibe-living']) {
    assert.match(evergreen, new RegExp(`'${slug}'`));
  }
  assert.match(kali, /<h2 id="kali-fire-editorial-title">Step Into Your Fire<\/h2>/);
  assert.match(post, /\{isChariotPage && \([\s\S]*?featuredTitle="Step Into Your Fire"/);
  assert.match(post, /'ten-of-swords-tarot': \{[^\n]*featuredTitle: 'Step Into Your Fire'/);
});

test('campaign CTAs sit at the approved answer-to-deeper-reading transitions exactly once', async () => {
  const placements = {
    'the-chariot-tarot': {
      marker: '<div data-campaign-cta="fire"></div>',
      before: '* **Often associated with:** Success, personal drive, and the need to maintain focus and direction on the path to achievement.',
      after: '## The Chariot Tarot Meaning',
    },
    'the-wheel-of-fortune-tarot': { marker: '<div data-campaign-cta="oracle-deck"></div>', after: '## **The Wheel of Fortune Meaning**' },
    'capricorn-dates-traits-persistent-ambition': { marker: '<div data-campaign-cta="oracle-deck"></div>', after: '## Capricorn Personality at a Glance' },
    'taurus-dates-traits-the-loyal-dependable-romantic': { marker: '<div data-campaign-cta="oracle-deck"></div>', after: '## Taurus Personality At a Glance' },
    'ten-of-swords-tarot': { marker: '<div data-campaign-cta="fire"></div>', after: '## Interpreting the 10 of Swords in Your Tarot Card Reading' },
    'six-of-swords-tarot': { marker: '<div data-campaign-cta="oracle-deck"></div>', after: '## The Six of Swords Love' },
    'the-reign-of-lady-justice': { marker: '<div data-campaign-cta="oracle-deck"></div>', after: '#### **Collective Blindness**' },
    'aphrodite-goddess-of-love': { marker: '<div data-campaign-cta="oracle-deck"></div>', after: '## Why We Should Listen to the Voice of the Heart' },
  };

  for (const [slug, placement] of Object.entries(placements)) {
    const source = await read(`src/content/posts/${slug}.md`);
    assert.equal(source.split(placement.marker).length - 1, 1, `${slug} must contain its CTA once`);
    if (placement.before) assert.ok(source.indexOf(placement.before) < source.indexOf(placement.marker), `${slug} CTA must follow the approved answer`);
    assert.ok(source.indexOf(placement.marker) < source.indexOf(placement.after), `${slug} CTA must precede the deeper section`);
  }

  for (const [slug, expected] of Object.entries({
    'embodiment-dance-for-high-vibe-living': ['fire', 'oracle-deck'],
    'creating-sacred-space-how-to-cast-a-goddess-circle': ['fire', 'oracle-deck'],
  })) {
    const source = await read(`src/content/posts/${slug}.md`);
    const found = [...source.matchAll(/<div data-campaign-cta="(fire|oracle-deck)"><\/div>/g)].map((match) => match[1]);
    assert.deepEqual(found, expected);
  }
});

test('Root Into the Earth keeps its ritual page and adds the Oracle Deck invitation', async () => {
  const rootPage = await read('src/pages/root-into-the-earth.astro');
  assert.match(rootPage, /<h1>Root into the Earth<\/h1>/);
  assert.match(rootPage, /<SacredBecomingOracleDeckCTA headingId="root-into-earth-oracle-deck-title" \/>/);
});

test('the Oracle Deck destination exposes its waitlist on the page', async () => {
  const deck = await read('src/pages/sacred-becoming/oracle-deck.astro');
  assert.match(deck, /id="oracle-waitlist"/);
  assert.match(deck, /<OracleWaitlist \/>/);
});
