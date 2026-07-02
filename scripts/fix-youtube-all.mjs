import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const postsDir = join(import.meta.dirname, '..', 'src', 'content', 'posts');

const ytRegex = /^https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w\\_-]+)[^\s]*\s*$/;

let totalFixed = 0;
let ytFixed = 0;

const files = readdirSync(postsDir).filter(f => f.endsWith('.md'));

for (const file of files) {
  const filepath = join(postsDir, file);
  const content = readFileSync(filepath, 'utf-8');

  const lines = content.split('\n');
  const newLines = [];
  let changed = false;

  for (const line of lines) {
    const m = line.trim().match(ytRegex);
    if (m) {
      newLines.push(`<div class="youtube-embed"><iframe src="https://www.youtube.com/embed/${m[1]}" width="100%" height="450" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`);
      changed = true;
      ytFixed++;
    } else {
      newLines.push(line);
    }
  }

  if (changed) {
    writeFileSync(filepath, newLines.join('\n'));
    totalFixed++;
    console.log(`Fixed: ${file}`);
  }
}

console.log(`\nDone. ${totalFixed} files, ${ytFixed} YouTube embeds.`);
