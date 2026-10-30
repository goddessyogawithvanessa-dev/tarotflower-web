// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import canonicalInternalLinks from './src/integrations/canonicalInternalLinks.mjs';
export default defineConfig({
  site: 'https://tarotflower.com',
  integrations: [
    sitemap({
      filter: (page) =>
        page !== 'https://tarotflower.com/home/' &&
        !page.startsWith('https://tarotflower.com/library/') &&
        !page.startsWith('https://tarotflower.com/checkout/'),
    }),
    canonicalInternalLinks(),
  ],
});
