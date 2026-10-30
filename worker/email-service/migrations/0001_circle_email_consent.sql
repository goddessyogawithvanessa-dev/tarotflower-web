-- Apply only to the existing EMAIL_SERVICE DB, not LIBRARY_DB.
-- Existing subscribers/consents remain unchanged. No automatic opt-in.
CREATE TABLE IF NOT EXISTS ecosystem_email_consents (
  id TEXT PRIMARY KEY REFERENCES subscriber_consents(id),
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
  user_id TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('granted','withdrawn','suppressed')),
  consented_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  withdrawn_at TEXT
);
CREATE INDEX IF NOT EXISTS ecosystem_email_consents_user_idx ON ecosystem_email_consents(user_id);
CREATE INDEX IF NOT EXISTS ecosystem_email_consents_subscriber_idx ON ecosystem_email_consents(subscriber_id);
