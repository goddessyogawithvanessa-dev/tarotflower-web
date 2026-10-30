import { readFile, writeFile } from 'node:fs/promises';
import { IDS, SITE, ref, imageId, person, organization, website, works } from '../lib/entities.mjs';
import placements from '../data/imageSitemapPlacements.json' with { type: 'json' };
import provenance from '../data/imageCreatorProvenance.json' with { type: 'json' };
import descriptions from '../data/reviewedMetaDescriptions.json' with { type: 'json' };
import { attributes, decode } from './imageSitemap.mjs';

const functional = new Set(['contact', 'home', 'shop', 'privacy-policy', 'terms-and-conditions', 'tarot-card-readings', 'free-tarot-card-readings', 'melissa-warwood-tantric-tarot']);
const authoredRoutes = new Set(['/10-steps-to-embody-the-goddess-free-download/', '/rituals/', '/root-into-the-earth/', '/flow-like-the-goddess/', '/awaken-the-element-of-air/', '/sound-bath-meditations/']);
const workForPage = { '/sacred-becoming/': 'sacred', '/goddess-embodiment-practices/': 'embodiment', '/step-into-your-fire/': 'fire', '/sacred-becoming/oracle-deck/': 'oracle' };
// The historical Capricorn Kids guest credit remains unresolved. The separate
// Capricorn dates/traits article belongs to Vanessa's authored library.
const unresolvedAuthorship = new Set(['/capricorn-kids/']);

export function enrichGraph(original, { pathname, images, topics = [], authored = false, author }) {
  const canonical = new URL(pathname, SITE).href;
  const oldPage = original['@graph'].find(n => n['@id'] === `${canonical}#webpage`);
  if (!oldPage) throw new Error(`Missing page schema: ${pathname}`);
  const graph = [organization(), person(), website()];
  const isArticle = oldPage['@type'] === 'Article';
  const page = { ...oldPage, '@type': isArticle ? 'WebPage' : oldPage['@type'] };
  const preferred = oldPage.primaryImageOfPage?.contentUrl;
  for (const key of ['author', 'publisher', 'datePublished', 'dateModified', 'mainEntityOfPage', 'image', 'primaryImageOfPage', 'about']) delete page[key];
  const subjectNames = [...new Set([oldPage.headline || oldPage.name.replace(/\s*[|–]\s*Tarot Flower$/, ''), ...topics].filter(Boolean))];
  const subjects = subjectNames.map(name => ({ '@type': 'Thing', name }));
  page.about = subjects;
  const mainWork = workForPage[pathname];
  const products = original['@graph'].filter(n => n['@type'] === 'Product').map(product => ({
    ...product,
    brand: product.brand || ref(IDS.organization),
    creator: product.creator || ref(IDS.vanessa),
  }));
  const breadcrumbs = original['@graph'].filter(n => n['@type'] === 'BreadcrumbList');
  const imageNodes = images.map(({ src, caption }) => ({
    '@type': 'ImageObject', '@id': imageId(src), contentUrl: new URL(src, SITE).href,
    ...(caption ? { caption } : {}), isPartOf: ref(page['@id']), publisher: ref(IDS.organization),
    ...(provenance[src]?.method === 'MidJourney' ? { creator: ref(IDS.vanessa), creditText: 'MidJourney art by Vanessa Hylande' } : {}),
  }));
  const imageRefs = imageNodes.map(n => ref(n['@id']));
  if (imageNodes.some(n => n.contentUrl === preferred)) page.primaryImageOfPage = ref(imageId(preferred));
  if (imageRefs.length) page.image = imageRefs;
  if (isArticle) {
    const article = { ...oldPage, '@id': `${canonical}#article`, about: subjects,
      mainEntityOfPage: ref(page['@id']), isPartOf: ref(IDS.website), publisher: ref(IDS.organization) };
    delete article.primaryImageOfPage;
    delete article.image;
    if (author !== null) article.author = ref(author?.id || IDS.vanessa);
    else delete article.author;
    if (author?.id && author.id !== IDS.vanessa) graph.push({ '@type': 'Person', '@id': author.id, name: author.name, ...(author.url ? { url: author.url } : {}) });
    if (imageRefs.length) article.image = imageRefs;
    if (topics.length) article.articleSection = topics;
    page.mainEntity = ref(article['@id']);
    graph.push(article);
  } else if (authored || authoredRoutes.has(pathname) || mainWork) {
    if (author !== null) page.author = ref(author?.id || IDS.vanessa);
    page.publisher = ref(IDS.organization);
  }
  const knownWorks = works(descriptions);
  if (mainWork || pathname === '/sacred-becoming/mentorship/' || pathname === '/rituals/') {
    graph.push(knownWorks.sacred, knownWorks.embodiment, knownWorks.fire, knownWorks.oracle);
    if (mainWork) {
      page.mainEntity = ref(pathname === '/step-into-your-fire/' && products[0] ? products[0]['@id'] : knownWorks[mainWork]['@id']);
      page.about = ref(knownWorks[mainWork]['@id']);
    }
    else page.about = ref(IDS.sacred);
  }
  for (const n of original['@graph'].filter(n => n['@type'] === 'Service')) {
    const service = { ...n, provider: ref(IDS.vanessa), brand: ref(IDS.organization) };
    if (pathname === '/sacred-becoming/mentorship/') service.category = ref(IDS.sacred);
    graph.push(service);
  }
  graph.push(...products, ...breadcrumbs, page, ...imageNodes);
  return { '@context': 'https://schema.org', '@graph': graph };
}

