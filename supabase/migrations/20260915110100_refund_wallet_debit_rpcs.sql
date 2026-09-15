-- The enforcement primitive for the refund clawback safeguard: taking the
-- salon-wallet debit (or recording why it couldn't be taken) is one
-- indivisible, locked decision, reusing debit_salon_purse/create_wallet_reversal
-- rather than re-deriving "can this wallet afford it" a second time.

-- Read-only advisory check the refund dialog calls on open. Not the
-- guarantee — debit_salon_wallet_for_refund is — just enough to keep the
-- dialog from offering a destination the backend will refuse.
create or replace function public.check_refund_recoverability(p_transaction_id uuid)
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
  v_reserved numeric(12,2);
  v_remaining numeric(12,2);
begin
  select * into v_transaction
  from public.transactions
  where id = p_transaction_id;

  if v_transaction.id is null then
    raise exception 'Transaction not found for id %', p_transaction_id;
  end if;

  if not exists (
    select 1 from public.user_roles
    where tenant_id = v_transaction.tenant_id
      and user_id = auth.uid()
      and role in ('owner', 'manager')
      and is_active = true
  ) then
    raise exception 'Only owners and managers can check refund recoverability';
  end if;

  v_requires_debit := v_transaction.method <> 'purse';

  select id, currency, balance into v_wallet_id, v_wallet_currency, v_wallet_balance
  from public.salon_wallets
  where tenant_id = v_transaction.tenant_id;

  if v_wallet_id is null then
    raise exception 'Salon wallet not found for tenant %', v_transaction.tenant_id;
  end if;

  select coalesce(sum(amount), 0) into v_reserved
  from public.refund_requests
  where transaction_id = p_transaction_id
    and status in ('pending', 'approved', 'completed');

  v_remaining := greatest(0, v_transaction.amount - v_reserved);

  return jsonb_build_object(
    'requires_wallet_debit', v_requires_debit,
    'wallet_balance', v_wallet_balance,
    'currency', v_wallet_currency,
    'max_refundable', case when v_requires_debit then least(v_remaining, v_wallet_balance) else v_remaining end
  );
end;
$$;

grant execute on function public.check_refund_recoverability(uuid) to authenticated;

-- The enforcement point. Callers (edge functions holding the service key)
-- must call this before any irreversible external effect. It never raises on
-- insufficient funds — raising would roll back the block-event insert along
-- with it, since Postgres/Supabase has no autonomous transactions — it
-- returns {ok:false} after committing the block record. Raising is reserved
-- for genuine faults (missing wallet, currency mismatch): those are not
-- user-visible block conditions and must roll back.
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
  -- instead. Offline refunds pay out nothing from Salon Magik either.
  v_requires_debit := p_refund_type in ('paystack', 'store_credit', 'original_method')
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

revoke execute on function public.debit_salon_wallet_for_refund(
  uuid, numeric, public.refund_type, text, uuid, text, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.debit_salon_wallet_for_refund(
  uuid, numeric, public.refund_type, text, uuid, text, uuid, uuid
) to service_role;

-- Compensating credit when the external effect (Paystack /refund) fails
-- after the debit already committed. Wraps the existing generic
-- create_wallet_reversal RPC rather than re-deriving reversal bookkeeping.
create or replace function public.reverse_refund_wallet_debit(
  p_tenant_id uuid,
  p_transaction_id uuid,
  p_amount numeric,
  p_currency text,
  p_debit_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debit_entry public.wallet_ledger_entries%rowtype;
  v_reversal_entry_id uuid;
begin
  select * into v_debit_entry
  from public.wallet_ledger_entries
  where tenant_id = p_tenant_id
    and idempotency_key = p_debit_idempotency_key
  limit 1;

  if v_debit_entry.id is null then
    raise exception 'No wallet debit found for tenant % with idempotency key %', p_tenant_id, p_debit_idempotency_key;
  end if;

  if v_debit_entry.wallet_type <> 'salon'
     or v_debit_entry.entry_type <> 'salon_purse_debit_refund'
     or v_debit_entry.amount <> -p_amount
     or v_debit_entry.currency <> p_currency
     or v_debit_entry.reference_id <> p_transaction_id then
    raise exception 'Wallet debit entry does not match the refund being reversed';
  end if;

  v_reversal_entry_id := public.create_wallet_reversal(
    v_debit_entry.id,
    'refund_failed_after_debit',
    p_debit_idempotency_key || '__reversal'
  );

  return v_reversal_entry_id;
end;
$$;

revoke execute on function public.reverse_refund_wallet_debit(
  uuid, uuid, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.reverse_refund_wallet_debit(
  uuid, uuid, numeric, text, text
) to service_role;
