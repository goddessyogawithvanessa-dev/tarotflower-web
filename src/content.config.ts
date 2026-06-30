import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    original_url: z.string().optional(),
    date: z.coerce.date(),
    modified: z.coerce.date().optional(),
    type: z.enum(['post', 'page']).default('post'),
    categories: z.array(z.string()).default([]),
    seo_title: z.string().optional(),
    seo_description: z.string().optional(),
  }),
});

export const collections = { posts };
