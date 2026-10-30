-- Schema only, read from the bound production email database on 2026-09-23. No subscriber data.
CREATE TABLE email_sequence_steps (
  id TEXT PRIMARY KEY,
  sequence_id TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  delay_hours INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, subject TEXT, html_template TEXT, text_template TEXT, email_type TEXT NOT NULL DEFAULT 'sequence',
  UNIQUE(sequence_id, step_order),
  UNIQUE(sequence_id, slug),
  FOREIGN KEY (sequence_id) REFERENCES email_sequences(id)
);

CREATE TABLE email_sequences (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  trigger_tag TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE subscriber_consents (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL,
  consent_text TEXT NOT NULL,
  source_path TEXT NOT NULL,
  lead_magnet_slug TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  consented_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);

CREATE TABLE subscriber_events (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT,
  event_type TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);

CREATE TABLE subscriber_sequence_enrollments (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL,
  sequence_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  source_tag TEXT NOT NULL,
  lead_magnet_slug TEXT NOT NULL,
  enrolled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  UNIQUE(subscriber_id, sequence_id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id),
  FOREIGN KEY (sequence_id) REFERENCES email_sequences(id)
);

CREATE TABLE subscriber_sequence_step_deliveries (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL,
  sequence_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  due_at TEXT NOT NULL,
  sent_at TEXT,
  failed_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(subscriber_id, step_id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id),
  FOREIGN KEY (sequence_id) REFERENCES email_sequences(id),
  FOREIGN KEY (step_id) REFERENCES email_sequence_steps(id)
);

CREATE TABLE subscriber_tags (
  subscriber_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (subscriber_id, tag),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);

CREATE TABLE subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  unsubscribed_at TEXT
, unsubscribe_token TEXT);
