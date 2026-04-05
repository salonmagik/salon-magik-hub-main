-- Migration: Add atomicity and double-spend prevention constraints for salon withdrawals
-- Description: Adds unique constraints on paystack_reference and indexes for duplicate detection
-- Created: 2026-04-04

-- =====================================================
-- Add unique constraint on paystack_reference
-- =====================================================

-- This ensures that the same Paystack transfer cannot be recorded twice
-- The constraint is nullable-aware, so NULL values are allowed (for failed withdrawals)
ALTER TABLE salon_withdrawals 
ADD CONSTRAINT salon_withdrawals_paystack_reference_unique 
UNIQUE NULLS NOT DISTINCT (paystack_reference);

COMMENT ON CONSTRAINT salon_withdrawals_paystack_reference_unique ON salon_withdrawals 
IS 'Ensures Paystack transfer references are unique to prevent duplicate transfer processing';

-- =====================================================
-- Add index for duplicate withdrawal detection
-- =====================================================

-- This index helps detect duplicate withdrawal attempts:
-- - Same tenant
-- - Same destination
-- - Same amount
-- - Within time window (typically 5 minutes)
CREATE INDEX idx_salon_withdrawals_duplicate_detection 
ON salon_withdrawals (tenant_id, payout_destination_id, amount, requested_at DESC)
WHERE status IN ('pending', 'processing');

COMMENT ON INDEX idx_salon_withdrawals_duplicate_detection 
IS 'Optimizes duplicate withdrawal detection queries by tenant, destination, amount, and time';

-- =====================================================
-- Add index for status-based queries
-- =====================================================

-- This index helps check for existing pending/processing withdrawals for a tenant
CREATE INDEX idx_salon_withdrawals_status_lookup 
ON salon_withdrawals (tenant_id, status, requested_at DESC);

COMMENT ON INDEX idx_salon_withdrawals_status_lookup 
IS 'Optimizes queries checking for active withdrawals by tenant and status';

-- =====================================================
-- Add index on wallet_ledger_entries for reversal lookups
-- =====================================================

-- This index helps the create_wallet_reversal function check for existing reversals
-- and improves performance when querying ledger entries by idempotency_key
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_entries_idempotency_key 
ON wallet_ledger_entries (idempotency_key)
WHERE idempotency_key IS NOT NULL;

COMMENT ON INDEX idx_wallet_ledger_entries_idempotency_key 
IS 'Optimizes idempotency checks in wallet operations';
