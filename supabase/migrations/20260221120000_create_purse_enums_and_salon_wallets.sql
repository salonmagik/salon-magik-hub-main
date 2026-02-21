-- Migration: Create purse enums and salon_wallets table
-- Story: US-001 - Create salon_wallets table and enum types

-- Create wallet_type ENUM
CREATE TYPE wallet_type AS ENUM ('customer', 'salon');

-- Create wallet_entry_type ENUM with all 10 entry types
CREATE TYPE wallet_entry_type AS ENUM (
  'customer_purse_topup',
  'customer_purse_debit_booking',
  'customer_purse_debit_invoice',
  'customer_purse_reversal',
  'salon_purse_credit_booking',
  'salon_purse_credit_invoice',
  'salon_purse_topup',
  'salon_purse_withdrawal',
  'salon_purse_reversal',
  'salon_purse_debit_credit_purchase'
);

-- Create salon_wallets table
CREATE TABLE salon_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE,
  currency TEXT NOT NULL DEFAULT 'NGN',
  balance NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_salon_wallets_tenant
    FOREIGN KEY (tenant_id)
    REFERENCES tenants(id)
    ON DELETE CASCADE
);

-- Create index on tenant_id for faster lookups
CREATE INDEX idx_salon_wallets_tenant_id ON salon_wallets(tenant_id);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_salon_wallets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_salon_wallets_updated_at
  BEFORE UPDATE ON salon_wallets
  FOR EACH ROW
  EXECUTE FUNCTION update_salon_wallets_updated_at();
