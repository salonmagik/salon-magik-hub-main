-- Refund clawbacks must return to the wallet that received the original
-- booking/invoice credit. This prevents one chain branch from funding another
-- branch's refund.

create or replace function public.resolve_refund_wallet(p_transaction_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.transactions%rowtype;
  v_wallet_id uuid;
begin
  select * into v_transaction from public.transactions where id = p_transaction_id;
  select le.wallet_id into v_wallet_id
  from public.wallet_ledger_entries le
  where le.tenant_id = v_transaction.tenant_id
    and le.wallet_type = 'salon'
    and le.entry_type in ('salon_purse_credit_booking', 'salon_purse_credit_invoice')
    and (
      (v_transaction.provider_reference is not null and le.gateway_reference = v_transaction.provider_reference)
      or (v_transaction.appointment_id is not null and le.reference_type = 'appointment'
          and le.reference_id = v_transaction.appointment_id and le.gateway_reference is null)
    )
  order by le.created_at asc
  limit 1;
  if v_wallet_id is null then
    select id into v_wallet_id from public.salon_wallets
    where tenant_id = v_transaction.tenant_id and location_id is null;
  end if;
  return v_wallet_id;
end;
$$;

revoke all on function public.resolve_refund_wallet(uuid) from public, anon, authenticated;
grant execute on function public.resolve_refund_wallet(uuid) to service_role;

create or replace function public.check_refund_recoverability(p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.transactions%rowtype;
  v_wallet public.salon_wallets%rowtype;
  v_requires_debit boolean;
  v_reserved numeric(12,2);
  v_remaining numeric(12,2);
begin
  select * into v_transaction from public.transactions where id = p_transaction_id;
  if v_transaction.id is null then raise exception 'Transaction not found for id %', p_transaction_id; end if;
  if not exists (select 1 from public.user_roles where tenant_id = v_transaction.tenant_id
    and user_id = auth.uid() and role in ('owner', 'manager') and is_active) then
    raise exception 'Only owners and managers can check refund recoverability';
  end if;
  v_requires_debit := v_transaction.method <> 'purse';
  select * into v_wallet from public.salon_wallets where id = public.resolve_refund_wallet(p_transaction_id) for update;
  if v_wallet.id is null then raise exception 'Salon wallet not found for transaction %', p_transaction_id; end if;
  select coalesce(sum(amount), 0) into v_reserved from public.refund_requests
  where transaction_id = p_transaction_id and status in ('pending', 'approved', 'completed');
  v_remaining := greatest(0, v_transaction.amount - v_reserved);
  return jsonb_build_object('requires_wallet_debit', v_requires_debit,
    'wallet_balance', v_wallet.balance, 'currency', v_wallet.currency,
    'wallet_id', v_wallet.id, 'location_id', v_wallet.location_id,
    'max_refundable', case when v_requires_debit then least(v_remaining, v_wallet.balance) else v_remaining end);
end;
$$;

create or replace function public.debit_salon_wallet_for_refund(
  p_transaction_id uuid, p_amount numeric, p_refund_type public.refund_type,
  p_reason text, p_actor_id uuid, p_idempotency_key text,
  p_refund_request_id uuid default null, p_appointment_id uuid default null,
  p_allow_negative boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.transactions%rowtype;
  v_wallet public.salon_wallets%rowtype;
  v_existing_entry_id uuid;
  v_ledger_entry_id uuid;
  v_block_event_id uuid;
  v_shortfall numeric(12,2);
  v_debit_amount numeric(12,2);
  v_requires_debit boolean;
begin
  select * into v_transaction from public.transactions where id = p_transaction_id for update;
  if v_transaction.id is null then raise exception 'Transaction not found for id %', p_transaction_id; end if;
  select id into v_existing_entry_id from public.wallet_ledger_entries
  where tenant_id = v_transaction.tenant_id and idempotency_key = p_idempotency_key limit 1;
  if v_existing_entry_id is not null then return jsonb_build_object('ok', true, 'ledger_entry_id', v_existing_entry_id); end if;
  v_requires_debit := p_refund_type in ('paystack', 'store_credit', 'original_method') and v_transaction.method <> 'purse';
  if not v_requires_debit then return jsonb_build_object('ok', true, 'ledger_entry_id', null); end if;
  v_debit_amount := public.refund_wallet_debit_amount(p_transaction_id, p_amount);
  if v_debit_amount <= 0 then return jsonb_build_object('ok', true, 'ledger_entry_id', null); end if;
  select * into v_wallet from public.salon_wallets where id = public.resolve_refund_wallet(p_transaction_id) for update;
  if v_wallet.id is null then raise exception 'Salon wallet not found for transaction %', p_transaction_id; end if;
  if v_wallet.currency <> v_transaction.currency then raise exception 'Currency mismatch: wallet is % but transaction is %', v_wallet.currency, v_transaction.currency; end if;
  if v_wallet.balance < v_debit_amount then
    v_shortfall := v_debit_amount - v_wallet.balance;
    insert into public.refund_block_events (tenant_id, transaction_id, refund_request_id, appointment_id, refund_type,
      attempted_amount, currency, wallet_balance_at_attempt, shortfall, reason, attempted_by_id)
    values (v_transaction.tenant_id, p_transaction_id, p_refund_request_id, p_appointment_id, p_refund_type,
      v_debit_amount, v_transaction.currency, v_wallet.balance, v_shortfall, p_reason, p_actor_id)
    returning id into v_block_event_id;
    if not p_allow_negative then return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_RECOVERABLE_FUNDS',
      'wallet_balance', v_wallet.balance, 'shortfall', v_shortfall, 'currency', v_transaction.currency,
      'wallet_id', v_wallet.id, 'location_id', v_wallet.location_id, 'block_event_id', v_block_event_id); end if;
  end if;
  if p_allow_negative and v_wallet.balance < v_debit_amount then
    update public.salon_wallets set balance = balance - v_debit_amount, updated_at = now() where id = v_wallet.id;
    insert into public.wallet_ledger_entries (tenant_id, location_id, wallet_type, wallet_id, entry_type, currency,
      amount, balance_before, balance_after, reference_type, reference_id, idempotency_key, metadata)
    values (v_transaction.tenant_id, v_wallet.location_id, 'salon', v_wallet.id, 'salon_purse_debit_refund',
      v_transaction.currency, -v_debit_amount, v_wallet.balance, v_wallet.balance - v_debit_amount,
      'transaction', p_transaction_id, p_idempotency_key, jsonb_build_object('refund_gross_amount', p_amount))
    returning id into v_ledger_entry_id;
  else
    v_ledger_entry_id := public.debit_salon_purse(v_transaction.tenant_id, 'salon_purse_debit_refund',
      'transaction', p_transaction_id, v_debit_amount, v_transaction.currency, p_idempotency_key, v_wallet.location_id);
    update public.wallet_ledger_entries set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('refund_gross_amount', p_amount)
    where id = v_ledger_entry_id;
  end if;
  return jsonb_build_object('ok', true, 'ledger_entry_id', v_ledger_entry_id,
    'wallet_id', v_wallet.id, 'location_id', v_wallet.location_id);
end;
$$;

revoke execute on function public.check_refund_recoverability(uuid) from public, anon;
grant execute on function public.check_refund_recoverability(uuid) to authenticated;
revoke execute on function public.debit_salon_wallet_for_refund(uuid, numeric, public.refund_type, text, uuid, text, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.debit_salon_wallet_for_refund(uuid, numeric, public.refund_type, text, uuid, text, uuid, uuid, boolean) to service_role;
