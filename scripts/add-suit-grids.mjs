import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const postsDir = join(import.meta.dirname, '..', 'src', 'content', 'posts');

const order = ['ace','two','three','four','five','six','seven','eight','nine','ten','page','knight','queen','king'];

const suits = {
  cups: { heading: 'The Cups Tarot Cards', label: 'Cups' },
  pentacles: { heading: 'The Pentacles Tarot Cards', label: 'Pentacles' },
  wands: { heading: 'The Wands Tarot Cards', label: 'Wands' },
  swords: { heading: 'The Swords Tarot Cards', label: 'Swords' },
};

for (const [suit, info] of Object.entries(suits)) {
  const filepath = join(postsDir, `${suit}-tarot.md`);
  const content = readFileSync(filepath, 'utf-8');

  const cards = order.map(rank => {
    const slug = `${rank}-of-${suit}-tarot`;
    const cardFile = join(postsDir, `${slug}.md`);
    let title = '';
    let img = '';
    try {
      const cardContent = readFileSync(cardFile, 'utf-8');
      const titleMatch = cardContent.match(/^title:\s*"?(.+?)"?\s*$/m);
      title = titleMatch ? titleMatch[1] : slug;
      const imgMatch = cardContent.match(/!\[([^\]]*)\]\((\/[^)]+)\)/);
      img = imgMatch ? imgMatch[2] : '';
    } catch { title = slug; }
    return { slug, title, img };
  });

  let gridHtml = '\n<div class="zodiac-grid">\n';
  for (const card of cards) {
    gridHtml += `<a href="/${card.slug}" class="zodiac-card">\n`;
    if (card.img) {
      gridHtml += `<div class="zodiac-img"><img src="${card.img}" alt="${card.title}" loading="lazy" /></div>\n`;
    }
    gridHtml += `<div class="zodiac-info"><h3>${card.title}</h3></div>\n`;
    gridHtml += `</a>\n`;
  }
  gridHtml += '</div>\n';

  // Check if grid already added
  if (content.includes('class="zodiac-grid"')) {
    console.log(`${suit}: already has grid, skipping`);
    continue;
  }

  // Find the heading line and append after it
  const headingRegex = new RegExp(`^##\\s*${info.heading.replace('The ', '(The )?')}`, 'm');
  const headingMatch = content.match(headingRegex);

  let newContent;
  if (headingMatch) {
    const idx = content.indexOf(headingMatch[0]);
    const afterHeading = idx + headingMatch[0].length;
    newContent = content.slice(0, afterHeading) + '\n' + gridHtml + content.slice(afterHeading);
  } else {
    // No heading found, append at end
    newContent = content + `\n## ${info.heading}\n` + gridHtml;
  }

  writeFileSync(filepath, newContent);
  console.log(`${suit}: added ${cards.length} card links`);
}
