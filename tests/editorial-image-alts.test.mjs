import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const placements = JSON.parse(await readFile(new URL('src/data/imageSitemapPlacements.json', root), 'utf8')).pages;
const signatures = JSON.parse(await readFile(new URL('src/data/editorialImageAlts.json', root), 'utf8'));
const postsDir = new URL('src/content/posts/', root);

const decode = (value) => value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (_, entity) => {
  if (entity[0] === '#') return String.fromCodePoint(parseInt(entity.slice(entity[1].toLowerCase() === 'x' ? 2 : 1), entity[1].toLowerCase() === 'x' ? 16 : 10));
  return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }[entity.toLowerCase()];
});
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/\s([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((match) => [match[1].toLowerCase(), decode(match[2] ?? match[3])]));
const field = (frontmatter, name) => frontmatter.match(new RegExp(`^${name}:\\s*(?:"([^"]*)"|'([^']*)'|([^\\n]+))$`, 'm'))?.slice(1).find((value) => value !== undefined)?.trim() ?? null;

test('all 1,111 approved article image placements have exact built alt text and hero metadata', async () => {
  const files = (await readdir(postsDir)).filter((file) => file.endsWith('.md'));
  let articles = 0;
  let checked = 0;
  let heroes = 0;

  for (const file of files) {
    const source = await readFile(new URL(file, postsDir), 'utf8');
    const frontmatter = source.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    if (field(frontmatter, 'content_type') !== 'post') continue;
    articles++;
    const pathname = `/${field(frontmatter, 'slug')}/`;
    const reviewed = placements[pathname]?.images ?? [];
    const approved = new Map((signatures[pathname] ?? []).map((entry) => [`${entry.index}\n${entry.src}`, entry]));
    const html = await readFile(new URL(`dist${pathname}index.html`, root), 'utf8');
    const images = [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => attrs(match[0]));

    for (const placement of reviewed) {
      const signature = approved.get(`${placement.index}\n${placement.src}`);
      assert.ok(signature, `missing approved alt signature: ${pathname} image ${placement.index}`);
      assert.equal(images[placement.index]?.src, placement.src, `built image source changed: ${pathname} image ${placement.index}`);
      assert.equal(images[placement.index]?.alt, signature.alt, `built alt differs: ${pathname} image ${placement.index}`);
      checked++;
    }

    const hero = field(frontmatter, 'seo_image');
    if (hero) {
      const heroPlacement = reviewed.find((placement) => placement.src === hero);
      if (heroPlacement) {
        heroes++;
        const signature = approved.get(`${heroPlacement.index}\n${heroPlacement.src}`);
        const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => attrs(match[0]));
        assert.equal(field(frontmatter, 'seo_image_alt'), signature.alt, `hero frontmatter alt differs: ${pathname}`);
        assert.equal(metas.find((meta) => meta.property === 'og:image:alt')?.content, signature.alt, `Open Graph hero alt differs: ${pathname}`);
        assert.equal(metas.find((meta) => meta.name === 'twitter:image:alt')?.content, signature.alt, `Twitter hero alt differs: ${pathname}`);
      }
    }
  }

  assert.equal(articles, 234);
  assert.equal(checked, 1111);
  assert.equal(heroes, 83);
});
