# Tarot Flower Email System Prototype

Review-only Cloudflare-native prototype for email capture, lead magnet delivery, welcome sequences, newsletters, and unsubscribes.

This is not deployed and is not wired into the current Cloudflare Pages production settings. It is intended to show the shape of an owned email system before deciding whether to use it instead of ConvertKit or MailerLite.

## What It Includes

- `src/index.js` - Worker with HTTP endpoints, queue consumer, and scheduled sequence sender.
- `migrations/0001_email_system.sql` - D1 schema and starter data.
- `wrangler.example.toml` - example bindings for D1, Queues, R2, Cron, and Email Sending.
- `emails/` - simple HTML/text templates for the confirmation and first welcome emails.

## Suggested Cloudflare Resources

- D1 database: subscribers, consent, tags, lead magnets, sequences, jobs, broadcasts.
- Queue: background email sends and broadcast fan-out.
- R2 bucket: private storage for lead magnet PDFs.
- Email Sending binding: outbound confirmation, lead magnet, sequence, newsletter, and admin emails.
- Cron Trigger: runs sequence scheduling periodically.

## Endpoints

- `POST /api/email/subscribe`
  - Body: `email`, `first_name`, `lead_magnet`, `source_path`
  - Creates or updates the subscriber, records consent, and sends a confirmation email.

- `GET /api/email/confirm?token=...`
  - Confirms the subscriber, enrolls them in the welcome sequence, queues lead magnet delivery.

- `GET /api/email/unsubscribe?token=...`
  - Shows a lightweight unsubscribe confirmation page.

- `POST /api/email/unsubscribe`
  - Body: `token`
  - Marks subscriber as unsubscribed.

- `GET /api/email/admin/subscribers`
  - Requires `Authorization: Bearer $ADMIN_TOKEN`
  - Returns subscriber list as JSON.

- `POST /api/email/admin/newsletter`
  - Requires `Authorization: Bearer $ADMIN_TOKEN`
  - Body: `subject`, `html`, `text`
  - Creates a broadcast and queues delivery to active subscribers.

## Review Notes

This prototype intentionally keeps the admin surface API-only. A future pass could add a private HTML dashboard, richer segmentation, click tracking, bounce handling, and template editing.

Before production use, confirm Cloudflare Email Sending quotas, sender authentication, physical mailing address requirements, and compliance language for the footer.
