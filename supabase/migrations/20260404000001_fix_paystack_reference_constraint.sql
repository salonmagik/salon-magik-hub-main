-- Migration: Fix paystack_reference constraint to allow multiple NULLs
-- Description: Replaces UNIQUE NULLS NOT DISTINCT constraint with partial unique index
-- Created: 2026-04-04

-- =====================================================
-- Remove the problematic constraint
-- =====================================================

ALTER TABLE salon_withdrawals 
DROP CONSTRAINT IF EXISTS salon_withdrawals_paystack_reference_unique;

-- =====================================================
-- Add partial unique index instead
-- =====================================================

-- This index only enforces uniqueness on non-NULL paystack_reference values
-- Multiple NULL values are allowed (for failed withdrawals that never got a Paystack reference)
CREATE UNIQUE INDEX idx_salon_withdrawals_paystack_reference_unique 
ON salon_withdrawals (paystack_reference)
WHERE paystack_reference IS NOT NULL;

COMMENT ON INDEX idx_salon_withdrawals_paystack_reference_unique 
IS 'Ensures non-NULL Paystack transfer references are unique. Allows multiple NULLs for failed withdrawals.';
