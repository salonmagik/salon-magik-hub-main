-- Create payment_intents table
CREATE TABLE public.payment_intents (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
    amount numeric NOT NULL,
    currency text NOT NULL DEFAULT 'USD',
    customer_email text NOT NULL,
    customer_name text,
    gateway text NOT NULL,
    is_deposit boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'pending',
    gateway_reference text,
    stripe_session_id text,
    paystack_reference text,
    paystack_access_code text,
    metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read tenant payment intents"
ON public.payment_intents FOR SELECT
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Anon can insert for booking"
ON public.payment_intents FOR INSERT
WITH CHECK (tenant_id IN (SELECT id FROM tenants WHERE online_booking_enabled = true));

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS paystack_reference text;

CREATE INDEX idx_payment_intents_tenant ON public.payment_intents(tenant_id);
CREATE INDEX idx_payment_intents_status ON public.payment_intents(status);