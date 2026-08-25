PRAGMA foreign_keys = ON;

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

UPDATE products
SET slug = 'step-into-your-fire',
    title = 'Step Into Your Fire',
    description = 'A ritual for courage and confidence.',
    experience_path = '/library/rituals/step-into-your-fire/',
    assets_json = replace(
      replace(
        replace(assets_json,
          'step-into-the-fire-test-guide.pdf',
          'step-into-your-fire-guide.pdf'),
        'step-into-the-fire-test-music.mp3',
        'step-into-your-fire-music.mp3'),
      'step-into-the-fire-test-movement.mp4',
      'step-into-your-fire-movement.mp4'),
    updated_at = unixepoch()
WHERE id = 'ritual-step-into-the-fire-test';
