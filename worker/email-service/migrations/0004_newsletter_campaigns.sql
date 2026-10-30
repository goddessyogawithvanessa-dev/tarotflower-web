-- Standalone newsletter campaigns. This is intentionally separate from the
-- existing automated sequence tables so campaign sends cannot alter purchase,
-- library, Goddess Guide, Oracle, or welcome-sequence delivery state.
CREATE TABLE IF NOT EXISTS newsletter_campaigns (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  preview_text TEXT NOT NULL DEFAULT '',
  html_template TEXT NOT NULL,
  text_template TEXT NOT NULL,
  from_name TEXT NOT NULL,
  from_email TEXT NOT NULL,
  reply_to TEXT NOT NULL,
  public_origin TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  approved_content_hash TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','approving','sending','sent','partial','failed','blocked','canceled')),
  eligible_recipient_count INTEGER NOT NULL DEFAULT 0,
  provider_accepted_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  unsubscribe_count INTEGER NOT NULL DEFAULT 0,
  bounce_count INTEGER NOT NULL DEFAULT 0,
  complaint_count INTEGER NOT NULL DEFAULT 0,
  owner_copy_status TEXT NOT NULL DEFAULT 'not_queued'
    CHECK (owner_copy_status IN ('not_queued','pending','sending','accepted','retry','failed','skipped')),
  tracking_mode TEXT NOT NULL DEFAULT 'disabled' CHECK (tracking_mode = 'disabled'),
  provider_name TEXT NOT NULL DEFAULT 'gmail_smtp',
  provider_delivery_visibility TEXT NOT NULL DEFAULT 'acceptance_only',
  approved_by TEXT,
  approved_at TEXT,
  sending_started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS newsletter_campaign_recipients (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  subscriber_id TEXT,
  email TEXT NOT NULL COLLATE NOCASE,
  first_name TEXT,
  recipient_kind TEXT NOT NULL CHECK (recipient_kind IN ('subscriber','owner')),
  unsubscribe_token TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sending','accepted','retry','failed','skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  provider_message_id TEXT,
  last_error TEXT,
  accepted_at TEXT,
  failed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (campaign_id, email),
  FOREIGN KEY (campaign_id) REFERENCES newsletter_campaigns(id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);

CREATE INDEX IF NOT EXISTS idx_newsletter_campaign_recipients_due
  ON newsletter_campaign_recipients(status, next_attempt_at, campaign_id);

CREATE TABLE IF NOT EXISTS newsletter_campaign_events (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  recipient_id TEXT,
  event_type TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES newsletter_campaigns(id),
  FOREIGN KEY (recipient_id) REFERENCES newsletter_campaign_recipients(id)
);

CREATE INDEX IF NOT EXISTS idx_newsletter_campaign_events_campaign
  ON newsletter_campaign_events(campaign_id, created_at DESC);
