-- US-004: Create salon_withdrawals table
-- Purpose: Track withdrawal requests from salon wallets

-- Create withdrawal_status ENUM
CREATE TYPE withdrawal_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- Create salon_withdrawals table
CREATE TABLE salon_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  salon_wallet_id UUID NOT NULL,
  payout_destination_id UUID NOT NULL,
  currency TEXT NOT NULL, -- NGN, GHS
  amount NUMERIC(12, 2) NOT NULL,
  status withdrawal_status DEFAULT 'pending',
  paystack_transfer_code TEXT,
  paystack_reference TEXT,
  failure_reason TEXT,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Foreign key constraints
  CONSTRAINT fk_salon_withdrawals_tenant
    FOREIGN KEY (tenant_id)
    REFERENCES tenants(id)
    ON DELETE CASCADE,
    
  CONSTRAINT fk_salon_withdrawals_wallet
    FOREIGN KEY (salon_wallet_id)
    REFERENCES salon_wallets(id)
    ON DELETE CASCADE,
    
  CONSTRAINT fk_salon_withdrawals_destination
    FOREIGN KEY (payout_destination_id)
    REFERENCES salon_payout_destinations(id)
    ON DELETE CASCADE
);

-- Create index on tenant_id for faster lookups
CREATE INDEX idx_salon_withdrawals_tenant 
  ON salon_withdrawals(tenant_id);

-- Create index on salon_wallet_id for wallet-based queries
CREATE INDEX idx_salon_withdrawals_wallet 
  ON salon_withdrawals(salon_wallet_id);

-- Create index on status for status-based filtering
CREATE INDEX idx_salon_withdrawals_status 
  ON salon_withdrawals(status);

-- Add comment
COMMENT ON TABLE salon_withdrawals IS 'Tracks withdrawal requests from salon wallets to payout destinations';
