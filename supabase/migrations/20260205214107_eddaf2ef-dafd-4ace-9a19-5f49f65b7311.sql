-- Fix RLS Policy: communication_credits INSERT should require tenant membership
DROP POLICY IF EXISTS "Authenticated users can create communication credits" ON public.communication_credits;
DROP POLICY IF EXISTS "Users can create communication credits for their tenants" ON public.communication_credits;
CREATE POLICY "Users can create communication credits for their tenants"
ON public.communication_credits
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

-- Fix RLS Policy: locations INSERT should verify tenant ownership
DROP POLICY IF EXISTS "Authenticated users can create locations" ON public.locations;
DROP POLICY IF EXISTS "Users can create locations for their tenants" ON public.locations;
CREATE POLICY "Users can create locations for their tenants"
ON public.locations
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

-- Fix RLS Policy: tenants INSERT - keep permissive for onboarding but restrict to authenticated
DROP POLICY IF EXISTS "Authenticated users can create tenants" ON public.tenants;
CREATE POLICY "Authenticated users can create tenants during onboarding"
ON public.tenants
FOR INSERT
TO authenticated
WITH CHECK (
  -- Only allow creating tenant if user doesn't already belong to a tenant (onboarding)
  NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
  )
);

-- Restrict public_booking_tenants view to expose only essential booking data
-- Drop the existing view and recreate with minimal fields needed for booking
DROP VIEW IF EXISTS public.public_booking_tenants;
CREATE VIEW public.public_booking_tenants
WITH (security_invoker = true)
AS SELECT 
    id,
    name,
    slug,
    logo_url,
    banner_urls,
    brand_color,
    currency,
    timezone,
    country,
    online_booking_enabled,
    -- Remove sensitive business configuration:
    -- auto_confirm_bookings (internal logic)
    -- deposits_enabled and default_deposit_percentage (business rules)
    cancellation_grace_hours,
    booking_status_message,
    slot_capacity_default,
    pay_at_salon_enabled
FROM tenants
WHERE online_booking_enabled = true AND slug IS NOT NULL;

-- Grant select on the view to anon and authenticated roles
GRANT SELECT ON public.public_booking_tenants TO anon, authenticated;

-- Add RLS policy to email_verification_tokens to prevent public access
ALTER TABLE public.email_verification_tokens ENABLE ROW LEVEL SECURITY;

-- Only service role should access verification tokens (edge functions)
-- No direct client access allowed
CREATE POLICY "No direct access to verification tokens"
ON public.email_verification_tokens
FOR ALL
TO authenticated, anon
USING (false);

-- Add RLS policy to password_reset_tokens to prevent public access  
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Only service role should access reset tokens (edge functions)
CREATE POLICY "No direct access to password reset tokens"
ON public.password_reset_tokens
FOR ALL
TO authenticated, anon
USING (false);
