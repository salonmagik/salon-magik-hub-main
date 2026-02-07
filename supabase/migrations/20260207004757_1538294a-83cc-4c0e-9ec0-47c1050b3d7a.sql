-- =====================================================
-- Comprehensive Booking & Catalog Enhancement Migration
-- =====================================================

-- Part 1: Payment Escrow Columns
ALTER TABLE payment_intents
ADD COLUMN IF NOT EXISTS funds_status TEXT DEFAULT 'pending' 
  CHECK (funds_status IN ('pending', 'held', 'released', 'refunded')),
ADD COLUMN IF NOT EXISTS released_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP WITH TIME ZONE;

-- Part 2: Appointment Confirmation Status
ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS confirmation_status TEXT DEFAULT 'auto' 
  CHECK (confirmation_status IN ('auto', 'pending', 'confirmed', 'rejected'));

-- Part 3: Reschedule Requests Table
CREATE TABLE IF NOT EXISTS public.reschedule_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  proposed_date DATE NOT NULL,
  proposed_time TIME NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  requested_by TEXT NOT NULL CHECK (requested_by IN ('salon', 'customer')),
  responded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on reschedule_requests
ALTER TABLE public.reschedule_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for reschedule_requests
CREATE POLICY "Users can read tenant reschedule requests"
  ON public.reschedule_requests
  FOR SELECT
  USING (
    appointment_id IN (
      SELECT id FROM appointments 
      WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
    )
  );

CREATE POLICY "Users can create reschedule requests for their tenants"
  ON public.reschedule_requests
  FOR INSERT
  WITH CHECK (
    appointment_id IN (
      SELECT id FROM appointments 
      WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
    )
  );

CREATE POLICY "Users can update tenant reschedule requests"
  ON public.reschedule_requests
  FOR UPDATE
  USING (
    appointment_id IN (
      SELECT id FROM appointments 
      WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
    )
  );

CREATE POLICY "Customers can read own reschedule requests"
  ON public.reschedule_requests
  FOR SELECT
  USING (
    appointment_id IN (
      SELECT id FROM appointments 
      WHERE customer_id IN (
        SELECT id FROM customers WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Customers can respond to own reschedule requests"
  ON public.reschedule_requests
  FOR UPDATE
  USING (
    appointment_id IN (
      SELECT id FROM appointments 
      WHERE customer_id IN (
        SELECT id FROM customers WHERE user_id = auth.uid()
      )
    )
  );

-- Part 4: Contact Info Columns for Tenants
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS contact_phone TEXT,
ADD COLUMN IF NOT EXISTS show_contact_on_booking BOOLEAN DEFAULT false;

-- Part 5: Phone Column for Locations
ALTER TABLE locations
ADD COLUMN IF NOT EXISTS phone TEXT;

-- Part 6: Flagging Support for Catalog Items
ALTER TABLE services ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT false;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT false;
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT false;

-- Part 7: Update public_booking_tenants view to include contact info
DROP VIEW IF EXISTS public.public_booking_tenants;
CREATE VIEW public.public_booking_tenants
WITH (security_invoker = false)
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
    deposits_enabled, 
    default_deposit_percentage,
    cancellation_grace_hours, 
    booking_status_message,
    slot_capacity_default, 
    pay_at_salon_enabled,
    auto_confirm_bookings,
    -- Conditionally expose contact info
    CASE WHEN show_contact_on_booking THEN contact_phone ELSE NULL END as contact_phone,
    show_contact_on_booking
FROM tenants
WHERE online_booking_enabled = true AND slug IS NOT NULL;

GRANT SELECT ON public.public_booking_tenants TO anon, authenticated;