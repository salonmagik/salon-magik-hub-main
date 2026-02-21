-- US-005: Create messaging_credit_purchases table
-- Purpose: Audit table for tracking messaging credit purchases

-- Create messaging_credit_purchases table
CREATE TABLE messaging_credit_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  credits INTEGER NOT NULL,
  currency TEXT NOT NULL, -- NGN, GHS
  amount NUMERIC(12, 2) NOT NULL,
  paid_via TEXT NOT NULL CHECK (paid_via IN ('salon_purse', 'paystack')),
  payment_intent_id UUID, -- Reference to payment_intents table for Paystack payments
  gateway_reference TEXT, -- Paystack payment reference
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Foreign key constraint on tenant_id
  CONSTRAINT fk_messaging_credit_purchases_tenant
    FOREIGN KEY (tenant_id)
    REFERENCES tenants(id)
    ON DELETE CASCADE
);

-- Create index on tenant_id for faster lookups
CREATE INDEX idx_messaging_credit_purchases_tenant 
  ON messaging_credit_purchases(tenant_id);

-- Create index on paid_via for filtering by payment method
CREATE INDEX idx_messaging_credit_purchases_paid_via 
  ON messaging_credit_purchases(paid_via);

-- Create index on created_at for time-based queries
CREATE INDEX idx_messaging_credit_purchases_created_at 
  ON messaging_credit_purchases(created_at DESC);

-- Add comment
COMMENT ON TABLE messaging_credit_purchases IS 'Audit table for tracking messaging credit purchases via salon purse or Paystack';
