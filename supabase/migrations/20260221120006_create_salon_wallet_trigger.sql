-- Migration: Create auto-create salon wallet trigger
-- US-007: Automatically create a salon_wallet when a tenant is created
-- and backfill existing tenants

-- Create the trigger function
CREATE OR REPLACE FUNCTION create_salon_wallet_for_tenant()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert a salon_wallet for the new tenant
  INSERT INTO public.salon_wallets (tenant_id, currency, balance)
  VALUES (NEW.id, NEW.currency, 0)
  ON CONFLICT (tenant_id) DO NOTHING; -- Idempotent: prevent duplicate if already exists
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_create_salon_wallet ON public.tenants;
CREATE TRIGGER trigger_create_salon_wallet
  AFTER INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION create_salon_wallet_for_tenant();

-- Backfill existing tenants: Create salon_wallets for all tenants that don't have one yet
INSERT INTO public.salon_wallets (tenant_id, currency, balance)
SELECT 
  t.id AS tenant_id,
  t.currency,
  0 AS balance
FROM public.tenants t
WHERE t.id NOT IN (SELECT tenant_id FROM public.salon_wallets)
ON CONFLICT (tenant_id) DO NOTHING;

-- Add comment for documentation
COMMENT ON FUNCTION create_salon_wallet_for_tenant() IS 'Automatically creates a salon_wallet with zero balance when a new tenant is created';
COMMENT ON TRIGGER trigger_create_salon_wallet ON public.tenants IS 'Trigger that calls create_salon_wallet_for_tenant() after tenant INSERT';
