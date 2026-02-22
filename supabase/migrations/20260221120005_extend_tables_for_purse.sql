-- US-006: Extend existing tables with purse-related columns
-- Add intent_type to payment_intents, payment link fields to invoices, and minimum withdrawal amounts to tenants

-- 1. Add intent_type column to payment_intents table
ALTER TABLE public.payment_intents 
  ADD COLUMN IF NOT EXISTS intent_type TEXT;

-- Create index for filtering by intent_type
CREATE INDEX IF NOT EXISTS idx_payment_intents_intent_type 
  ON public.payment_intents(intent_type) 
  WHERE intent_type IS NOT NULL;

-- 2. Add payment link columns to invoices table
ALTER TABLE public.invoices 
  ADD COLUMN IF NOT EXISTS payment_link TEXT,
  ADD COLUMN IF NOT EXISTS payment_intent_id UUID;

-- Add foreign key constraint for payment_intent_id (only if column was just created)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'invoices_payment_intent_id_fkey'
  ) THEN
    ALTER TABLE public.invoices 
      ADD CONSTRAINT invoices_payment_intent_id_fkey 
      FOREIGN KEY (payment_intent_id) 
      REFERENCES public.payment_intents(id) 
      ON DELETE SET NULL;
  END IF;
END $$;

-- Create index for payment_intent_id lookups
CREATE INDEX IF NOT EXISTS idx_invoices_payment_intent_id 
  ON public.invoices(payment_intent_id) 
  WHERE payment_intent_id IS NOT NULL;

-- 3. Add minimum withdrawal amount columns to tenants table
ALTER TABLE public.tenants 
  ADD COLUMN IF NOT EXISTS min_withdrawal_ngn NUMERIC(10,2) DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS min_withdrawal_ghs NUMERIC(10,2) DEFAULT 50;

-- Add comments for documentation
COMMENT ON COLUMN public.payment_intents.intent_type IS 'Type of payment intent: appointment_payment, customer_purse_topup, salon_purse_topup, invoice_payment, messaging_credit_purchase';
COMMENT ON COLUMN public.invoices.payment_link IS 'Paystack payment URL for invoice payment';
COMMENT ON COLUMN public.invoices.payment_intent_id IS 'Reference to payment_intents table for online invoice payments';
COMMENT ON COLUMN public.tenants.min_withdrawal_ngn IS 'Minimum withdrawal amount in Nigerian Naira';
COMMENT ON COLUMN public.tenants.min_withdrawal_ghs IS 'Minimum withdrawal amount in Ghanaian Cedis';
