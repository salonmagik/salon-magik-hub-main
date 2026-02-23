-- Migration: Create debit_salon_purse RPC function
-- Description: Generic idempotent function for debiting salon purses with flexible entry types
-- Created: 2026-02-23

-- =============================================
-- Function: debit_salon_purse
-- Description: Debits a salon wallet with a specified amount and creates a ledger entry
-- Parameters:
--   p_tenant_id: The tenant ID
--   p_entry_type: The wallet entry type (e.g., 'salon_purse_debit_credit_purchase')
--   p_reference_type: The reference type (e.g., 'credit_purchase')
--   p_reference_id: The reference ID
--   p_amount: The amount to debit
--   p_currency: The currency code (NGN, GHS, etc.)
--   p_idempotency_key: Unique key to prevent duplicate debits
-- Returns: UUID of the created ledger entry
-- =============================================

CREATE OR REPLACE FUNCTION debit_salon_purse(
  p_tenant_id UUID,
  p_entry_type wallet_entry_type,
  p_reference_type TEXT,
  p_reference_id TEXT,
  p_amount NUMERIC(12, 2),
  p_currency TEXT,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet_id UUID;
  v_balance_before NUMERIC(12, 2);
  v_balance_after NUMERIC(12, 2);
  v_ledger_entry_id UUID;
  v_existing_entry_id UUID;
BEGIN
  -- Check idempotency: if this key was already processed, return existing entry ID
  SELECT id INTO v_existing_entry_id
  FROM wallet_ledger_entries
  WHERE tenant_id = p_tenant_id
    AND idempotency_key = p_idempotency_key
  LIMIT 1;

  IF v_existing_entry_id IS NOT NULL THEN
    RETURN v_existing_entry_id;
  END IF;

  -- Lock salon_wallets row for update to ensure atomic balance updates
  SELECT id, balance INTO v_wallet_id, v_balance_before
  FROM salon_wallets
  WHERE tenant_id = p_tenant_id
  FOR UPDATE;

  -- Raise exception if wallet not found
  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Salon wallet not found for tenant %', p_tenant_id;
  END IF;

  -- Verify sufficient balance
  IF v_balance_before < p_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance. Available: %, Required: %', v_balance_before, p_amount;
  END IF;

  -- Calculate new balance
  v_balance_after := v_balance_before - p_amount;

  -- Update salon_wallets balance
  UPDATE salon_wallets
  SET balance = v_balance_after,
      updated_at = NOW()
  WHERE id = v_wallet_id;

  -- Create wallet_ledger_entries record with negative amount
  INSERT INTO wallet_ledger_entries (
    tenant_id,
    wallet_type,
    wallet_id,
    entry_type,
    currency,
    amount,
    balance_before,
    balance_after,
    reference_type,
    reference_id,
    idempotency_key,
    created_at
  ) VALUES (
    p_tenant_id,
    'salon',
    v_wallet_id,
    p_entry_type,
    p_currency,
    -1 * p_amount, -- Negative for debit
    v_balance_before,
    v_balance_after,
    p_reference_type,
    p_reference_id,
    p_idempotency_key,
    NOW()
  ) RETURNING id INTO v_ledger_entry_id;

  RETURN v_ledger_entry_id;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION debit_salon_purse IS 'Generic idempotent function for debiting salon purses with specified entry type and reference. Used for credit purchases and other debit operations.';
