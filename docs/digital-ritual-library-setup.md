# Ritual Library

Step Into Your Fire uses the production Stripe, Cloudflare Worker, D1, private R2,
Turnstile, and Google Workspace SMTP infrastructure described below.

## Future delivery TODO — Step Into Your Fire

Step Into Your Fire will ultimately include three customer-downloadable companion
assets:

1. Ritual Companion PDF
2. Complete Unified Ritual Video
3. Ritual Music Download

The Ritual Music Download is intentionally deferred. Do not implement it during
the current ritual-page redesign, and do not let it block that work. Preserve it
in the final download section and delivery-email planning so it is not removed or
forgotten when the complete delivery experience is finished.

Current priority order:

1. Finalize the ritual webpage.
2. Finalize the unified video.
3. Finalize the printable/digital companion.
4. Add the Ritual Music Download to the final delivery and download experience.

### Ritual Companion redesign gate

Do not begin the Ritual Companion PDF redesign until Vanessa explicitly confirms
that the Step Into Your Fire ritual webpage is finalized. The latest supplied PDF
is the authority for companion content, structure, journaling pages, and physical
ritual functions. The finalized ritual webpage is the authority for design.

When the redesign begins, preserve:

- preparation and orientation content;
- the four-threshold structure;
- Initiation / I Choose and Destruction / I Release journal pages;
- Guardian / I Embody and Freedom / I Receive ceremonial thresholds;
- generous writing space and the functional I RELEASE tear-away area;
- the locked Blessing, Open the Circle, and Reflections & Messages;
- all four reflection questions together as whispers;
- two additional open journal pages; and
- the final offerings page.

The result must be an A4, home-printer-optimized, ink-conscious, high-contrast,
digitally annotatable printable grimoire with generous handwriting space. Use
only existing project imagery—no AI-generated imagery. Do not preserve the
current PDF's visual design and do not reduce the companion to a printout of the
webpage.

### Unified-video interaction

The PRESS PLAY control targets the on-page `complete-ritual-video` region. When
the final protected video replaces the placeholder, retain the
`data-unified-video-target` hook on either the `<video>` element or its wrapper.
The control will then scroll smoothly to the player, focus it, and start playback
from the customer's click. The final unified video asset is still pending.

## Cloudflare resources

- Worker: existing `tarotflower-web`
- D1: `tarotflower-library`
- Private R2: `tarotflower-digital-rituals`
- Service binding: `EMAIL_SERVICE` -> `tarotflower-web-dev#LibraryEmailService`
- Static assets binding: existing `ASSETS`

## Environment values

- `APP_ORIGIN=https://tarotflower.com`
- `LIBRARY_TEST_MODE=false`
- `TURNSTILE_SITE_KEY=<production site key>`
- `TURNSTILE_EXPECTED_HOSTNAME=tarotflower.com`

## Secrets

- `STRIPE_SECRET_KEY=<restricted live key with Checkout Sessions read access>`
- `STRIPE_WEBHOOK_SECRET=<live webhook signing secret>`
- `TURNSTILE_SECRET_KEY=<existing Turnstile secret>`
- `TOKEN_PEPPER=<new cryptographically random value of at least 32 bytes>`

`TOKEN_PEPPER` must remain stable after launch because it protects stored
rate-limit identifiers. None of these values may be exposed to Astro pages or
browser JavaScript.

## Email service-binding contract

The library Worker sends an internal request to the named service entrypoint on
the existing email Worker:

```json
{
  "to": "customer@example.com",
  "subject": "Your secure Tarot Flower library link",
  "magicLink": "https://tarotflower.com/library/auth?token=...",
  "expiresInMinutes": 15
}
```

The named entrypoint is available only through the Cloudflare service binding.
It delivers the message through the established Google Workspace SMTP
implementation. No Gmail API access is required.

## D1 initialization

Apply `worker/schema.sql`, then seed the live product with `worker/seed.sql`.
The schema remains separate from product data so product configuration can be
updated without rebuilding customer or entitlement records.

## Private R2 object keys

- `test/step-into-the-fire/ritual-guide.pdf`
- `test/step-into-the-fire/original-music.mp3`
- `test/step-into-the-fire/movement-practice.mp4`

These object keys remain server-side. Customer-facing responses expose only
entitlement-checked Worker routes.

## Local verification

1. Copy `.dev.vars.example` to `.dev.vars` if the setup script has not already
   created it.
2. Run `npm run build`.
3. Run `npm run library:setup` to create local D1/R2 fixtures.
4. Run `npm run library:dev`.
5. Run `npm run test:library` for the isolated security and access suite.

Local test mode uses a non-production magic-link preview and test Turnstile
token. Neither behavior is enabled in production.

## Production verification

- Confirm the live Stripe Payment Link is $33 USD and redirects successful
  checkouts to `/library/claim?session_id={CHECKOUT_SESSION_ID}`.
- Confirm a real magic-link message reaches an entitled customer address.
- Confirm duplicate webhook delivery creates one purchase and one entitlement.
- Confirm the private bucket has no public hostname.
- Confirm Cloudflare logs do not contain raw magic tokens, session tokens,
  Stripe secrets, or private R2 object keys.
- Add retention/export procedures for D1 and confirm recovery from a backup.
