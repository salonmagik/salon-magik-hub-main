-- 1. Add columns to tenants
ALTER TABLE public.tenants
ADD COLUMN custom_booking_domain text,
ADD COLUMN custom_domain_verified boolean DEFAULT false NOT NULL,
ADD COLUMN custom_domain_verified_at timestamptz,
ADD COLUMN custom_domain_source text,
ADD COLUMN dotlet_domain_id text,
ADD COLUMN dotlet_origin_rule_id text;

-- 2. Add unique index on custom_booking_domain
CREATE UNIQUE INDEX idx_tenants_custom_booking_domain ON public.tenants (custom_booking_domain) WHERE custom_booking_domain IS NOT NULL;

-- 3. Update public_booking_tenants view
CREATE OR REPLACE VIEW public.public_booking_tenants
WITH (security_invoker = off)
AS
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
  deposits_enabled,
  default_deposit_percentage,
  cancellation_grace_hours,
  booking_status_message,
  slot_capacity_default,
  default_buffer_minutes,
  pay_at_salon_enabled,
  auto_confirm_bookings,
  CASE WHEN show_contact_on_booking THEN contact_phone ELSE null END AS contact_phone,
  show_contact_on_booking,
  allow_staff_selection,
  require_staff_selection,
  auto_assign_staff,
  custom_booking_domain,
  custom_domain_verified
FROM public.tenants
WHERE online_booking_enabled = true
  AND slug is not null;

GRANT SELECT ON public.public_booking_tenants TO anon, authenticated;

-- 4. Create domain_orders table
CREATE TYPE public.domain_order_status AS ENUM ('pending_payment', 'processing', 'completed', 'failed', 'cancelled');

CREATE TABLE public.domain_orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    domain_name text NOT NULL,
    status public.domain_order_status DEFAULT 'pending_payment' NOT NULL,
    dotlet_order_id text,
    price_amount numeric,
    price_currency text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- Trigger for updated_at
CREATE TRIGGER set_domain_orders_updated_at
BEFORE UPDATE ON public.domain_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Implement RLS on domain_orders
ALTER TABLE public.domain_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant owners and managers can read domain orders"
ON public.domain_orders
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), tenant_id, 'owner') OR 
  public.has_role(auth.uid(), tenant_id, 'manager') OR
  public.is_backoffice_user(auth.uid())
);

CREATE POLICY "Tenant owners and managers can insert domain orders"
ON public.domain_orders
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), tenant_id, 'owner') OR 
  public.has_role(auth.uid(), tenant_id, 'manager')
);

CREATE POLICY "Tenant owners and managers can update domain orders"
ON public.domain_orders
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), tenant_id, 'owner') OR 
  public.has_role(auth.uid(), tenant_id, 'manager') OR
  public.is_backoffice_user(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), tenant_id, 'owner') OR 
  public.has_role(auth.uid(), tenant_id, 'manager') OR
  public.is_backoffice_user(auth.uid())
);

CREATE POLICY "Backoffice users can delete domain orders"
ON public.domain_orders
FOR DELETE
TO authenticated
USING (
  public.is_backoffice_user(auth.uid())
);
