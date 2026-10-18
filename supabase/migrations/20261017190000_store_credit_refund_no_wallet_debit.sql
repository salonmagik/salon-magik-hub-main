-- Issuing store credit for a refund never moves money to the customer: it
-- creates a redeemable ledger value they draw down against a future
-- booking or purchase. debit_salon_wallet_for_refund previously treated it
-- the same as a real cash payout ('paystack', 'store_credit',
-- 'original_method' all required the salon wallet to currently hold the
-- amount, or the refund was blocked as INSUFFICIENT_RECOVERABLE_FUNDS).
-- That conflated "issuing a liability" with "paying out cash." Only
-- 'paystack' and 'original_method' actually route money back out through a
-- payment provider and still require wallet coverage; 'store_credit' no
-- longer debits the wallet or can be blocked for insufficient balance.
create or replace function public.debit_salon_wallet_for_refund(
  p_transaction_id uuid,
  p_amount numeric,
  p_refund_type public.refund_type,
  p_reason text,
  p_actor_id uuid,
  p_idempotency_key text,
  p_refund_request_id uuid default null,
  p_appointment_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.transactions%rowtype;
  v_wallet_id uuid;
  v_wallet_currency text;
  v_wallet_balance numeric(12,2);
  v_requires_debit boolean;
  v_existing_entry_id uuid;
  v_ledger_entry_id uuid;
  v_block_event_id uuid;
  v_shortfall numeric(12,2);
begin
  select * into v_transaction
  from public.transactions
  where id = p_transaction_id
  for update;

  if v_transaction.id is null then
    raise exception 'Transaction not found for id %', p_transaction_id;
  end if;

  select id into v_existing_entry_id
  from public.wallet_ledger_entries
  where tenant_id = v_transaction.tenant_id
    and idempotency_key = p_idempotency_key
  limit 1;

  if v_existing_entry_id is not null then
    return jsonb_build_object('ok', true, 'ledger_entry_id', v_existing_entry_id);
  end if;

  -- Purse-funded bookings never credited salon_wallets in the first place
  -- (only gateway funds do), so there is nothing to debit; the customer's own
  -- reserved balance is returned via refund_customer_balance_reservation
  -- instead. Offline and store-credit refunds pay out nothing from Salon
  -- Magik, so neither debits the wallet.
  v_requires_debit := p_refund_type in ('paystack', 'original_method')
    and v_transaction.method <> 'purse';

  if not v_requires_debit then
    return jsonb_build_object('ok', true, 'ledger_entry_id', null);
  end if;

  select id, currency, balance into v_wallet_id, v_wallet_currency, v_wallet_balance
  from public.salon_wallets
  where tenant_id = v_transaction.tenant_id
  for update;

  if v_wallet_id is null then
    raise exception 'Salon wallet not found for tenant %', v_transaction.tenant_id;
  end if;

  if v_wallet_currency <> v_transaction.currency then
    raise exception 'Currency mismatch: salon wallet currency is % but transaction currency is %',
      v_wallet_currency, v_transaction.currency;
  end if;

  if v_wallet_balance < p_amount then
    v_shortfall := p_amount - v_wallet_balance;

    insert into public.refund_block_events (
      tenant_id, transaction_id, refund_request_id, appointment_id, refund_type,
      attempted_amount, currency, wallet_balance_at_attempt, shortfall, reason, attempted_by_id
    )
    values (
      v_transaction.tenant_id, p_transaction_id, p_refund_request_id, p_appointment_id, p_refund_type,
      p_amount, v_transaction.currency, v_wallet_balance, v_shortfall, p_reason, p_actor_id
    )
    returning id into v_block_event_id;

    return jsonb_build_object(
      'ok', false,
      'code', 'INSUFFICIENT_RECOVERABLE_FUNDS',
      'wallet_balance', v_wallet_balance,
      'shortfall', v_shortfall,
      'currency', v_transaction.currency,
      'block_event_id', v_block_event_id
    );
  end if;

  v_ledger_entry_id := public.debit_salon_purse(
    v_transaction.tenant_id,
    'salon_purse_debit_refund',
    'transaction',
    p_transaction_id,
    p_amount,
    v_transaction.currency,
    p_idempotency_key
  );

  return jsonb_build_object('ok', true, 'ledger_entry_id', v_ledger_entry_id);
end;
$$;
