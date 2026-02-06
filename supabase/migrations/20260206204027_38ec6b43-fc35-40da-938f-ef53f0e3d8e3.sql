-- Grant SELECT access on public_booking_tenants view to anon and authenticated roles
-- This is required for the public booking page to work
GRANT SELECT ON public.public_booking_tenants TO anon;
GRANT SELECT ON public.public_booking_tenants TO authenticated;