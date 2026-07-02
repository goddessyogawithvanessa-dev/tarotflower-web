# Tarot Flower — AI Project Guide

This is the complete guide for any AI assistant working on the Tarot Flower website. Read this fully before making any changes.

## What This Project Is

Tarot Flower (tarotflower.com) is a tarot, astrology, and spiritual wellness site owned by Vanessa Hylande. It was migrated from WordPress/Divi to Astro on Cloudflare Pages. The site has 282 content pages (249 blog posts, 33 static pages) and 3 products.

The migration goal was 1:1 replication of the WordPress site — not a redesign. All content, images, and URLs were preserved from the original.

## Tech Stack

- **Framework:** Astro v7 (static site generation, no SSR)
- **Hosting:** Cloudflare Pages (auto-deploys from GitHub on push to `main`)
- **CMS:** Decap CMS at `/admin/` (GitHub-backed, PKCE auth)
- **Repo:** `goddessyogawithvanessa-dev/tarotflower-web` on GitHub
- **Node:** >=22.12.0

## Commands

```bash
npm run dev        # Local dev server at localhost:4321
npm run build      # Production build to dist/ (292 pages)
npm run preview    # Preview the built site
```

Always run `npm run build` after making changes to verify nothing is broken before pushing.

## Project Structure

```
astro-site/
├── src/
│   ├── layouts/
│   │   ├── Base.astro          # Master layout: <html>, <head>, nav, header, footer
│   │   └── Post.astro          # Wraps content pages: adds <h1> from frontmatter
│   ├── pages/
│   │   ├── index.astro         # Homepage (custom layout with card grids)
│   │   ├── [slug].astro        # Catch-all: renders posts/pages from content collection
│   │   ├── astrology.astro     # Custom page with zodiac sign card grid
│   │   ├── contact.astro       # Contact page with form
│   │   ├── daily-tarot.astro   # Daily tarot posts grid
│   │   ├── free-tarot-card-readings.astro
│   │   ├── moon-magic-spells.astro
│   │   ├── shop.astro          # Products listing
│   │   ├── 404.astro
│   │   ├── tag/[tag].astro     # Theme tag pages (full-moon, love, oracle, etc.)
│   │   └── product/[slug].astro # Individual product pages
│   └── content/
│       ├── posts/              # 282 markdown files (posts + pages mixed)
│       └── products/           # 3 markdown files
├── public/
│   ├── images/                 # ~98MB of images (preserved WP upload paths)
│   ├── styles/
│   │   ├── global.css          # ALL site styles (single file, ~1000 lines)
│   │   └── mmenu-light.css     # Mobile menu library styles
│   ├── scripts/
│   │   └── mmenu-light.js      # Mobile menu library
│   ├── admin/
│   │   ├── index.html          # Decap CMS entry point
│   │   └── config.yml          # CMS collection definitions
│   ├── _redirects              # Cloudflare Pages redirects (old WP paths → new)
│   └── favicon.ico / .jpg / .svg
├── plugins/
│   └── rehype-youtube.mjs      # YouTube embed transformer (unused, can be removed)
├── astro.config.mjs            # Minimal: site URL + sitemap plugin
└── package.json
```

## Content Model

All content is in `src/content/posts/` (both posts and pages) and `src/content/products/`. Astro has no content config file — it infers the schema from frontmatter.

### Post/Page frontmatter

```yaml
---
title: "The Fool Tarot Card Meaning: Freedom and New Beginnings"
slug: the-fool-tarot           # Determines the URL: /the-fool-tarot
original_url: /the-fool-tarot  # Old WP path (used for redirects)
date: 2023-05-17
modified: 2025-05-31
content_type: post             # "post" or "page" — used by CMS filters
categories: []
seo_title: "..."               # Optional, used in <title> and og:title
seo_description: "..."         # Optional, used in meta description
---
```

### Product frontmatter

Same as above plus: `price`, `image`, `stripe_link`.

### Critical rule: no `# Title` in markdown body

`Post.astro` renders `<h1>{title}</h1>` from frontmatter. If the markdown body also starts with `# Title`, you get a double title. **Never** add a top-level heading to content markdown — the layout handles it.

## Routing

