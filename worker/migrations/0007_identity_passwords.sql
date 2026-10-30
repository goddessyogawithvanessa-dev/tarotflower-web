-- Additive upgrade; existing shared user IDs, entitlements and membership data remain intact.
ALTER TABLE circle_sessions ADD COLUMN credential_version INTEGER;
ALTER TABLE circle_auth_requests ADD COLUMN credential_version INTEGER;
-- Email-only sessions and outstanding passwordless handoffs cannot authorize Circle access.
UPDATE circle_sessions SET revoked_at=unixepoch() WHERE revoked_at IS NULL;
DELETE FROM circle_email_tokens;
DELETE FROM circle_auth_requests;
DELETE FROM circle_dev_outbox;

-- Credentials belong to the shared ecosystem identity, not to a product or membership.
CREATE TABLE IF NOT EXISTS identity_passwords (
  user_id TEXT PRIMARY KEY REFERENCES customers(user_id),
  password_hash TEXT NOT NULL, version INTEGER NOT NULL CHECK(version > 0),
  created_at INTEGER NOT NULL, changed_at INTEGER NOT NULL, change_token_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS identity_password_tokens (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES customers(user_id),
  purpose TEXT NOT NULL CHECK(purpose IN ('setup','reset')),
  credential_version INTEGER NOT NULL, created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL, consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS identity_password_tokens_user_idx ON identity_password_tokens(user_id,expires_at);
