# Tarot Flower

Static site for [tarotflower.com](https://tarotflower.com), built with Astro and deployed on Cloudflare Pages. Migrated from WordPress/Divi.

## Stack

- **Astro** — static site generator
- **Decap CMS** — visual content editor at `/admin` (commits to this repo)
- **Cloudflare Pages** — hosting, auto-deploys on push to `main`
- **GitHub** — content storage (markdown files)

## Project Structure

```
src/
  content/
    posts/          <- markdown files (tarot cards, blog posts, etc.)
    products/       <- shop products (Stripe Payment Links)
  layouts/
    Post.astro      <- post/page template
  pages/
    index.astro     <- homepage
    [slug].astro    <- dynamic post pages
public/
  admin/            <- Decap CMS (config.yml + loader)
  images/           <- downloaded site images
  styles/
    global.css      <- site-wide styles (Cormorant Garamond + Quattrocento)
```

## Local Development

```bash
npm install
npm run dev          # dev server at localhost:4321
npm run build        # build to ./dist/
npm run preview      # preview the build
```

## Content Editing

Non-technical editors use the CMS at `https://tarotflower.com/admin/`. Login with GitHub, edit posts visually, hit Save. Changes commit to this repo and auto-deploy.

To edit locally, modify markdown files in `src/content/posts/` and push.

## Deployment

Automatic. Push to `main` triggers a Cloudflare Pages build.

Build command: `npm run build`
Output directory: `dist`