- `[slug].astro` is the catch-all. It renders every post/page from the content collection EXCEPT those with dedicated custom pages.
- The `dedicatedPages` array in `[slug].astro` excludes: `astrology`, `free-tarot-card-readings`, `moon-magic-spells`, `contact`, `daily-tarot`. These have their own `.astro` files with custom layouts (card grids, zodiac grids, forms, etc.).
- If you add a new custom page, you MUST add its slug to the `dedicatedPages` array in `[slug].astro` or you'll get a build conflict.

## Layouts

### Base.astro

The master layout. Contains:
- `<head>` with SEO meta tags, Google Fonts, Font Awesome, stylesheets
- Header banner image
- Desktop navigation (mega menu with Major Arcana, Minor Arcana submenus)
- Mobile navigation (mmenu-light offcanvas drawer)
- Hamburger button (fixed position, z-index 10000)
- Footer (3-column grid: about, explore links, connect/social)
- SVG filter definitions (for glass button effects)

### Post.astro

Wraps content in `.container > h1 + .content.clearfix`. Used by `[slug].astro` for all standard posts/pages.

## Styling

**Everything is in `public/styles/global.css`.** There are no component-scoped styles, no CSS modules, no Tailwind.

### Design tokens

| Token | Value |
|-------|-------|
| Purple accent | `#881291` |
| Sage green | `#7a8b6f` |
| Body text | `#333` |
| Meta text | `#999` |
| Container | `width: 80%; max-width: 1080px` (matches WordPress Divi layout) |
| Mobile breakpoint | `768px` |

### Fonts (Google Fonts)

| Use | Font |
|-----|------|
| Page titles (h1) | Tangerine 700, 4em |
| Section headings (h2, h3) | Aboreto |
| Body text | Quattrocento |
| Arcana headings (card pages) | Cormorant Garamond |

### Key CSS patterns

- **Container width:** `.container { width: 80%; max-width: 1080px; }` — this governs ALL page widths. Do not add separate max-width rules on inner elements. Every page must use the same container.
- **Read More toggle:** `<details class="read-more-toggle"><summary>Read More</summary><div class="read-more-content">...</div></details>` — the `>` chevron rotates on open.
- **Card grids:** `.zodiac-grid` with `.zodiac-card` children — used for Major Arcana, Minor Arcana suit pages, zodiac signs, and theme pages.
- **Social icons:** Sage-colored circles in footer (not brand colors).
- **Hamburger:** Fixed position, sage circle outline at 50% opacity, z-index 10000. The mmenu `.mm-ocd` panel is z-index 10001.

### Mobile (max-width: 768px)

Container switches to `width: auto; padding: 30px 18px`. Desktop nav hides, hamburger shows. Footer collapses to single column. Images go full-width.

## Navigation

Desktop nav is in Base.astro as a `<nav class="desktop-nav">` with a mega menu. It has three sections:
- Tarot Card Readings (with sub-links)
- Tarot Card Meanings (with mega menu panels for Major Arcana and each Minor Arcana suit)
- Browse by Theme (Full Moon, Love & Twin Flames, Oracle Spreads, Shadow Work, Divine Feminine — these link to `/tag/[tag]`)

Mobile nav uses mmenu-light. The nav structure is in `<nav id="mobile-nav">` in Base.astro. The mmenu script at the bottom of Base.astro initializes it with `is:inline` (required because it references public/ assets).

## Images

All images are in `public/images/`, preserving the original WordPress upload directory structure (`/images/2023/04/filename.jpg`). Referenced in markdown as `/images/...` (no `public` prefix).

Product images are in `public/images/products/`.

## Redirects

`public/_redirects` maps old WordPress category-prefixed URLs to the new flat structure. For example:
```
/tarot-card-meanings/the-fool-tarot /the-fool-tarot 301
/embodiment/goddess-yoga /goddess-yoga 301
```

This file is critical for SEO — it preserves Google rankings from the old URL structure.

## Deployment

Push to `main` on GitHub triggers Cloudflare Pages auto-build. Build command: `npm run build`. Output directory: `astro-site/dist`. No CI/CD config files — Cloudflare Pages dashboard handles it.

## Rules for AI Assistants

