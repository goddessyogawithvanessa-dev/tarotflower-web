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
    content_type: z.enum(['post', 'page', 'product']).default('post'),
    categories: z.array(z.string()).default([]),
    seo_title: z.string().optional(),
    seo_description: z.string().optional(),
    seo_image: z.string().optional(),
    seo_image_alt: z.string().optional(),
    seo_image_width: z.coerce.number().optional(),
    seo_image_height: z.coerce.number().optional(),
    journal_category: z.enum([
      'embodiment',
      'cosmic-weather',
      'moon-magic',
      'twin-flames',
      'affirmations',
      'mythology',
      'embodying-tarot',
      'vanessas-grimoire',
    ]).optional(),
    journal_featured: z.boolean().optional(),
    journal_feature_order: z.coerce.number().optional(),
  }),
});

export const collections = { posts };
