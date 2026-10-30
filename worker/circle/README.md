# Shared Circle identity

The Circle client integration and local runbook are in the Moonlight Circle repository’s CIRCLE-MVP.md.

Existing database: after backup/review, apply any unapplied migrations in order: 0005, 0006, 0007. Fresh databases: worker/schema.sql plus worker/circle/schema.sql. The password upgrade preserves customers, shared IDs, Circle members and product entitlements, while retiring email-only Circle sessions and handoffs.

Private production entrypoint: CircleIdentityService. Email + password is required for Circle. Browser /circle-auth/authorize and /circle-auth/verify and the internal request-link action are retired with HTTP 410. Existing Ritual Library authentication remains separate and cannot bypass Circle passwords. The /__local/circle bridge requires explicit loopback-only development and a random local secret.

Identity passwords use native scrypt N=32768/r=8/p=3 with random salts and credential versions. Enable nodejs_compat. Workers Paid CPU capacity is required; the configured ceiling is 5 seconds. No new dependency or separate identity database is introduced.

Email proofs only permit password setup/reset. They do not issue a session. Password changes revoke current Circle and Library sessions and invalidate pending Circle authorization codes. The email service exposes password-link and password-changed routes only through the private binding. Production delivery uses the fixed https://moonlightcircle.com origin. Never copy local mail capture/development configuration into production.

Local setup: node scripts/setup-circle-local.mjs /absolute/path/to/moonlight-circle-v1

Tests: node --test tests/library*.test.mjs tests/circle*.test.mjs

No live migration, email, commit, push or deployment has been performed.
