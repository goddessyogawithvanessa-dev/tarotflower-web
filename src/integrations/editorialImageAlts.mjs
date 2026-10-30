import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import signatures from '../data/editorialImageAlts.json' with { type: 'json' };

const decode = (value) => value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (_, entity) => {
  if (entity[0] === '#') return String.fromCodePoint(parseInt(entity.slice(entity[1].toLowerCase() === 'x' ? 2 : 1), entity[1].toLowerCase() === 'x' ? 16 : 10));
  return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }[entity.toLowerCase()];
});
const escape = (value) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attribute = (tag, name) => {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match ? decode(match[1] ?? match[2]) : null;
};

// Explicit, individually reviewed placement signatures. No metadata is inferred.
export default function editorialImageAlts() {
  return {
    name: 'editorial-image-alt-signatures',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        for (const [pathname, placements] of Object.entries(signatures)) {
          const file = new URL(`${pathname.replace(/^\//, '')}index.html`, dir);
          const original = await readFile(file, 'utf8');
          const reviewed = new Map(placements.map((entry) => [entry.index, entry]));
          if (reviewed.size !== placements.length) throw new Error(`Duplicate reviewed alt placement: ${pathname}`);
          let index = -1;
          const applied = new Set();
          const result = original.replace(/<img\b[^>]*>/gi, (tag) => {
            const entry = reviewed.get(++index);
            if (!entry) return tag;
            if (attribute(tag, 'src') !== entry.src || attribute(tag, 'alt') !== entry.expectedAlt) {
              throw new Error(`Editorial alt placement changed: ${pathname} image ${index} (${fileURLToPath(file)})`);
            }
            applied.add(index);
            return tag.replace(/(\s)alt\s*=\s*(?:"[^"]*"|'[^']*')/i, (_, space) => `${space}alt="${escape(entry.alt)}"`);
          });
          if (applied.size !== reviewed.size) throw new Error(`Missing reviewed alt placement: ${pathname}`);
          await writeFile(file, result);
        }
      },
    },
  };
}
