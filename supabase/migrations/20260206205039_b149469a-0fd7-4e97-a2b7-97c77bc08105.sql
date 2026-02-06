-- Fix: Create a security definer function to check if a tenant has online booking enabled
-- This avoids the RLS recursion issue when anon users try to read services/packages/products/categories

CREATE OR REPLACE FUNCTION public.is_bookable_tenant(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants
    WHERE id = _tenant_id
      AND online_booking_enabled = true
      AND slug IS NOT NULL
  )
$$;

-- Update services RLS policy to use the new function
DROP POLICY IF EXISTS "Anon can read active services for booking" ON public.services;
CREATE POLICY "Anon can read active services for booking"
  ON public.services
  FOR SELECT
  USING (
    status = 'active'::service_status
    AND public.is_bookable_tenant(tenant_id)
  );

-- Update packages RLS policy
DROP POLICY IF EXISTS "Anon can read active packages for booking" ON public.packages;
CREATE POLICY "Anon can read active packages for booking"
  ON public.packages
  FOR SELECT
  USING (
    status = 'active'::service_status
    AND public.is_bookable_tenant(tenant_id)
  );

-- Update products RLS policy
DROP POLICY IF EXISTS "Anon can read active products for booking" ON public.products;
CREATE POLICY "Anon can read active products for booking"
  ON public.products
  FOR SELECT
  USING (
    status = 'active'::service_status
    AND public.is_bookable_tenant(tenant_id)
  );

-- Update service_categories RLS policy
DROP POLICY IF EXISTS "Anon can read categories for booking" ON public.service_categories;
CREATE POLICY "Anon can read categories for booking"
  ON public.service_categories
  FOR SELECT
  USING (
    public.is_bookable_tenant(tenant_id)
  );

-- Also update package_items policy since it references packages
DROP POLICY IF EXISTS "Anon can read package items for booking" ON public.package_items;
CREATE POLICY "Anon can read package items for booking"
  ON public.package_items
  FOR SELECT
  USING (
    package_id IN (
      SELECT id FROM public.packages
      WHERE status = 'active'::service_status
        AND public.is_bookable_tenant(tenant_id)
    )
  );