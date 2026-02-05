-- Update public_booking_tenants view to include deposit settings (needed for booking)
-- but exclude auto_confirm_bookings (internal logic)
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
    -- Include deposit settings - needed for booking UI to show deposit requirements
    deposits_enabled,
    default_deposit_percentage,
    cancellation_grace_hours,
    booking_status_message,
    slot_capacity_default,
    pay_at_salon_enabled
    -- Exclude: auto_confirm_bookings (internal business logic)
FROM tenants
WHERE online_booking_enabled = true AND slug IS NOT NULL;

-- Grant select on the view to anon and authenticated roles
GRANT SELECT ON public.public_booking_tenants TO anon, authenticated;