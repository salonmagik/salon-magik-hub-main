-- Migration: Create wallet_ledger_entries table
-- Story: US-002 - Create wallet_ledger_entries table

-- Create wallet_ledger_entries table for unified transaction ledger
CREATE TABLE wallet_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  wallet_type wallet_type NOT NULL,
  wallet_id UUID NOT NULL,
  entry_type wallet_entry_type NOT NULL,
  currency TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  balance_before NUMERIC(10, 2) NOT NULL,
  balance_after NUMERIC(10, 2) NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  gateway TEXT,
  gateway_reference TEXT,
  idempotency_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_wallet_ledger_entries_tenant
    FOREIGN KEY (tenant_id)
    REFERENCES tenants(id)
    ON DELETE CASCADE
);

-- Create unique index on idempotency_key to prevent duplicate entries
CREATE UNIQUE INDEX wallet_ledger_idempotency_idx 
  ON wallet_ledger_entries (tenant_id, idempotency_key) 
  WHERE idempotency_key IS NOT NULL;

-- Create index for efficient wallet-based queries
CREATE INDEX wallet_ledger_wallet_idx 
  ON wallet_ledger_entries (wallet_type, wallet_id, created_at DESC);
