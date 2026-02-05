-- Add 'permanently_deactivated' to the subscription_status enum
ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'permanently_deactivated';