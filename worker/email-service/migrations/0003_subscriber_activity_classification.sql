-- Explicit business-activity classification. Historical rows remain intact.
-- this metadata controls reporting and marketing audience selection only.
CREATE TABLE IF NOT EXISTS subscriber_activity_classifications (
  subscriber_id TEXT PRIMARY KEY,
  classification TEXT NOT NULL CHECK (classification IN ('production', 'qa', 'test', 'review')),
  reason_code TEXT NOT NULL,
  evidence TEXT NOT NULL,
  classified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  classified_by TEXT NOT NULL,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS subscriber_activity_classification_idx
  ON subscriber_activity_classifications(classification, subscriber_id);

-- Production audit completed 2026-10-29 against tarotflower-leads-dev.
-- Exact immutable subscriber IDs are used deliberately: no address pattern,
-- provider, alias, or purchase amount is treated as proof of test activity.
WITH audited(subscriber_id, classification, reason_code, evidence, classified_at, classified_by) AS (VALUES
  ('e2c33ae9-d909-4ab1-a177-533788a00ed8', 'production', 'verified_public_consent', 'Tarot Flower newsletter and Goddess Guide consent with completed production welcome sequence.', '2026-10-29T00:00:00Z', 'production-audit-2026-10-29'),
  ('418a460a-b26e-4820-b177-6607bb7f81b6', 'test', 'codex_development', 'Codex development guide capture.', '2026-10-29T00:00:00Z', 'production-audit-2026-10-29'),
  ('b69c1a86-1da4-4862-a51d-895b82c0a6e9', 'test', 'codex_development', 'Codex R2 development verification.', '2026-10-29T00:00:00Z', 'production-audit-2026-10-29'),
  ('8970cc6f-8ef4-4575-bcc0-cf3e45a7d203', 'test', 'codex_development', 'Codex campaign enrollment test.', '2026-10-29T00:00:00Z', 'production-audit-2026-10-29'),
  ('425660a4-e56c-49e0-ad17-77ac2f64efab', 'test', 'codex_delivery', 'Codex delivery test with expected verification failure.', '2026-10-29T00:00:00Z', 'production-audit-2026-10-29'),
  ('c6f7c286-0a94-4d42-9ad2-1bcdbebd98d3', 'test', 'codex_unsubscribe', 'Codex cancel and unsubscribe test.', '2026-10-29T00:00:00Z', 'production-audit-2026-10-29'),
  ('4e607214-16ea-4694-b9a1-8543e9f40c4b', 'test', 'codex_e2e', 'Codex end-to-end delivery test.', '2026-10-29T00:00:00Z', 'production-audit-2026-10-29'),
  ('smtp-test-20260712', 'test', 'smtp_test', 'SMTP authentication test.', '2026-10-29T00:00:00Z', 'production-audit-2026-10-29'),
  ('ea4adab7-ba89-45c2-8aae-27dff0d81a73', 'test', 'smtp_test', 'SMTP retry and delivery test.', '2026-10-29T00:00:00Z', 'production-audit-2026-10-29'),
  ('78b1dd2e-1087-4288-853f-c3002d270486', 'test', 'recipient_test', 'Lead-recipient delivery test.', '2026-10-29T00:00:00Z', 'production-audit-2026-10-29'),
  ('92a2c238-e79d-43ff-82f1-526031de2698', 'test', 'cleanup_test', 'Historical cleanup verification.', '2026-10-29T00:00:00Z', 'production-audit-2026-10-29'),
  ('d94f90f5-cb08-4387-b53e-5f56505b7446', 'qa', 'owner_qa', 'Owner-controlled guide and unsubscribe verification.', '2026-10-29T00:00:00Z', 'production-audit-2026-10-29'),
  ('6a731691-8881-446b-8fbc-c3ad1623cd3f', 'qa', 'owner_qa', 'Workbench owner guide verification.', '2026-10-29T00:00:00Z', 'production-audit-2026-10-29'),
  ('f6ead553-b080-43d5-9d2b-490145d3348d', 'qa', 'owner_qa', 'Owner-controlled delivery verification.', '2026-10-29T00:00:00Z', 'production-audit-2026-10-29'),
  ('57054678-8ae5-4851-8fed-8f7637af7235', 'qa', 'owner_qa', 'Owner-controlled delivery verification.', '2026-10-29T00:00:00Z', 'production-audit-2026-10-29'),
  ('0ee16baa-d504-415c-8faf-4a34dd8e0dda', 'qa', 'tarotflower_qa', 'Tarot Flower QA capture.', '2026-10-29T00:00:00Z', 'production-audit-2026-10-29'),
  ('e77668ae-19b8-4020-9608-df40219392a0', 'qa', 'production_verification', 'Production guide delivery verification.', '2026-10-29T00:00:00Z', 'production-audit-2026-10-29'),
  ('4ccd6bbd-fe0a-47a3-8665-2ab225e5382b', 'qa', 'header_verification', 'Production header verification.', '2026-10-29T00:00:00Z', 'production-audit-2026-10-29'),
  ('e6c8ff21-cd6c-4da1-af7e-6eb58ec9b8f9', 'qa', 'gyr_verification', 'Goddess Yoga Retreats subscription verification.', '2026-10-29T00:00:00Z', 'production-audit-2026-10-29')
)
INSERT OR REPLACE INTO subscriber_activity_classifications
  (subscriber_id, classification, reason_code, evidence, classified_at, classified_by)
SELECT a.subscriber_id, a.classification, a.reason_code, a.evidence, a.classified_at, a.classified_by
FROM audited a JOIN subscribers s ON s.id=a.subscriber_id;
