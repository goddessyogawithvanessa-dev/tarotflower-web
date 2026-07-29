// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
export default defineConfig({
  site: 'https://tarotflower.com',
  integrations: [
    sitemap({
      filter: (page) => page !== 'https://tarotflower.com/home/',
    }),
  ],
});
