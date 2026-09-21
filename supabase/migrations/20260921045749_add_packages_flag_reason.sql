-- packages was missed when flag_reason was added to services/products
-- alongside is_flagged in 20260207011655_5cd35d69-8ce9-4083-a00e-664c8f729a40.sql,
-- so flagging a package for review had no column to record the reason in.
ALTER TABLE packages
ADD COLUMN IF NOT EXISTS flag_reason TEXT;
