-- Allow arkesel_sms as a valid provider in message_logs.
-- The edge function send-bulk-message migrated from Termii to Arkesel for SMS
-- but the provider CHECK constraint was never updated.

ALTER TABLE message_logs
  DROP CONSTRAINT IF EXISTS message_logs_provider_check;

ALTER TABLE message_logs
  ADD CONSTRAINT message_logs_provider_check
  CHECK (provider IN ('resend', 'termii_sms', 'termii_whatsapp', 'meta_whatsapp', 'arkesel_sms'));
