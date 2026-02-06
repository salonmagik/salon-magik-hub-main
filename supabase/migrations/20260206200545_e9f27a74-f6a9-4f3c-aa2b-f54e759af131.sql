-- Grant SELECT access on public_booking_tenants view to anon and authenticated roles
GRANT SELECT ON public_booking_tenants TO anon;
GRANT SELECT ON public_booking_tenants TO authenticated;