# Digital Ritual Library

Step Into the Fire uses the production Stripe, Cloudflare Worker, D1, private R2,
Turnstile, and Google Workspace SMTP infrastructure described below.

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
