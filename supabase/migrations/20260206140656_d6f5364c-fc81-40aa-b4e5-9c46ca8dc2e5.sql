-- ============================================
-- Phase 2 & 3: Staff Sessions + Invoices Tables
-- ============================================

-- 1. Staff Sessions table for tracking online staff
CREATE TABLE IF NOT EXISTS public.staff_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
    started_at timestamptz NOT NULL DEFAULT now(),
    last_activity_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz,
    device_type text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.staff_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for staff_sessions
CREATE POLICY "Users can read tenant staff sessions"
ON public.staff_sessions FOR SELECT
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Users can create own staff sessions"
ON public.staff_sessions FOR INSERT
WITH CHECK (user_id = auth.uid() AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Users can update own staff sessions"
ON public.staff_sessions FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Index for querying active sessions
CREATE INDEX idx_staff_sessions_active ON public.staff_sessions (tenant_id, location_id) 
WHERE ended_at IS NULL;

-- 2. Invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number text NOT NULL,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
    subtotal numeric NOT NULL DEFAULT 0,
    discount numeric NOT NULL DEFAULT 0,
    tax numeric NOT NULL DEFAULT 0,
    total numeric NOT NULL DEFAULT 0,
    currency text NOT NULL DEFAULT 'USD',
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'void')),
    pdf_url text,
    notes text,
    due_date timestamptz,
    sent_at timestamptz,
    paid_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, invoice_number)
);

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- RLS Policies for invoices
CREATE POLICY "Users can read tenant invoices"
ON public.invoices FOR SELECT
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Customers can read own invoices"
ON public.invoices FOR SELECT
USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

CREATE POLICY "Users can create tenant invoices"
ON public.invoices FOR INSERT
WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Users can update tenant invoices"
ON public.invoices FOR UPDATE
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Index for invoice lookups
CREATE INDEX idx_invoices_tenant ON public.invoices (tenant_id, created_at DESC);
CREATE INDEX idx_invoices_customer ON public.invoices (customer_id);

-- 3. Invoice line items table
CREATE TABLE IF NOT EXISTS public.invoice_line_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    description text NOT NULL,
    quantity integer NOT NULL DEFAULT 1,
    unit_price numeric NOT NULL,
    total_price numeric NOT NULL,
    service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
    product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for invoice_line_items
CREATE POLICY "Users can read tenant invoice line items"
ON public.invoice_line_items FOR SELECT
USING (invoice_id IN (SELECT id FROM public.invoices WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))));

CREATE POLICY "Customers can read own invoice line items"
ON public.invoice_line_items FOR SELECT
USING (invoice_id IN (SELECT id FROM public.invoices WHERE customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())));

CREATE POLICY "Users can create invoice line items"
ON public.invoice_line_items FOR INSERT
WITH CHECK (invoice_id IN (SELECT id FROM public.invoices WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))));

CREATE POLICY "Users can update invoice line items"
ON public.invoice_line_items FOR UPDATE
USING (invoice_id IN (SELECT id FROM public.invoices WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))));

CREATE POLICY "Users can delete invoice line items"
ON public.invoice_line_items FOR DELETE
USING (invoice_id IN (SELECT id FROM public.invoices WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))));

-- 4. Function to generate invoice numbers
CREATE OR REPLACE FUNCTION public.generate_invoice_number(_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _count integer;
    _prefix text;
BEGIN
    -- Get count of invoices for this tenant
    SELECT COUNT(*) + 1 INTO _count
    FROM public.invoices
    WHERE tenant_id = _tenant_id;
    
    -- Get tenant name prefix (first 3 chars)
    SELECT UPPER(LEFT(name, 3)) INTO _prefix
    FROM public.tenants
    WHERE id = _tenant_id;
    
    -- Return formatted invoice number: PREFIX-YYYYMMDD-NNNN
    RETURN COALESCE(_prefix, 'INV') || '-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(_count::text, 4, '0');
END;
$$;

-- 5. Trigger to update updated_at
CREATE TRIGGER update_invoices_updated_at
    BEFORE UPDATE ON public.invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for staff_sessions (for live online count)
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_sessions;