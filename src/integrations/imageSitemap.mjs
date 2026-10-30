import { readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import placements from '../data/imageSitemapPlacements.json' with { type: 'json' };

export const IMAGE_SITEMAP_FILENAME = 'sitemap-images.xml';
const namespace = 'http://www.sitemaps.org/schemas/sitemap/0.9';
const imageNamespace = 'http://www.google.com/schemas/sitemap-image/1.1';
const privatePath = /^\/(?:admin|api|library|checkout|workbench)(?:\/|$)/i;
const sharedHeader = '/images/tarot-flower-dandelion-goddess-header.jpg';
export const decode = value => value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (_, entity) => {
  if (entity[0] === '#') return String.fromCodePoint(parseInt(entity.slice(entity[1].toLowerCase() === 'x' ? 2 : 1), entity[1].toLowerCase() === 'x' ? 16 : 10));
  return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }[entity.toLowerCase()];
});
const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
export const attributes = tag => Object.fromEntries([...tag.matchAll(/\s([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(match => [match[1].toLowerCase(), decode(match[2] ?? match[3])]));

export function inspectPage(html, pageURL, review, sitemapPages) {
  const page = new URL(pageURL);
  if (privatePath.test(page.pathname) || !sitemapPages.has(page.href)) throw new Error(`Image sitemap destination is not public: ${page.href}`);
  const canonical = [...html.matchAll(/<link\b[^>]*>/gi)].map(match => attributes(match[0])).find(tag => tag.rel === 'canonical')?.href;
  const robots = [...html.matchAll(/<meta\b[^>]*>/gi)].map(match => attributes(match[0])).filter(tag => /^(robots|googlebot)$/i.test(tag.name ?? '')).map(tag => tag.content ?? '').join(',');
  if (canonical !== page.href || /noindex|none/i.test(robots)) throw new Error(`Noncanonical or noindex image sitemap destination: ${page.href}`);
  const images = [...html.matchAll(/<img\b[^>]*>/gi)].map(match => attributes(match[0]));
  const reviewed = [...review.images, ...review.excluded];
  if (images.length !== reviewed.length || new Set(reviewed.map(entry => entry.index)).size !== reviewed.length) throw new Error(`Unreviewed image placement on ${page.href}`);
  for (const entry of reviewed) {
    if (images[entry.index]?.src !== entry.src) throw new Error(`Reviewed image placement changed: ${page.href} image ${entry.index}`);
  }
  const included = new Set();
  for (const entry of review.images) {
    const image = images[entry.index];
    const url = new URL(image.src, page);
    if (!image.alt?.trim() || image['aria-hidden'] === 'true' || url.pathname === sharedHeader) throw new Error(`Decorative/interface image cannot enter sitemap: ${page.href} image ${entry.index}`);
    if (url.origin !== page.origin || !url.pathname.startsWith('/images/') || url.search || url.hash || /\/wp-(?:content|includes)\//i.test(url.pathname)) throw new Error(`Image is not a current self-hosted URL: ${url.href}`);
    included.add(url.href);
  }
  if (included.size > 1000) throw new Error(`Image sitemap page exceeds 1,000 images: ${page.href}`);
  return [...included].sort();
}

export function renderImageSitemap(pages) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${namespace}" xmlns:image="${imageNamespace}">\n${pages.map(page => `  <url>\n    <loc>${escape(page.url)}</loc>\n${page.images.map(image => `    <image:image><image:loc>${escape(image)}</image:loc></image:image>`).join('\n')}\n  </url>`).join('\n')}\n</urlset>\n`;
}

export async function buildImageSitemap(dir, site, manifest = placements) {
  const origin = new URL(site).origin;
  const index = await readFile(new URL('sitemap-index.xml', dir), 'utf8');
  const sitemapURLs = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(decode(match[1]))).filter(url => path.basename(url.pathname) !== IMAGE_SITEMAP_FILENAME);
  const sitemapPages = new Set();
  for (const sitemapURL of sitemapURLs) {
    if (sitemapURL.origin !== origin) throw new Error(`Unexpected sitemap host: ${sitemapURL.href}`);
    const xml = await readFile(new URL(sitemapURL.pathname.slice(1), dir), 'utf8');
    for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) sitemapPages.add(decode(match[1]));
  }
  const reviewedPages = new Set(Object.keys(manifest.pages).map(pathname => new URL(pathname, origin).href));
  if (sitemapPages.size !== reviewedPages.size || [...sitemapPages].some(url => !reviewedPages.has(url))) throw new Error('Public sitemap page scope changed; review image placements before rebuilding the image sitemap.');
  const pages = [];
  const files = new Set();
  for (const pathname of Object.keys(manifest.pages).sort()) {
    const url = new URL(pathname, origin).href;
    const html = await readFile(new URL(`${pathname.slice(1)}index.html`, dir), 'utf8');
    const images = inspectPage(html, url, manifest.pages[pathname], sitemapPages);
    if (!images.length) continue;
    for (const image of images) {
      const imagePath = decodeURIComponent(new URL(image).pathname.slice(1));
      const filename = path.resolve(fileURLToPath(dir), imagePath);
      if (!filename.startsWith(path.resolve(fileURLToPath(dir)) + path.sep)) throw new Error(`Invalid image path: ${image}`);
      if (!(await stat(filename)).isFile()) throw new Error(`Missing image sitemap asset: ${image}`);
      files.add(image);
    }
    pages.push({ url, images });
  }
  const xml = renderImageSitemap(pages);
  if (Buffer.byteLength(xml, 'utf8') > 50 * 1024 * 1024 || pages.length > 50000) throw new Error('Image sitemap exceeds protocol limits.');
  await writeFile(new URL(IMAGE_SITEMAP_FILENAME, dir), xml);
  return { pages: pages.length, images: files.size, associations: pages.reduce((count, page) => count + page.images.length, 0) };
}

export default function imageSitemap() {
  let site;
  return {
    name: 'tarot-flower-image-sitemap',
    hooks: {
      'astro:config:done': ({ config }) => { site = config.site; },
      // Runs after editorial signatures and the existing page sitemap; HTML is read, never rewritten.
      'astro:build:done': async ({ dir, logger }) => {
        const report = await buildImageSitemap(dir, site);
        logger.info(`${IMAGE_SITEMAP_FILENAME}: ${report.pages} canonical pages, ${report.images} distinct images, ${report.associations} page/image associations`);
      },
    },
  };
}
