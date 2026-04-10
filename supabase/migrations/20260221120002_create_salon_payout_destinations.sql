-- US-003: Create salon_payout_destinations table
-- Purpose: Store salon payout destinations (bank accounts and mobile money) for withdrawals

-- Create payout_destination_type ENUM
CREATE TYPE payout_destination_type AS ENUM ('bank', 'mobile_money');

-- Create salon_payout_destinations table
CREATE TABLE salon_payout_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  destination_type payout_destination_type NOT NULL,
  country TEXT NOT NULL, -- ISO country code (NG, GH)
  currency TEXT NOT NULL, -- NGN, GHS
  bank_code TEXT,
  bank_name TEXT,
  account_number TEXT,
  account_name TEXT,
  momo_provider TEXT, -- For mobile money: MTN, VODAFONE, AIRTELTIGO
  momo_number TEXT,
  paystack_recipient_code TEXT, -- Paystack's recipient code for transfers
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Foreign key constraint
  CONSTRAINT fk_salon_payout_destinations_tenant
    FOREIGN KEY (tenant_id)
    REFERENCES tenants(id)
    ON DELETE CASCADE
);

-- Create index on tenant_id for faster lookups
CREATE INDEX idx_salon_payout_destinations_tenant 
  ON salon_payout_destinations(tenant_id);

-- Add comment
COMMENT ON TABLE salon_payout_destinations IS 'Stores payout destinations (bank accounts and mobile money) for salon withdrawals';