1. **Only modify what is asked.** Do not make unrelated changes, cleanups, or improvements.
2. **Do not build or push unless explicitly told to.** The user will say when to build and when to push.
3. **Do not redesign.** This is a migrated WordPress site. Changes should preserve the existing look and feel unless the user explicitly asks for a design change.
4. **Do not add `# Title` headings** to content markdown. The layout renders the title.
5. **Container width is sacred.** All pages use `.container { width: 80%; max-width: 1080px }`. Do not add per-page width overrides.
6. **Test with `npm run build`** before reporting work as done. Build errors = not done.
7. **Keep styles in global.css.** Do not create new CSS files or use inline styles (except where they already exist).
8. **Preserve image paths.** Images use the original WordPress upload paths. Don't reorganize them.
9. **Astro getStaticPaths must be self-contained.** Variables defined after `getStaticPaths()` in the frontmatter are not accessible inside it — Astro hoists it separately.
10. **Scripts referencing public/ files need `is:inline`.** Without it, Astro tries to bundle them and fails on public/ imports.

## Migration Work Completed

This is what has been done during the migration from WordPress. Use this as context for what exists and why.

- Extracted all 285 pages with SEO metadata, added products collection
- Downloaded 589 images locally, rewrote all URLs from tarotflower.com to /images/
- Built complete site: homepage, nav, footer, products, CMS, sitemap, redirects
- Matched original site: fonts (Tangerine, Aboreto, Quattrocento, Cormorant Garamond), footer, nav dropdowns, zodiac grid, layout
- Homepage: full Read More text, Major Arcana card grid, Minor Arcana with suit images, hover effects
- Card page CTA banners and YouTube embeds via fix-cards.mjs
- Side-by-side image pairs at bottom of card pages
- Float bleed fix (h2 clear: both)
- 56 YouTube embeds converted across 51 files
- Astrology page with zodiac sign card grid + Read More toggle
- Moon Magic page hero layout formatting
- Contact page with form
- Footer background botanical vine image
- Nested Minor Arcana sub-menus in nav dropdown
- Witch's Journal page: all 103 blog posts, text reordering, broken image fix
- Divine Feminine Affirmations page text/video reorder
- Card grids added to all 4 suit pages (pentacles, swords, wands, cups)
- Featured images added to all 14 pentacles card grid entries (scraped from WordPress)
- Updated 4 suit pages to use correct 980x980 body images (9 images downloaded)
- Cups page: 3 images downloaded, float-right layout
- Mobile hamburger nav using mmenu-light library
- Stripped duplicate h1 headings from 30 markdown files (Post.astro already renders h1)
- Italicized intro paragraphs on minor-arcana page
- Added 4 suit divider images to minor-arcana page
- Replaced +/− on Read More boxes with rotating > chevron in text color
- Unified footer social icons to sage green outlined circles (removed per-brand colors)
- Created 404 page
- Created 5 Browse by Theme tag pages (full-moon, love, oracle, shadow-work, divine-feminine)
- Replaced plain text links on major-arcana page with 22 image cards
- Changed hamburger circle outline to sage at 50% opacity
- Added image field to products schema and Decap CMS config
- Downloaded product images from tarotflower.com
- Added placeholder Stripe links to all 3 products
- Created /shop page with auto-rendered product grid
- Updated product/[slug].astro with hero image, "Book Now" button, back-to-shop link
- Added "Shop" link to both mobile and desktop nav
- Added canonical URLs, Open Graph tags, Twitter card tags to Base.astro
- Container width set to match WordPress Divi: width: 80%, max-width: 1080px
- SEO audit: removed 6 broken image references from 17 files, converted 173 files from absolute tarotflower.com URLs to relative paths
- Redirects file (_redirects) maps all old WordPress category-prefixed URLs to new flat paths
- Sitemap generated via @astrojs/sitemap

## Remaining / Known Issues

- 219 images have empty/missing alt text (content task, not code)
- `plugins/rehype-youtube.mjs` is unused and can be removed
- Contact form backend (`functions/api/contact.js`) needs to be created at DNS cutover time
- Product Stripe links are placeholders — need real links from Vanessa
- Decap CMS GitHub OAuth app needs to be registered for production use
