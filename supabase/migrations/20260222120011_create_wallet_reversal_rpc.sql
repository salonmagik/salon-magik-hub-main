-- Migration: Create create_wallet_reversal RPC function
-- Description: Function for reversing wallet transactions
-- Created: 2026-02-22

-- =============================================
-- Function: create_wallet_reversal
-- Description: Reverses a wallet transaction by crediting back the debited amount or debiting back the credited amount
-- Parameters:
--   p_original_entry_id: The ID of the original ledger entry to reverse
--   p_reason: The reason for the reversal (e.g., 'transfer_failed', 'payment_cancelled')
--   p_idempotency_key: Unique key to prevent duplicate reversals
-- Returns: UUID of the created reversal ledger entry
-- =============================================

CREATE OR REPLACE FUNCTION create_wallet_reversal(
  p_original_entry_id UUID,
  p_reason TEXT,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_original_entry RECORD;
  v_reversal_entry_type wallet_entry_type;
  v_wallet_id UUID;
  v_balance_before NUMERIC(12, 2);
  v_balance_after NUMERIC(12, 2);
  v_reversal_amount NUMERIC(12, 2);
  v_ledger_entry_id UUID;
  v_existing_entry_id UUID;
BEGIN
  -- Check idempotency: if this key was already processed, return existing entry ID
  SELECT id INTO v_existing_entry_id
  FROM wallet_ledger_entries
  WHERE idempotency_key = p_idempotency_key
  LIMIT 1;

  IF v_existing_entry_id IS NOT NULL THEN
    RETURN v_existing_entry_id;
  END IF;

  -- Fetch original wallet_ledger_entries record
  SELECT * INTO v_original_entry
  FROM wallet_ledger_entries
  WHERE id = p_original_entry_id;

  -- Raise exception if original entry not found
  IF v_original_entry.id IS NULL THEN
    RAISE EXCEPTION 'Original ledger entry not found with ID %', p_original_entry_id;
  END IF;

  -- Determine reversal type based on wallet_type
  IF v_original_entry.wallet_type = 'customer' THEN
    v_reversal_entry_type := 'customer_purse_reversal';
  ELSIF v_original_entry.wallet_type = 'salon' THEN
    v_reversal_entry_type := 'salon_purse_reversal';
  ELSE
    RAISE EXCEPTION 'Unknown wallet_type %', v_original_entry.wallet_type;
  END IF;

  -- Calculate reversal amount (negative of original amount)
  v_reversal_amount := -1 * v_original_entry.amount;

  -- Lock appropriate wallet and get current balance
  IF v_original_entry.wallet_type = 'customer' THEN
    -- Lock customer_purses row
    SELECT id, balance INTO v_wallet_id, v_balance_before
    FROM customer_purses
    WHERE id = v_original_entry.wallet_id
    FOR UPDATE;

    IF v_wallet_id IS NULL THEN
      RAISE EXCEPTION 'Customer purse not found with ID %', v_original_entry.wallet_id;
    END IF;

    -- Calculate new balance
    v_balance_after := v_balance_before + v_reversal_amount;

    -- Update customer_purses balance
    UPDATE customer_purses
    SET balance = v_balance_after,
        updated_at = NOW()
    WHERE id = v_wallet_id;

  ELSIF v_original_entry.wallet_type = 'salon' THEN
    -- Lock salon_wallets row
    SELECT id, balance INTO v_wallet_id, v_balance_before
    FROM salon_wallets
    WHERE id = v_original_entry.wallet_id
    FOR UPDATE;

    IF v_wallet_id IS NULL THEN
      RAISE EXCEPTION 'Salon wallet not found with ID %', v_original_entry.wallet_id;
    END IF;

    -- Calculate new balance
    v_balance_after := v_balance_before + v_reversal_amount;

    -- Update salon_wallets balance
    UPDATE salon_wallets
    SET balance = v_balance_after,
        updated_at = NOW()
    WHERE id = v_wallet_id;
  END IF;

  -- Create reversal ledger entry with metadata containing reason and original_entry_id
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
    metadata,
    created_at
  ) VALUES (
    v_original_entry.tenant_id,
    v_original_entry.wallet_type,
    v_original_entry.wallet_id,
    v_reversal_entry_type,
    v_original_entry.currency,
    v_reversal_amount,
    v_balance_before,
    v_balance_after,
    'reversal',
    v_original_entry.id::TEXT,
    NULL,
    NULL,
    p_idempotency_key,
    jsonb_build_object(
      'reason', p_reason,
      'original_entry_id', v_original_entry.id,
      'original_amount', v_original_entry.amount,
      'original_entry_type', v_original_entry.entry_type
    ),
    NOW()
  ) RETURNING id INTO v_ledger_entry_id;

  RETURN v_ledger_entry_id;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION create_wallet_reversal IS 'Reverses a wallet transaction by creating a reversal ledger entry and adjusting wallet balance. Used when transfers fail or payments need to be refunded.';
