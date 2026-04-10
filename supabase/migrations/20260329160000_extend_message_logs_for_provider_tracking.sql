-- Migration: Extend message_logs for provider tracking
-- Story: US-002 - Extend Message Logs for Provider Tracking
-- Description: Add provider tracking columns to message_logs table to support Termii and other messaging providers

-- Add provider column with CHECK constraint
ALTER TABLE message_logs 
ADD COLUMN IF NOT EXISTS provider TEXT 
CHECK (provider IN ('resend', 'termii_sms', 'termii_whatsapp', 'meta_whatsapp'));

-- Add Termii-specific tracking columns
ALTER TABLE message_logs 
ADD COLUMN IF NOT EXISTS termii_message_id TEXT;

ALTER TABLE message_logs 
ADD COLUMN IF NOT EXISTS termii_device_id TEXT;

-- Add initiated_by column to distinguish system vs salon-initiated messages
ALTER TABLE message_logs 
ADD COLUMN IF NOT EXISTS initiated_by TEXT 
CHECK (initiated_by IN ('system', 'salon'));

-- Add column comments for documentation
COMMENT ON COLUMN message_logs.provider IS 'Message provider: resend (email), termii_sms, termii_whatsapp, meta_whatsapp. NULL for backward compatibility.';
COMMENT ON COLUMN message_logs.termii_message_id IS 'Termii API message ID for tracking and delivery status (message_id or message_id_str from Termii response)';
COMMENT ON COLUMN message_logs.termii_device_id IS 'Termii device ID used to send the message';
COMMENT ON COLUMN message_logs.initiated_by IS 'Message source: system (automated, no credit charge) or salon (manual, credit charged). NULL for backward compatibility.';

-- Update channel CHECK constraint to include whatsapp
ALTER TABLE message_logs DROP CONSTRAINT IF EXISTS message_logs_channel_check;
ALTER TABLE message_logs 
ADD CONSTRAINT message_logs_channel_check 
CHECK (channel IN ('email', 'sms', 'whatsapp'));

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_message_logs_provider ON message_logs(provider);
CREATE INDEX IF NOT EXISTS idx_message_logs_initiated_by ON message_logs(initiated_by);
CREATE INDEX IF NOT EXISTS idx_message_logs_termii_message_id ON message_logs(termii_message_id) WHERE termii_message_id IS NOT NULL;
