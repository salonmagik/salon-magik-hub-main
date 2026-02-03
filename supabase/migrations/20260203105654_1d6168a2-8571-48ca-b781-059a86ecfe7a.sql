-- Create enum for journal entry direction
CREATE TYPE public.journal_direction AS ENUM ('inflow', 'outflow');

-- Create enum for journal entry category
CREATE TYPE public.journal_category AS ENUM ('service_payment', 'product_sale', 'expense', 'other');

-- Create enum for journal entry status
CREATE TYPE public.journal_status AS ENUM ('active', 'pending_approval', 'rejected', 'reversed');

-- Create journal_entries table
CREATE TABLE public.journal_entries (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    direction journal_direction NOT NULL,
    payment_method payment_method NOT NULL,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'USD',
    description TEXT,
    parsed_summary TEXT,
    category journal_category NOT NULL DEFAULT 'other',
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    
    -- Optional links
    appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    
    -- Status and approval workflow
    status journal_status NOT NULL DEFAULT 'active',
    created_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create journal_line_items table for product sales
CREATE TABLE public.journal_line_items (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    journal_entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
    total_price NUMERIC NOT NULL CHECK (total_price >= 0),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_line_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for journal_entries
CREATE POLICY "Users can read tenant journal entries"
ON public.journal_entries FOR SELECT
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Users can create journal entries for their tenants"
ON public.journal_entries FOR INSERT
WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Users can update tenant journal entries"
ON public.journal_entries FOR UPDATE
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Users can delete tenant journal entries"
ON public.journal_entries FOR DELETE
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- RLS policies for journal_line_items
CREATE POLICY "Users can read tenant journal line items"
ON public.journal_line_items FOR SELECT
USING (journal_entry_id IN (
    SELECT id FROM public.journal_entries 
    WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
));

CREATE POLICY "Users can create journal line items for their tenants"
ON public.journal_line_items FOR INSERT
WITH CHECK (journal_entry_id IN (
    SELECT id FROM public.journal_entries 
    WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
));

CREATE POLICY "Users can update tenant journal line items"
ON public.journal_line_items FOR UPDATE
USING (journal_entry_id IN (
    SELECT id FROM public.journal_entries 
    WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
));

CREATE POLICY "Users can delete tenant journal line items"
ON public.journal_line_items FOR DELETE
USING (journal_entry_id IN (
    SELECT id FROM public.journal_entries 
    WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
));

-- Create updated_at trigger
CREATE TRIGGER update_journal_entries_updated_at
BEFORE UPDATE ON public.journal_entries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add indexes for performance
CREATE INDEX idx_journal_entries_tenant_id ON public.journal_entries(tenant_id);
CREATE INDEX idx_journal_entries_occurred_at ON public.journal_entries(occurred_at DESC);
CREATE INDEX idx_journal_entries_status ON public.journal_entries(status);
CREATE INDEX idx_journal_entries_category ON public.journal_entries(category);
CREATE INDEX idx_journal_line_items_entry_id ON public.journal_line_items(journal_entry_id);