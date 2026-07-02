import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const postsDir = join(import.meta.dirname, '..', 'src', 'content', 'posts');

const CTA_HTML = `<a href="https://goddess-yoga-retreat.com/retreats/embodying-the-divine-feminine/" target="_blank" rel="noopener" class="cta-banner">
<h2>Ready to Embody the Mystery of the Tarot?</h2>
<p><strong>Discover the magic of Divine Feminine Tarot at our live mystical yoga, dance and somatics wellness retreats! Unleash your inner divine goddess at our all-inclusive magical events!</strong></p>
<span class="cta-btn">Register Now!</span>
</a>`;

const ytRegex = /^https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)\s*$/;
const ctaRegex = /^\*\*Discover the magic of Divine Feminine Tarot.*?\*\*\s*$/;
const imgRegex = /^!?\[.*?\]\(.*?\)(?:\(.*?\))?\s*$/;
const linkedImgRegex = /^\[!\[.*?\]\(([^)]+)\)\]\(([^)]+)\)\s*$/;
const plainImgRegex = /^!\[.*?\]\(([^)]+)\)\s*$/;

let totalFixed = 0;
let ytFixed = 0;
let ctaFixed = 0;
let imgPairsFixed = 0;

const files = readdirSync(postsDir).filter(f => f.endsWith('-tarot.md'));

for (const file of files) {
  const filepath = join(postsDir, file);
  const content = readFileSync(filepath, 'utf-8');
  const lines = content.split('\n');
  const newLines = [];
  let changed = false;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Replace "Discover the magic" CTA text with banner
    if (ctaRegex.test(line)) {
      newLines.push(CTA_HTML);
      changed = true;
      ctaFixed++;
      i++;
      continue;
    }

    // Replace bare YouTube URLs with embed
    const m = line.trim().match(ytRegex);
    if (m) {
      newLines.push(`<div class="youtube-embed"><iframe src="https://www.youtube.com/embed/${m[1]}" width="100%" height="450" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`);
      changed = true;
      ytFixed++;
      i++;
      continue;
    }

    // Check for consecutive image-only lines (with optional blank line between)
    const isImg = (l) => linkedImgRegex.test(l.trim()) || plainImgRegex.test(l.trim());
    const toImgTag = (l) => {
      const linked = l.trim().match(linkedImgRegex);
      if (linked) return `<a href="${linked[2]}"><img src="${linked[1]}" alt="" /></a>`;
      const plain = l.trim().match(plainImgRegex);
      if (plain) return `<img src="${plain[1]}" alt="" />`;
      return l;
    };
    if (isImg(line)) {
      let nextIdx = i + 1;
      if (nextIdx < lines.length && lines[nextIdx].trim() === '') nextIdx++;
      if (nextIdx < lines.length && isImg(lines[nextIdx])) {
        newLines.push(`<div class="img-pair">${toImgTag(line)}${toImgTag(lines[nextIdx])}</div>`);
        changed = true;
        imgPairsFixed++;
        i = nextIdx + 1;
        if (i < lines.length && lines[i].trim() === '') i++;
        continue;
      }
    }

    newLines.push(line);
    i++;
  }

  if (changed) {
    writeFileSync(filepath, newLines.join('\n'));
    totalFixed++;
    console.log(`Fixed: ${file}`);
  }
}

console.log(`\nDone. ${totalFixed} files, ${ytFixed} YouTube embeds, ${ctaFixed} CTA banners, ${imgPairsFixed} image pairs.`);
