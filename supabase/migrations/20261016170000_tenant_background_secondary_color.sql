-- Public booking only ever let a tenant set one color (brand_color), which
-- drove a handful of explicitly-styled elements via --brand-color. Most of
-- the storefront actually renders through Tailwind's semantic tokens
-- (bg-primary, border-primary, etc.), which were hardcoded to the default
-- Salon Magik purple in index.css and never varied per tenant. Adding the
-- two missing color fields a tenant needs to fully re-theme the storefront
-- (background, secondary/accent) -- brand_color continues to serve as the
-- primary color. Both nullable: null means "not set, derive automatically"
-- (background -> white, secondary -> muted version of brand_color),
-- computed client-side, not stored.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS background_color text,
  ADD COLUMN IF NOT EXISTS secondary_color text;

-- Re-expose the two new columns through the anon-readable booking view
-- (same pattern as brand_color already uses there).
CREATE OR REPLACE VIEW public.public_booking_tenants
WITH (security_invoker = off)
AS
SELECT
  t.id,
  t.name,
  t.slug,
  t.logo_url,
  t.banner_urls,
  t.brand_color,
  t.currency,
  t.timezone,
  t.country,
  t.online_booking_enabled,
  t.deposits_enabled,
  t.default_deposit_percentage,
  t.cancellation_grace_hours,
  t.booking_status_message,
  t.booking_page_bio,
  t.slot_capacity_default,
  t.default_buffer_minutes,
  t.pay_at_salon_enabled,
  t.auto_confirm_bookings,
  CASE WHEN t.show_contact_on_booking THEN t.contact_phone ELSE NULL END AS contact_phone,
  t.show_contact_on_booking,
  t.allow_staff_selection,
  t.require_staff_selection,
  t.auto_assign_staff,
  t.payment_setup_status,
  t.storefront_mode,
  t.hero_heading,
  t.hero_tagline,
  t.hero_cta_primary,
  t.hero_cta_secondary,
  t.hero_bg_color,
  t.about_text,
  t.active_theme_key AS theme_key,
  t.background_color,
  t.secondary_color
FROM public.tenants t
WHERE t.online_booking_enabled = true
  AND t.slug IS NOT NULL
  AND public.is_tenant_operational(t.id);

GRANT SELECT ON public.public_booking_tenants TO anon, authenticated;
