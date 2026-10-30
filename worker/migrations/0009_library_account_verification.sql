-- Hold a password hash only while a new My Library account awaits email verification.
-- The plaintext password never leaves the registration request.
ALTER TABLE identity_password_tokens ADD COLUMN pending_password_hash TEXT;
ALTER TABLE identity_password_tokens ADD COLUMN destination_path TEXT;
