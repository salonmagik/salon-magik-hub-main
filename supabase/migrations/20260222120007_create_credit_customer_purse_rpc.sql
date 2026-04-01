-- Migration: Create credit_customer_purse RPC function
-- Description: Idempotent function for crediting customer purses with topup transactions

-- Create the credit_customer_purse function
CREATE OR REPLACE FUNCTION credit_customer_purse(
  p_tenant_id UUID,
  p_customer_id UUID,
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
  v_existing_entry_id UUID;
  v_purse_id UUID;
  v_current_balance NUMERIC(12, 2);
  v_new_balance NUMERIC(12, 2);
  v_ledger_entry_id UUID;
BEGIN
  -- Check idempotency: return existing entry if already processed
  SELECT id INTO v_existing_entry_id
  FROM wallet_ledger_entries
  WHERE tenant_id = p_tenant_id
    AND idempotency_key = p_idempotency_key;

  IF v_existing_entry_id IS NOT NULL THEN
    RETURN v_existing_entry_id;
  END IF;

  -- Lock customer_purses row for update (create if not exists)
  -- First, check if purse exists
  SELECT id, balance INTO v_purse_id, v_current_balance
  FROM customer_purses
  WHERE tenant_id = p_tenant_id
    AND customer_id = p_customer_id
  FOR UPDATE;

  -- Create purse if it doesn't exist with balance 0
  IF v_purse_id IS NULL THEN
    INSERT INTO customer_purses (tenant_id, customer_id, currency, balance)
    VALUES (p_tenant_id, p_customer_id, p_currency, 0)
    RETURNING id, balance INTO v_purse_id, v_current_balance;
  END IF;

  -- Calculate new balance
  v_new_balance := v_current_balance + p_amount;

  -- Update purse balance
  UPDATE customer_purses
  SET balance = v_new_balance,
      updated_at = NOW()
  WHERE id = v_purse_id;

  -- Create wallet ledger entry
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
    idempotency_key
  ) VALUES (
    p_tenant_id,
    'customer',
    v_purse_id,
    'customer_purse_topup',
    p_currency,
    p_amount,
    v_current_balance,
    v_new_balance,
    'topup',
    NULL,
    CASE WHEN p_gateway_reference IS NOT NULL THEN 'paystack' ELSE NULL END,
    p_gateway_reference,
    p_idempotency_key
  )
  RETURNING id INTO v_ledger_entry_id;

  RETURN v_ledger_entry_id;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION credit_customer_purse IS 'Idempotent function for crediting customer purses with topup transactions. Creates purse if not exists and returns ledger entry ID.';
