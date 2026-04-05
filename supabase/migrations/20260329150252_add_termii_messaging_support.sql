-- Migration: Add Termii Configuration Fields
-- Description: Add Termii device ID and sender ID columns to tenants table for WhatsApp and SMS messaging support
-- Related User Story: US-001

-- Add termii_device_id column (nullable, to be configured per tenant)
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS termii_device_id TEXT;

-- Add termii_sender_id column with default value 'SalonMagik'
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS termii_sender_id TEXT DEFAULT 'SalonMagik';

-- Update existing tenants to have default sender ID if null
UPDATE public.tenants
SET termii_sender_id = 'SalonMagik'
WHERE termii_sender_id IS NULL;

-- Add comment to document the columns
COMMENT ON COLUMN public.tenants.termii_device_id IS 'Termii device ID for sending WhatsApp and SMS messages via Termii API';
COMMENT ON COLUMN public.tenants.termii_sender_id IS 'Alphanumeric sender ID (3-11 characters) for SMS messages, defaults to SalonMagik';
