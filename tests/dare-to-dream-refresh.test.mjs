import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const approvedStory = `I had a dream of making an oracle deck. I had been creating artwork just for fun for months, and each piece had a message already. But when I thought about making a deck, it became so serious and complicated. How am I going to produce it? How am I going to market it? How am I going to sell it? Is it worth my time, effort and money? Will it succeed?

I was talking myself out of it before I started.

But then I realized I actually had everything I needed, and I just decided it would be fun to try. So I made it.

And you know what? It felt really good just to make it because it is a labor of love, and why not? Why not take a chance on myself? I ordered the prototype, and now it is real and it is beautiful. I use it myself and with my friends. This dream didn’t need permission from the world to exist!

I see so many people talking themselves out of their dreams before they even start. You can start. You can take a step toward your dream.`;

test('Dare to Dream keeps Vanessa’s approved story and direct internal links', async () => {
  const article = await read('src/content/posts/dare-to-dream-dare-to-manifest.md');
  assert.ok(article.includes(approvedStory));
  assert.match(article, /<h2 id="dare-dream-oracle-title">Sacred Becoming Oracle Deck<\/h2>/);
  assert.match(article, /<p>If you’d like to work with the deck I made,<\/p>/);
  assert.match(article, /class="dare-dream-oracle-cta-button" href="\/sacred-becoming\/oracle-deck\/#oracle-waitlist">join the Sacred Becoming Oracle Deck waitlist<\/a>/);
  assert.match(article, /oracle-spiral-spread-textured\.jpg/);
  assert.match(article, /\[Embody what you wish for\]\(\/embodiment-dance-for-high-vibe-living\/\)/);
  assert.doesNotMatch(article, /youtube|rM-E5n87oXQ/i);
  assert.match(article, /date: 2021-09-17\nmodified: 2026-11-20/);
});

test('Dare to Dream uses the approved artwork for the article and Featured New card', async () => {
  const [article, journal, dailyTarot] = await Promise.all([
    read('src/content/posts/dare-to-dream-dare-to-manifest.md'),
    read('src/lib/journal.ts'),
    read('src/pages/daily-tarot.astro'),
  ]);
  const alt = 'Joyful Art Nouveau goddess laughing with her head tilted back as luminous floral energy blooms from her third eye, daring to dream and manifest. Midjourney art by Vanessa Hylande, Tarot Flower.';
  assert.equal((article.match(new RegExp(alt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 2);
  assert.match(article, /journal_featured: true\njournal_feature_order: -1/);
  assert.match(journal, /'dare-to-dream-dare-to-manifest': \{[\s\S]*?dare-to-dream-manifest-goddess-960\.webp[\s\S]*?width: 960,[\s\S]*?height: 1200,/);
  assert.equal((dailyTarot.match(/href=\{`\/\$\{entry\.slug\}\/`\}/g) || []).length, 3);
  await Promise.all([
    access(new URL('../public/images/dare-to-dream/dare-to-dream-manifest-goddess-480.webp', import.meta.url)),
    access(new URL('../public/images/dare-to-dream/dare-to-dream-manifest-goddess-960.webp', import.meta.url)),
  ]);
});
