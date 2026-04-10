-- Migration: Create manual_messages table
-- Description: Track all manual messages sent by salon staff to customers
-- Related to: US-004 - Create Manual Messages Table
-- Author: Ralph Agent
-- Date: 2026-03-29

-- Create manual_messages table
CREATE TABLE IF NOT EXISTS public.manual_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
    subject TEXT,
    message TEXT NOT NULL,
    template_id UUID REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
    template_variables JSONB,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    sent_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    credits_used INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_manual_messages_tenant_id ON public.manual_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_manual_messages_customer_id ON public.manual_messages(customer_id);
CREATE INDEX IF NOT EXISTS idx_manual_messages_status ON public.manual_messages(status);
CREATE INDEX IF NOT EXISTS idx_manual_messages_channel ON public.manual_messages(channel);
CREATE INDEX IF NOT EXISTS idx_manual_messages_sent_by_user_id ON public.manual_messages(sent_by_user_id);
CREATE INDEX IF NOT EXISTS idx_manual_messages_created_at ON public.manual_messages(created_at DESC);

-- Add column comments for documentation
COMMENT ON TABLE public.manual_messages IS 'Stores all manual messages sent by salon staff to customers through email, SMS, or WhatsApp channels';
COMMENT ON COLUMN public.manual_messages.tenant_id IS 'Reference to the tenant (salon) that owns this message';
COMMENT ON COLUMN public.manual_messages.customer_id IS 'Reference to the customer receiving the message';
COMMENT ON COLUMN public.manual_messages.channel IS 'Communication channel used: email (1 credit), sms (2 credits), or whatsapp (2 credits)';
COMMENT ON COLUMN public.manual_messages.subject IS 'Email subject line (only used for email channel)';
COMMENT ON COLUMN public.manual_messages.message IS 'Message content (for email and SMS). For WhatsApp, this stores the template preview';
COMMENT ON COLUMN public.manual_messages.template_id IS 'Reference to WhatsApp template (only for whatsapp channel)';
COMMENT ON COLUMN public.manual_messages.template_variables IS 'JSONB object containing variable values for WhatsApp template substitution';
COMMENT ON COLUMN public.manual_messages.status IS 'Message delivery status: pending (queued), sent (successfully delivered), failed (delivery error)';
COMMENT ON COLUMN public.manual_messages.sent_by_user_id IS 'Reference to the staff member who initiated the message';
COMMENT ON COLUMN public.manual_messages.sent_at IS 'Timestamp when the message was successfully sent';
COMMENT ON COLUMN public.manual_messages.error_message IS 'Error details if message failed to send';
COMMENT ON COLUMN public.manual_messages.credits_used IS 'Number of credits deducted for this message (1 for email, 2 for SMS/WhatsApp)';
COMMENT ON COLUMN public.manual_messages.created_at IS 'Timestamp when the message record was created';
COMMENT ON COLUMN public.manual_messages.updated_at IS 'Timestamp when the message record was last updated';

-- Enable Row Level Security
ALTER TABLE public.manual_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Staff can read messages for their tenant
CREATE POLICY "Staff can read manual messages for their tenant"
ON public.manual_messages
FOR SELECT
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- RLS Policy: Staff can create messages for their tenant
CREATE POLICY "Staff can create manual messages for their tenant"
ON public.manual_messages
FOR INSERT
WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- RLS Policy: Staff can update messages for their tenant (for status updates)
CREATE POLICY "Staff can update manual messages for their tenant"
ON public.manual_messages
FOR UPDATE
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- RLS Policy: Staff can delete messages for their tenant (soft delete via status)
CREATE POLICY "Staff can delete manual messages for their tenant"
ON public.manual_messages
FOR DELETE
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Create trigger function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_manual_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to call the function
CREATE TRIGGER manual_messages_updated_at_trigger
BEFORE UPDATE ON public.manual_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_manual_messages_updated_at();
