PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS circle_sources (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);
INSERT OR IGNORE INTO circle_sources(id,label) VALUES
 ('ritual-product','Tarot Flower ritual / product'),
 ('tarot-reading','Tarot reading'),
 ('sacred-becoming-oracle','Sacred Becoming / Oracle'),
 ('goddess-yoga-retreat','Goddess Yoga retreat'),
 ('goddess-yoga-class-workshop','Goddess Yoga class / workshop'),
 ('personal-invitation','Personal invitation'),
 ('legacy-moonlight-circle','Legacy Moonlight Circle membership'),
 ('other','Other qualifying source');

CREATE TABLE IF NOT EXISTS circle_invitations (
  id TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE,
  source_id TEXT NOT NULL REFERENCES circle_sources(id),
  invited_by TEXT NOT NULL REFERENCES customers(user_id),
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  accepted_at INTEGER, revoked_at INTEGER
);
CREATE TABLE IF NOT EXISTS circle_eligibility (
  id TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE,
  user_id TEXT REFERENCES customers(user_id),
  source_id TEXT NOT NULL REFERENCES circle_sources(id),
  reason TEXT NOT NULL, evidence_reference TEXT NOT NULL,
  invitation_id TEXT REFERENCES circle_invitations(id),
  granted_by TEXT NOT NULL, granted_at INTEGER NOT NULL, revoked_at INTEGER,
  UNIQUE(email,source_id,evidence_reference)
);
CREATE INDEX IF NOT EXISTS circle_eligibility_email_idx ON circle_eligibility(email,revoked_at);
CREATE TABLE IF NOT EXISTS circle_memberships (
  user_id TEXT PRIMARY KEY REFERENCES customers(user_id),
  joined_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','suspended','left')),
  updated_at INTEGER NOT NULL,
  initial_eligibility_id TEXT NOT NULL REFERENCES circle_eligibility(id)
);
CREATE TABLE IF NOT EXISTS circle_acceptances (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES customers(user_id),
  document TEXT NOT NULL, version TEXT NOT NULL, accepted_at INTEGER NOT NULL,
  UNIQUE(user_id,document,version)
);
CREATE TABLE IF NOT EXISTS circle_auth_requests (
  request_hash TEXT PRIMARY KEY, state TEXT NOT NULL,
  code_challenge TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  user_id TEXT REFERENCES customers(user_id),
  code_hash TEXT UNIQUE, code_expires_at INTEGER, exchanged_at INTEGER,
  identity_session_hash TEXT, library_session_hash TEXT
);
CREATE TABLE IF NOT EXISTS circle_email_tokens (
  token_hash TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL REFERENCES circle_auth_requests(request_hash),
  user_id TEXT NOT NULL REFERENCES customers(user_id),
  expires_at INTEGER NOT NULL, consumed_at INTEGER
);
CREATE TABLE IF NOT EXISTS circle_sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES customers(user_id),
  audience TEXT NOT NULL CHECK(audience IN ('identity','moonlight')),
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER,
  parent_session_hash TEXT, library_session_hash TEXT
);
CREATE INDEX IF NOT EXISTS circle_sessions_user_idx ON circle_sessions(user_id,audience,revoked_at);
CREATE TABLE IF NOT EXISTS circle_rate_limits (
  key_hash TEXT PRIMARY KEY, window_start INTEGER NOT NULL, attempts INTEGER NOT NULL
);
-- Used only by explicitly enabled loopback development. Never populated by production delivery.
CREATE TABLE IF NOT EXISTS circle_dev_outbox (
  request_hash TEXT PRIMARY KEY, recipient TEXT NOT NULL, magic_link TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
