-- Fix public booking regression: ensure the public tenant view does NOT run as invoker
-- When security_invoker=true, the view is filtered by the caller's RLS on public.tenants,
-- which blocks anon/auth users and returns [] ("Salon not found").
-- The view already limits columns + rows (online_booking_enabled=true), so it is safe
-- to run with definer privileges.

ALTER VIEW public.public_booking_tenants
  SET (security_invoker = false);

-- Ensure public roles can read the view
GRANT SELECT ON public.public_booking_tenants TO anon;
GRANT SELECT ON public.public_booking_tenants TO authenticated;
