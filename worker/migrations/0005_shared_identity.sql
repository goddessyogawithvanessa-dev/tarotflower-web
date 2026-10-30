-- Existing Library databases only. Fresh databases use worker/schema.sql.
ALTER TABLE customers ADD COLUMN user_id TEXT;
ALTER TABLE customers ADD COLUMN display_name TEXT;
ALTER TABLE customers ADD COLUMN email_verified_at INTEGER;
CREATE UNIQUE INDEX customers_user_id_idx ON customers(user_id);
ALTER TABLE sessions ADD COLUMN auth_method TEXT NOT NULL DEFAULT 'legacy';
-- Then apply worker/circle/schema.sql. No existing session is marked verified.
