CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  source_path TEXT,
  lead_magnet_slug TEXT,
  confirm_token TEXT NOT NULL UNIQUE,
  unsubscribe_token TEXT NOT NULL UNIQUE,
  consent_ip TEXT,
  consent_user_agent TEXT,
  consented_at TEXT,
  confirmed_at TEXT,
  unsubscribed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status);
CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);

CREATE TABLE IF NOT EXISTS subscriber_tags (
  subscriber_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (subscriber_id, tag),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);

CREATE TABLE IF NOT EXISTS lead_magnets (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  file_key TEXT NOT NULL,
  delivery_subject TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_sequences (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  trigger_tag TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_sequence_steps (
  id TEXT PRIMARY KEY,
  sequence_id TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  delay_hours INTEGER NOT NULL,
  subject TEXT NOT NULL,
  html_template TEXT NOT NULL,
  text_template TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sequence_id) REFERENCES email_sequences(id)
);

CREATE TABLE IF NOT EXISTS subscriber_sequence_steps (
  subscriber_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  due_at TEXT NOT NULL,
  sent_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  PRIMARY KEY (subscriber_id, step_id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id),
  FOREIGN KEY (step_id) REFERENCES email_sequence_steps(id)
);

CREATE INDEX IF NOT EXISTS idx_sequence_steps_due ON subscriber_sequence_steps(status, due_at);

CREATE TABLE IF NOT EXISTS broadcasts (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  queued_at TEXT,
  sent_at TEXT
);

CREATE TABLE IF NOT EXISTS email_jobs (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL,
  job_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);

CREATE TABLE IF NOT EXISTS subscriber_events (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT,
  event_type TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);

INSERT OR IGNORE INTO lead_magnets (
  slug,
  title,
  file_key,
  delivery_subject
) VALUES (
  'first-3-card-pull',
  'Your First 3-Card Pull',
  'lead-magnets/first-3-card-pull.pdf',
  'Your free 3-Card Pull Guide'
);

INSERT OR IGNORE INTO email_sequences (
  id,
  name,
  trigger_tag
) VALUES (
  'welcome-deck-launch',
  'Deck Launch Welcome Sequence',
  'lead:first-3-card-pull'
);

INSERT OR IGNORE INTO email_sequence_steps (
  id,
  sequence_id,
  step_order,
  delay_hours,
  subject,
  html_template,
  text_template
) VALUES
  (
    'welcome-1',
    'welcome-deck-launch',
    1,
    0,
    'Welcome to Tarot Flower',
    '<p>Welcome, {{first_name}}. Here is your guide: <a href="{{lead_magnet_url}}">download it here</a>.</p><p>I am so glad you are here.</p>',
    'Welcome, {{first_name}}. Here is your guide: {{lead_magnet_url}}'
  ),
  (
    'welcome-2',
    'welcome-deck-launch',
    2,
    48,
    'How I read tarot differently',
    '<p>Tarot Flower is rooted in intuition, embodiment, and goddess energy.</p>',
    'Tarot Flower is rooted in intuition, embodiment, and goddess energy.'
  ),
  (
    'welcome-3',
    'welcome-deck-launch',
    3,
    120,
    'A card pull for the current moon',
    '<p>Today, take one card and ask what wants to be witnessed.</p>',
    'Today, take one card and ask what wants to be witnessed.'
  ),
  (
    'welcome-4',
    'welcome-deck-launch',
    4,
    192,
    'Why I created the Tarot Flower deck',
    '<p>The deck began as a living extension of the teachings on Tarot Flower.</p>',
    'The deck began as a living extension of the teachings on Tarot Flower.'
  ),
  (
    'welcome-5',
    'welcome-deck-launch',
    5,
    240,
    'The Tarot Flower deck is ready for you',
    '<p>The Tarot Flower deck brings these meanings into your hands. When the sales page is live, this email will link to it.</p>',
    'The Tarot Flower deck brings these meanings into your hands. When the sales page is live, this email will link to it.'
  );
