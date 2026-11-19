// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import editorialImageAlts from './src/integrations/editorialImageAlts.mjs';
import imageSitemap from './src/integrations/imageSitemap.mjs';
import entityGraph from './src/integrations/entityGraph.mjs';
import canonicalInternalLinks from './src/integrations/canonicalInternalLinks.mjs';
import { isNoindexBrowsingRoute } from './src/data/noindexBrowsingRoutes.mjs';
export default defineConfig({
  site: 'https://tarotflower.com',
  integrations: [
    editorialImageAlts(),
    sitemap({
      customSitemaps: ['https://tarotflower.com/sitemap-images.xml'],
      filter: (page) =>
        page !== 'https://tarotflower.com/home/' &&
        page !== 'https://tarotflower.com/fire-purchase-complete/' &&
        !page.startsWith('https://tarotflower.com/library/') &&
        !page.startsWith('https://tarotflower.com/workbench/') &&
        !page.startsWith('https://tarotflower.com/checkout/') &&
        !isNoindexBrowsingRoute(new URL(page).pathname),
    }),
    imageSitemap(),
    entityGraph(),
    canonicalInternalLinks(),
  ],
});
