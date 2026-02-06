-- Grant SELECT access on the public_booking_tenants view to anon and authenticated roles
-- This allows the booking page to fetch salon details for public browsing
GRANT SELECT ON public.public_booking_tenants TO anon;
GRANT SELECT ON public.public_booking_tenants TO authenticated;