-- Create appointment_products table for tracking products sold with appointments
CREATE TABLE public.appointment_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  total_price NUMERIC NOT NULL,
  fulfillment_status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (fulfillment_status IN ('pending', 'ready', 'fulfilled', 'cancelled')),
  fulfilled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.appointment_products ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Users can read appointment_products for their tenant's appointments
CREATE POLICY "Users can read tenant appointment_products"
  ON public.appointment_products FOR SELECT
  USING (appointment_id IN (
    SELECT id FROM public.appointments 
    WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  ));

-- Users can create appointment_products for their tenant's appointments
CREATE POLICY "Users can create appointment_products"
  ON public.appointment_products FOR INSERT
  WITH CHECK (appointment_id IN (
    SELECT id FROM public.appointments 
    WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  ));

-- Users can update appointment_products for their tenant's appointments
CREATE POLICY "Users can update appointment_products"
  ON public.appointment_products FOR UPDATE
  USING (appointment_id IN (
    SELECT id FROM public.appointments 
    WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  ));

-- Users can delete appointment_products for their tenant's appointments
CREATE POLICY "Users can delete appointment_products"
  ON public.appointment_products FOR DELETE
  USING (appointment_id IN (
    SELECT id FROM public.appointments 
    WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  ));

-- Create index for faster lookups
CREATE INDEX idx_appointment_products_appointment_id ON public.appointment_products(appointment_id);
CREATE INDEX idx_appointment_products_fulfillment_status ON public.appointment_products(fulfillment_status);