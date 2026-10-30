-- Additive. No existing member or email subscriber is opted in by this migration.
CREATE TABLE IF NOT EXISTS circle_email_consents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES customers(user_id),
  email TEXT NOT NULL COLLATE NOCASE,
  status TEXT NOT NULL CHECK(status IN ('granted','declined')),
  version TEXT NOT NULL,
  consent_text TEXT NOT NULL,
  recorded_at INTEGER NOT NULL,
  synced_at INTEGER,
  subscriber_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id,version)
);
CREATE INDEX IF NOT EXISTS circle_email_consents_pending_idx
  ON circle_email_consents(next_attempt_at) WHERE status='granted' AND synced_at IS NULL;
