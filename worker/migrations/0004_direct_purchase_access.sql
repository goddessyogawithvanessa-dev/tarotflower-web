PRAGMA foreign_keys = ON;

ALTER TABLE purchases ADD COLUMN access_claimed_at INTEGER;

-- Checkout sessions that predate this migration may already have created a
-- browser session. Mark them claimed so an old success URL cannot be replayed.
UPDATE purchases
SET access_claimed_at = purchased_at
WHERE access_claimed_at IS NULL;

ALTER TABLE magic_links ADD COLUMN product_id TEXT REFERENCES products(id);
ALTER TABLE magic_links ADD COLUMN destination_path TEXT;
