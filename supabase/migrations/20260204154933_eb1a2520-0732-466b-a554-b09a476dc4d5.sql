-- Fix 1: Drop overly permissive tenants anon policy and replace with column-restricted version
DROP POLICY IF EXISTS "Anon can read booking-enabled tenants by slug" ON public.tenants;

-- Create a view for public booking that only exposes safe columns
CREATE OR REPLACE VIEW public.public_booking_tenants AS
SELECT 
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
  auto_confirm_bookings,
  deposits_enabled,
  default_deposit_percentage,
  cancellation_grace_hours,
  booking_status_message,
  slot_capacity_default,
  pay_at_salon_enabled
FROM public.tenants
WHERE online_booking_enabled = true AND slug IS NOT NULL;

-- Grant anon access to the view
GRANT SELECT ON public.public_booking_tenants TO anon;

-- Fix 2: Drop overly permissive storage policies and replace with tenant-scoped versions
DROP POLICY IF EXISTS "Authenticated users can upload branding" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update branding" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete branding" ON storage.objects;

-- Create tenant-scoped upload policy
CREATE POLICY "Tenant members can upload own branding"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'salon-branding' AND
  (storage.foldername(name))[1]::uuid IN (SELECT get_user_tenant_ids(auth.uid()))
);

-- Create tenant-scoped update policy
CREATE POLICY "Tenant members can update own branding"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'salon-branding' AND
  (storage.foldername(name))[1]::uuid IN (SELECT get_user_tenant_ids(auth.uid()))
);

-- Create tenant-scoped delete policy
CREATE POLICY "Tenant members can delete own branding"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'salon-branding' AND
  (storage.foldername(name))[1]::uuid IN (SELECT get_user_tenant_ids(auth.uid()))
);