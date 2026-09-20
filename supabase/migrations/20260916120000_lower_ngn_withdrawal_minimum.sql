-- Lower the app minimum for Nigerian withdrawals; Ghana remains unchanged.
ALTER TABLE public.tenants ALTER COLUMN min_withdrawal_ngn SET DEFAULT 500;
UPDATE public.tenants SET min_withdrawal_ngn = 500
WHERE min_withdrawal_ngn IS DISTINCT FROM 500;

-- Keep the debit RPC fallback aligned for tenants with a null setting.
CREATE OR REPLACE FUNCTION debit_salon_purse_for_withdrawal(
  p_tenant_id UUID,
  p_withdrawal_id UUID,
  p_amount NUMERIC,
  p_currency TEXT,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_entry_id UUID;
  v_salon_wallet_id UUID;
  v_wallet_currency TEXT;
  v_salon_wallet_balance NUMERIC;
  v_new_balance NUMERIC;
  v_balance_before NUMERIC;
  v_ledger_entry_id UUID;
  v_min_withdrawal NUMERIC;
BEGIN
  -- Check idempotency: return existing entry if already processed
  SELECT id INTO v_existing_entry_id
  FROM wallet_ledger_entries
  WHERE tenant_id = p_tenant_id
    AND idempotency_key = p_idempotency_key
  LIMIT 1;

  IF v_existing_entry_id IS NOT NULL THEN
    RETURN v_existing_entry_id;
  END IF;

  -- Fetch minimum withdrawal amount from tenants table based on currency
  SELECT 
    CASE 
      WHEN p_currency = 'NGN' THEN COALESCE(min_withdrawal_ngn, 500)
      WHEN p_currency = 'GHS' THEN COALESCE(min_withdrawal_ghs, 50)
      ELSE 0
    END INTO v_min_withdrawal
  FROM tenants
  WHERE id = p_tenant_id;

  -- Raise exception if amount is below minimum
  IF p_amount < v_min_withdrawal THEN
    RAISE EXCEPTION 'Withdrawal amount % % is below minimum % % for currency %', 
      p_amount, p_currency, v_min_withdrawal, p_currency, p_currency;
  END IF;

  -- Lock salon_wallets row and fetch currency and current balance
  SELECT id, currency, balance INTO v_salon_wallet_id, v_wallet_currency, v_salon_wallet_balance
  FROM salon_wallets
  WHERE tenant_id = p_tenant_id
  FOR UPDATE;

  -- Raise exception if wallet not found
  IF v_salon_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Salon wallet not found for tenant %', p_tenant_id;
  END IF;

  -- Validate currency matches wallet currency
  IF v_wallet_currency != p_currency THEN
    RAISE EXCEPTION 'Currency mismatch: salon wallet currency is % but received %', v_wallet_currency, p_currency;
  END IF;

  -- Verify sufficient balance
  IF v_salon_wallet_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance. Available: % %, Required: % %', 
      v_salon_wallet_balance, p_currency, p_amount, p_currency;
  END IF;

  -- Store balance before transaction
  v_balance_before := v_salon_wallet_balance;

  -- Calculate new balance (subtract withdrawal amount)
  v_new_balance := v_salon_wallet_balance - p_amount;

  -- Update salon wallet balance
  UPDATE salon_wallets
  SET balance = v_new_balance,
      updated_at = NOW()
  WHERE id = v_salon_wallet_id;

  -- Create wallet ledger entry with negative amount (debit)
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
    v_salon_wallet_id,
    'salon_purse_withdrawal',
    p_currency,
    -p_amount,  -- Negative amount indicates debit
    v_balance_before,
    v_new_balance,
    'withdrawal',
    p_withdrawal_id,
    p_idempotency_key,
    NOW()
  ) RETURNING id INTO v_ledger_entry_id;

  -- Return ledger entry ID
  RETURN v_ledger_entry_id;
END;
$$;

COMMENT ON FUNCTION debit_salon_purse_for_withdrawal IS 
  'Idempotent function to debit salon purse for withdrawal. Validates currency matches wallet currency. Enforces minimum withdrawal amounts (NGN 500, GHS 50) and verifies sufficient balance before processing.';
