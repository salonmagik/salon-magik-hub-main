-- Migration: Create debit_customer_purse_for_booking RPC function
-- Story: US-009
-- Description: RPC function for debiting customer purses for booking payments

-- Create the debit_customer_purse_for_booking function
CREATE OR REPLACE FUNCTION debit_customer_purse_for_booking(
  p_tenant_id UUID,
  p_customer_id UUID,
  p_appointment_id UUID,
  p_amount NUMERIC(12, 2),
  p_currency TEXT,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_purse_id UUID;
  v_current_balance NUMERIC(12, 2);
  v_new_balance NUMERIC(12, 2);
  v_ledger_entry_id UUID;
  v_existing_entry_id UUID;
BEGIN
  -- Check idempotency first - if this transaction was already processed, return existing entry ID
  SELECT id INTO v_existing_entry_id
  FROM wallet_ledger_entries
  WHERE tenant_id = p_tenant_id
    AND idempotency_key = p_idempotency_key;
  
  IF v_existing_entry_id IS NOT NULL THEN
    RETURN v_existing_entry_id;
  END IF;

  -- Lock customer_purses row and get current balance
  SELECT id, balance INTO v_purse_id, v_current_balance
  FROM customer_purses
  WHERE tenant_id = p_tenant_id
    AND customer_id = p_customer_id
  FOR UPDATE;

  -- Raise exception if purse not found
  IF v_purse_id IS NULL THEN
    RAISE EXCEPTION 'Customer purse not found for customer_id: %', p_customer_id;
  END IF;

  -- Verify sufficient balance
  IF v_current_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient purse balance. Available: %, Required: %', v_current_balance, p_amount;
  END IF;

  -- Calculate new balance
  v_new_balance := v_current_balance - p_amount;

  -- Update purse balance
  UPDATE customer_purses
  SET balance = v_new_balance,
      updated_at = NOW()
  WHERE id = v_purse_id;

  -- Create ledger entry with negative amount for debit
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
    'customer',
    v_purse_id,
    'customer_purse_debit_booking',
    p_currency,
    -p_amount,  -- Negative amount for debit
    v_current_balance,
    v_new_balance,
    'appointment',
    p_appointment_id,
    p_idempotency_key,
    NOW()
  )
  RETURNING id INTO v_ledger_entry_id;

  RETURN v_ledger_entry_id;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION debit_customer_purse_for_booking IS 'Debits customer purse for booking payments with idempotency and balance verification';
