# Tarot Flower

Production source for [tarotflower.com](https://tarotflower.com). Astro generates the public site into `dist/`; a Cloudflare Worker serves those assets and the private Library, checkout, authentication, email, and owner workflows.

## Approved production baseline

- 288 generated HTML routes
- 276 indexable sitemap URLs
- 1,390 historical redirect rules
- Canonical Major Arcana hub: `/major-arcana/`
- Canonical suit hubs: `/cups-tarot/`, `/pentacles-tarot/`, `/swords-tarot/`, `/wands-tarot/`
- `/tarot-card-readings/` is an indexable content landing page; `/readings-with-vanessa/` is the service and booking page
- `melissa-warwood-tantric-tarot.md` is retained as source provenance but deliberately not published

These counts are release safeguards, not editorial targets. Update the required-route manifest only after the owner approves an intentional route or artifact change.

## Stack

- Astro 7 static generation
- Cloudflare Worker with static asset binding, D1, R2, Stream, and service bindings
- Decap CMS at `/admin/`
- Git-backed Markdown content

## Local verification

```bash
npm install
npm run dev
npm run build
npm run test:deployment-safety
node --test tests/*.test.mjs
```

The full runtime suite expects a completed `dist/` build. A valid cleanup must reproduce all approved HTML routes, sitemap entries, redirects, and protected functionality—not merely pass a page-count check.

## Deployment

Production is deployed with the repository's `tarotflower-web` Wrangler Worker configuration after an explicit owner instruction. A Git push and a production deployment are separate, externally visible actions; neither is implied by a local build or commit.

Do not use the retired Cloudflare Pages workflow described in older historical notes. Do not deploy from a dirty or route-incomplete checkout.

## Source map

```text
src/content/                 published writing and retained source provenance
src/layouts/                 shared document, navigation, and article layouts
src/pages/                   generated public, private, and transactional routes
src/integrations/            post-build canonical, sitemap, and entity processing
public/_redirects            approved historical redirect inventory
public/scripts/              browser runtime modules
worker/                      Cloudflare Worker, Library, checkout, auth, and email code
tests/                       structural, route-safety, and runtime regression suites
tests/fixtures/              reviewed route and audit classifications
wrangler.jsonc               production Worker bindings and route configuration
```

Read `AGENTS.md` before changing the project. The correction history for the 2026 cleanup is in `docs/project-record-corrections.md`.