export default function entityGraph() {
  return { name: 'reviewed-creator-entity-image-graph', hooks: {
    'astro:build:done': async ({ dir }) => {
      // Content taxonomy is already explicit in the site's records; no keyword inference.
      const records = new Map();
      const { readdir } = await import('node:fs/promises');
      const source = new URL('../content/posts/', import.meta.url);
      for (const filename of await readdir(source)) {
        if (!filename.endsWith('.md')) continue;
        const text = await readFile(new URL(filename, source), 'utf8');
        const fm = text.split(/^---\s*$/m)[1] || '';
        const slug = fm.match(/^slug:\s*(.+)$/m)?.[1]?.trim();
        if (!slug) continue;
        const categories = (fm.match(/^categories:\s*\[([^\]]*)\]/m)?.[1] || '').split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '').replaceAll('-', ' ')).filter(s => s && s !== 'uncategorized');
        const explicitAuthor = fm.match(/^author:\s*["']?([^\n"']+)["']?\s*$/m)?.[1]?.trim();
        const author = explicitAuthor && explicitAuthor !== 'Vanessa Hylande'
          ? { id: `${new URL(`/${slug}/`, SITE).href}#author`, name: explicitAuthor }
          : unresolvedAuthorship.has(`/${slug}/`) ? null : undefined;
        records.set(`/${slug}/`, { topics: categories, authored: /^content_type:\s*page\s*$/m.test(fm) && !functional.has(slug), author });
      }
      for (const [pathname, record] of Object.entries(placements.pages)) {
        const file = new URL(`${pathname.slice(1)}index.html`, dir);
        const html = await readFile(file, 'utf8');
        const tags = [...html.matchAll(/<img\b[^>]*>/gi)].map(m => attributes(m[0]));
        const captions = new Map();
        for (const figure of html.matchAll(/<figure\b[^>]*>([\s\S]*?)<\/figure>/gi)) {
          const figureImages = [...figure[1].matchAll(/<img\b[^>]*>/gi)];
          const caption = figure[1].match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i)?.[1];
          if (figureImages.length === 1 && caption) captions.set(attributes(figureImages[0][0]).src, decode(caption.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()));
        }
        const selected = new Map();
        for (const placement of record.images) {
          const tag = tags[placement.index];
          if (tag?.src !== placement.src || !tag.alt) throw new Error(`Reviewed image placement changed: ${pathname} ${placement.index}`);
          // Keep placement-specific alt signatures in HTML, never in an asset registry.
          if (!selected.has(tag.src)) selected.set(tag.src, { src: tag.src, caption: captions.get(tag.src) });
        }
        let blocks = 0;
        const result = html.replace(/(<script\b[^>]*type="application\/ld\+json"[^>]*>)([\s\S]*?)(<\/script>)/gi, (_, open, json, close) => {
          blocks++;
          const graph = enrichGraph(JSON.parse(json), { pathname, images: [...selected.values()], ...records.get(pathname) });
          return open + JSON.stringify(graph).replace(/</g, '\\u003c') + close;
        });
        if (blocks !== 1) throw new Error(`Expected one JSON-LD graph: ${pathname}`);
        await writeFile(file, result);
      }
      // Non-indexable public utility pages still share the same site identities.
      // They get no author, topic inference or meaningful-image claims.
      async function cleanUtilities(folder) {
        for (const entry of await readdir(folder, { withFileTypes: true })) {
          const file = new URL(entry.name + (entry.isDirectory() ? '/' : ''), folder);
          if (entry.isDirectory()) { await cleanUtilities(file); continue; }
          if (!entry.name.endsWith('.html')) continue;
          const html = await readFile(file, 'utf8');
          const result = html.replace(/(<script\b[^>]*type="application\/ld\+json"[^>]*>)([\s\S]*?)(<\/script>)/gi, (_, open, json, close) => {
            const graph = JSON.parse(json);
            const page = graph['@graph']?.find(n => n['@id']?.endsWith('#webpage'));
            if (!page) return open + json + close;
            const pathname = new URL(page.url).pathname;
            if (placements.pages[pathname]) return open + json + close;
            graph['@graph'] = graph['@graph'].map(n => n['@type'] === 'Person' ? person() : n['@type'] === 'Organization' ? organization() : n['@type'] === 'WebSite' ? website() : n);
            delete page.primaryImageOfPage;
            return open + JSON.stringify(graph).replace(/</g, '\\u003c') + close;
          });
          if (result !== html) await writeFile(file, result);
        }
      }
      await cleanUtilities(dir);
    },
  } };
}
