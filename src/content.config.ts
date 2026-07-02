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
  }),
});

const products = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/products' }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    original_url: z.string().optional(),
    date: z.coerce.date(),
    modified: z.coerce.date().optional(),
    content_type: z.literal('product').default('product'),
    categories: z.array(z.string()).default([]),
    price: z.number().optional(),
    image: z.string().optional(),
    stripe_link: z.string().default(''),
    seo_title: z.string().optional(),
    seo_description: z.string().optional(),
  }),
});

export const collections = { posts, products };
