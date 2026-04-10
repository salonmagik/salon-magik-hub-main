-- Migration: Add currency column to customer_purses table
-- Description: Add currency column to support multi-currency customer purses

-- Add currency column to customer_purses (nullable first for existing data)
ALTER TABLE customer_purses
ADD COLUMN IF NOT EXISTS currency TEXT;

-- Backfill currency from tenant's currency for existing records
UPDATE customer_purses cp
SET currency = t.currency
FROM tenants t
WHERE cp.tenant_id = t.id
  AND cp.currency IS NULL;

-- Make currency NOT NULL after backfill
ALTER TABLE customer_purses
ALTER COLUMN currency SET NOT NULL;

-- Set default to 'NGN' for future inserts (will be overridden by RPC functions)
ALTER TABLE customer_purses
ALTER COLUMN currency SET DEFAULT 'NGN';

-- Add comment for documentation
COMMENT ON COLUMN customer_purses.currency IS 'ISO 4217 currency code (USD, GHS, NGN, EUR, GBP). Inherited from tenant currency on creation.';
