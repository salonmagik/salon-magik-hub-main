-- Migration: Create credit_salon_purse RPC function
-- Description: Idempotent function for crediting salon purses
-- Created: 2026-02-22

-- =============================================
-- Function: credit_salon_purse
-- Description: Credits a salon wallet with a specified amount and creates a ledger entry
-- Parameters:
--   p_tenant_id: The tenant ID
--   p_entry_type: The wallet entry type (e.g., 'salon_purse_credit_booking', 'salon_purse_credit_invoice', 'salon_purse_topup')
--   p_reference_type: The reference type (e.g., 'appointment', 'invoice', 'topup')
--   p_reference_id: The reference ID (appointment_id, invoice_id, etc.)
--   p_amount: The amount to credit
--   p_currency: The currency code (NGN, GHS, etc.)
--   p_idempotency_key: Unique key to prevent duplicate credits
--   p_gateway_reference: Optional Paystack reference
-- Returns: UUID of the created ledger entry
-- =============================================

CREATE OR REPLACE FUNCTION credit_salon_purse(
  p_tenant_id UUID,
  p_entry_type wallet_entry_type,
  p_reference_type TEXT,
  p_reference_id TEXT,
  p_amount NUMERIC(12, 2),
  p_currency TEXT,
  p_idempotency_key TEXT,
  p_gateway_reference TEXT DEFAULT NULL
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

  -- Calculate new balance
  v_balance_after := v_balance_before + p_amount;

  -- Update salon_wallets balance
  UPDATE salon_wallets
  SET balance = v_balance_after,
      updated_at = NOW()
  WHERE id = v_wallet_id;

  -- Create wallet_ledger_entries record
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
    gateway,
    gateway_reference,
    idempotency_key,
    created_at
  ) VALUES (
    p_tenant_id,
    'salon',
    v_wallet_id,
    p_entry_type,
    p_currency,
    p_amount,
    v_balance_before,
    v_balance_after,
    p_reference_type,
    p_reference_id,
    CASE WHEN p_gateway_reference IS NOT NULL THEN 'paystack' ELSE NULL END,
    p_gateway_reference,
    p_idempotency_key,
    NOW()
  ) RETURNING id INTO v_ledger_entry_id;

  RETURN v_ledger_entry_id;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION credit_salon_purse IS 'Idempotent function for crediting salon purses with specified entry type and reference. Used for booking payments, invoice payments, and direct topups.';
