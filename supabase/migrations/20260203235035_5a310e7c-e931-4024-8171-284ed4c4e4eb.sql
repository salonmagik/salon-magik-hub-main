-- Add brand_color column to tenants
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS brand_color text DEFAULT '#2563EB';

-- Allow anon to read appointments for slot counting (availability check)
CREATE POLICY "Anon can read appointments for availability"
ON public.appointments FOR SELECT TO anon
USING (
  tenant_id IN (
    SELECT id FROM tenants WHERE online_booking_enabled = true
  )
  AND status IN ('scheduled', 'started', 'paused')
);