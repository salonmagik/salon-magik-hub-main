-- Migration: Constrain salon_wallets currency to match tenant currency
-- Description: Ensures currency consistency across tenants, salon_wallets, and payment operations
-- Created: 2026-04-03

-- =====================================================
-- Step 1: Fix default currency mismatch
-- Change salon_wallets default from 'NGN' to 'USD' to match tenants table
-- =====================================================
ALTER TABLE salon_wallets 
ALTER COLUMN currency SET DEFAULT 'USD';

-- =====================================================
-- Step 2: Update existing mismatched wallets
-- Ensure all existing salon_wallets use the same currency as their tenant
-- =====================================================
UPDATE salon_wallets sw
SET currency = t.currency, 
    updated_at = NOW()
FROM tenants t
WHERE sw.tenant_id = t.id 
  AND sw.currency != t.currency;

-- =====================================================
-- Step 3: Add trigger-based validation
-- Since CHECK constraints cannot use subqueries, we use a trigger to enforce
-- that salon_wallets.currency must match tenants.currency
-- =====================================================

-- Create validation function
CREATE OR REPLACE FUNCTION validate_salon_wallet_currency()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_currency TEXT;
BEGIN
  -- Get the tenant's currency
  SELECT currency INTO v_tenant_currency
  FROM tenants
  WHERE id = NEW.tenant_id;
  
  -- Validate that wallet currency matches tenant currency
  IF NEW.currency != v_tenant_currency THEN
    RAISE EXCEPTION 'salon_wallets.currency (%) must match tenant.currency (%) for tenant_id %',
      NEW.currency, v_tenant_currency, NEW.tenant_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for INSERT and UPDATE operations
DROP TRIGGER IF EXISTS trigger_validate_salon_wallet_currency ON salon_wallets;
CREATE TRIGGER trigger_validate_salon_wallet_currency
  BEFORE INSERT OR UPDATE OF currency, tenant_id ON salon_wallets
  FOR EACH ROW
  EXECUTE FUNCTION validate_salon_wallet_currency();

-- Add documentation comment
COMMENT ON FUNCTION validate_salon_wallet_currency() 
IS 'Validates that salon wallet currency always matches the tenant currency to prevent currency mismatches in payment operations';

-- =====================================================
-- Step 4: Update trigger function to explicitly use tenant currency
-- Although the trigger already does this, we're making it more explicit
-- =====================================================
CREATE OR REPLACE FUNCTION create_salon_wallet_for_tenant()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert a salon_wallet for the new tenant with matching currency
  INSERT INTO public.salon_wallets (tenant_id, currency, balance)
  VALUES (NEW.id, NEW.currency, 0)
  ON CONFLICT (tenant_id) DO NOTHING; -- Idempotent: prevent duplicate if already exists
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
