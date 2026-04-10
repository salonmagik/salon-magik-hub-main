-- Migration: Add Sender ID Approval Tracking and Legal Name
-- Description: Add columns to track Termii sender ID approval status and metadata, plus legal business name
-- Related: Sender Name Configuration Feature

-- Add legal business name column
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS legal_name TEXT;

-- Add status column for sender ID approval state
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS termii_sender_id_status TEXT DEFAULT 'not_set'
CHECK (termii_sender_id_status IN ('not_set', 'pending', 'approved', 'rejected'));

-- Add timestamp for when sender ID was requested
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS termii_sender_id_requested_at TIMESTAMPTZ;

-- Add timestamp for when sender ID was approved
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS termii_sender_id_approved_at TIMESTAMPTZ;

-- Add company name used in sender ID submission
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS termii_sender_id_company TEXT;

-- Add use case sample used in sender ID submission
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS termii_sender_id_use_case TEXT;

-- Update existing tenants to have 'not_set' status if null
UPDATE public.tenants
SET termii_sender_id_status = 'not_set'
WHERE termii_sender_id_status IS NULL;

-- Add comments to document the columns
COMMENT ON COLUMN public.tenants.legal_name IS 'Legal business name of the tenant (used for official documents and Termii sender ID registration)';
COMMENT ON COLUMN public.tenants.termii_sender_id_status IS 'Approval status of Termii sender ID: not_set (never submitted), pending (awaiting approval), approved (active), rejected (denied by Termii)';
COMMENT ON COLUMN public.tenants.termii_sender_id_requested_at IS 'Timestamp when sender ID was submitted to Termii for approval';
COMMENT ON COLUMN public.tenants.termii_sender_id_approved_at IS 'Timestamp when sender ID was approved by Termii';
COMMENT ON COLUMN public.tenants.termii_sender_id_company IS 'Company name provided when requesting sender ID from Termii';
COMMENT ON COLUMN public.tenants.termii_sender_id_use_case IS 'Sample message/use case provided when requesting sender ID from Termii';
