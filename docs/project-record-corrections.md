# Project record corrections — 2026 cleanup

This record reconciles earlier audit assumptions with the approved production site. Historical reports remain historical evidence; this file does not rewrite them.

| Earlier assumption | Verified replacement | Evidence preserved by tests |
| --- | --- | --- |
| `/tarot-card-readings/` was a missing booking-navigation destination. | It is a separate, indexable content landing page. `/readings-with-vanessa/` is the service page and links to `/checkout/readings-with-vanessa/`. No additional primary-navigation item is required. | `tests/project-record.test.mjs` checks both roles, canonicals, sitemap status, and checkout link. |
| Readings, Major Arcana, Minor Arcana, or Astrology were absent from navigation. | Both responsive navigation renderings already contain the approved five Tarot destinations and labels. | The project-record test inspects both generated navigation structures. |
| `/major-arcana-2/` was the desired hub. | `/major-arcana/` is the only published canonical hub. The `-2` path and verified WordPress category aliases remain direct 301 redirects. | Project-record and sitewide graph tests validate the canonical and direct redirects. |
| The historical Cups category archive was still missing. | Slash and no-slash variants redirect directly to `/cups-tarot/`; the destination is generated and self-canonical. | Project-record and required-route tests preserve the two rules and destination. |
| Every absent WordPress page represented an accidental loss. | Retired WordPress plugins, accounts, tags, taxonomies, checkout, and administration are not current features. Approved redirects protect useful historical signals without restoring obsolete infrastructure. | The complete redirect inventory and retained-import audit remain required. |
| Melissa Warwood's page was an accidental missing route. | Its Markdown and images are retained as provenance, but the owner deliberately unpublished the page. It has no generated HTML, sitemap URL, or speculative redirect. | Sitewide and project-record tests enforce source-only status. |
| An old crawl report proved a current production defect. | Historical crawl evidence describes its observation date. Current failures require current build or live-response evidence. | Clean-build graph, canonical, sitemap, redirect, and runtime suites provide current evidence. |
| The site deploys through the original Cloudflare Pages setup. | The approved production application is a Cloudflare Worker named `tarotflower-web`, with `dist/` assets and Worker bindings. Deployment requires separate owner authorization. | `wrangler.jsonc`, required-route manifest checks, and Worker runtime tests define the release surface. |

## Current protected architecture

- 288 generated HTML routes and 276 sitemap URLs.
- 1,390 approved historical redirect rules.
- Canonical hubs: `/major-arcana/`, `/cups-tarot/`, `/pentacles-tarot/`, `/swords-tarot/`, and `/wands-tarot/`.
- Sacred Becoming, Oracle waitlist, FIRE checkout and access, Library authentication, Workbench, forms, consent, and email flows remain part of the protected runtime.

The counts above are the approved baseline for this cleanup. They must not be changed merely to make a test pass.

## Deliberately deferred cleanup

- Desktop and mobile navigation markup remain separate because their responsive structures are materially different. Automated parity checks now protect their shared authoritative destinations; consolidating the markup would create sitewide HTML differences and requires a separately reviewed refactor.
- `Post.astro` contains repeated editorial-journey structures. Consolidating them risks changing approved copy or rendered markup and therefore requires a dedicated, output-equivalence review.
- Both npm and pnpm lockfiles remain until the owner selects one package-manager workflow; removing either without that decision could break clean-checkout reproducibility.
