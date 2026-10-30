PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS customers (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  stripe_customer_id TEXT UNIQUE,
  user_id TEXT UNIQUE,
  display_name TEXT,
  email_verified_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  image_path TEXT NOT NULL,
  experience_path TEXT NOT NULL,
  stripe_price_id TEXT UNIQUE,
  stripe_payment_link_id TEXT UNIQUE,
  assets_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS purchases (
  stripe_checkout_session_id TEXT PRIMARY KEY,
  stripe_payment_intent_id TEXT,
  customer_email TEXT NOT NULL COLLATE NOCASE,
  product_id TEXT NOT NULL,
  amount_total INTEGER NOT NULL,
  currency TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  purchased_at INTEGER NOT NULL,
  access_claimed_at INTEGER,
  FOREIGN KEY (customer_email) REFERENCES customers(email),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS purchases_customer_email_idx
  ON purchases(customer_email);

CREATE TABLE IF NOT EXISTS purchase_access_emails (
  stripe_checkout_session_id TEXT PRIMARY KEY,
  customer_email TEXT NOT NULL COLLATE NOCASE,
  created_at INTEGER NOT NULL,
  claimed_at INTEGER,
  sent_at INTEGER,
  failed_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  FOREIGN KEY (stripe_checkout_session_id) REFERENCES purchases(stripe_checkout_session_id),
  FOREIGN KEY (customer_email) REFERENCES customers(email)
);

CREATE INDEX IF NOT EXISTS purchase_access_emails_unsent_idx
  ON purchase_access_emails(sent_at, claimed_at);

CREATE TABLE IF NOT EXISTS entitlements (
  customer_email TEXT NOT NULL COLLATE NOCASE,
  product_id TEXT NOT NULL,
  source_checkout_session_id TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  revoked_at INTEGER,
  PRIMARY KEY (customer_email, product_id),
  FOREIGN KEY (customer_email) REFERENCES customers(email),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (source_checkout_session_id) REFERENCES purchases(stripe_checkout_session_id)
);

CREATE INDEX IF NOT EXISTS entitlements_customer_active_idx
  ON entitlements(customer_email, revoked_at);

CREATE TABLE IF NOT EXISTS magic_links (
  token_hash TEXT PRIMARY KEY,
  customer_email TEXT NOT NULL COLLATE NOCASE,
  product_id TEXT,
  destination_path TEXT,
  requested_ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  FOREIGN KEY (customer_email) REFERENCES customers(email),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS magic_links_customer_created_idx
  ON magic_links(customer_email, created_at);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  customer_email TEXT NOT NULL COLLATE NOCASE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  revoked_at INTEGER,
  auth_method TEXT NOT NULL DEFAULT 'legacy',
  FOREIGN KEY (customer_email) REFERENCES customers(email)
);

CREATE INDEX IF NOT EXISTS sessions_customer_active_idx
  ON sessions(customer_email, revoked_at, expires_at);

CREATE TABLE IF NOT EXISTS processed_stripe_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key_hash TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL,
  blocked_until INTEGER
);

-- Shared Tarot Flower identity credentials. Existing production databases receive
-- these tables through migration 0007, while these definitions support fresh installs.
CREATE TABLE IF NOT EXISTS identity_passwords (
  user_id TEXT PRIMARY KEY REFERENCES customers(user_id),
  password_hash TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version > 0),
  created_at INTEGER NOT NULL,
  changed_at INTEGER NOT NULL,
  change_token_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS identity_password_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES customers(user_id),
  purpose TEXT NOT NULL CHECK(purpose IN ('setup','reset')),
  credential_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  pending_password_hash TEXT,
  destination_path TEXT
);

CREATE INDEX IF NOT EXISTS identity_password_tokens_user_idx
  ON identity_password_tokens(user_id, expires_at);
