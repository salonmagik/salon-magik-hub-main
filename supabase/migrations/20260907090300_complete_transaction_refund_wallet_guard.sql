-- Makes complete_transaction_refund non-bypassable: reachable directly over
-- PostgREST by any owner/manager, so the guard is only real if the RPC
-- itself refuses to book a refund that required a wallet debit but wasn't
-- handed proof of one (a wallet_ledger_entries row genuinely covering it).
-- create or replace cannot add a parameter, so the old signature is dropped
-- first, matching the pattern 20260906180500_backoffice_ledger_lifecycle.sql
-- already uses.

drop function if exists public.complete_transaction_refund(
  uuid, numeric, public.refund_type, text, uuid);

create or replace function public.complete_transaction_refund(
  p_transaction_id uuid,
  p_amount numeric,
  p_refund_type public.refund_type,
  p_reason text,
  p_request_id uuid default null,
  p_wallet_debit_entry_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.transactions%rowtype;
  v_request public.refund_requests%rowtype;
  v_refund_id uuid;
  v_request_id uuid;
  v_reserved numeric(12,2);
  v_remaining numeric(12,2);
  v_method public.payment_method;
  v_balance_refund_handled boolean := false;
  v_requires_wallet_debit boolean;
  v_debit public.wallet_ledger_entries%rowtype;
begin
  select * into v_transaction
  from public.transactions
  where id = p_transaction_id
  for update;

  if v_transaction.id is null
     or v_transaction.type not in ('payment', 'deposit')
     or v_transaction.status <> 'completed'
     or v_transaction.customer_id is null then
    raise exception 'This transaction is not refundable';
  end if;

  if not exists (
    select 1 from public.user_roles
    where tenant_id = v_transaction.tenant_id
      and user_id = auth.uid()
      and role in ('owner', 'manager')
      and is_active = true
  ) then
    raise exception 'Only owners and managers can complete refunds';
  end if;

  if p_amount is null or p_amount <= 0 or nullif(trim(p_reason), '') is null then
    raise exception 'A valid amount and reason are required';
  end if;

  if p_request_id is not null then
    select * into v_request
    from public.refund_requests
    where id = p_request_id
      and transaction_id = p_transaction_id
    for update;
    if v_request.id is null or v_request.status <> 'pending' then
      raise exception 'Refund request is no longer pending';
    end if;
    if v_request.amount <> p_amount or v_request.refund_type <> p_refund_type then
      raise exception 'Approved refund must match the pending request';
    end if;
  end if;

  select coalesce(sum(amount), 0)
  into v_reserved
  from public.refund_requests
  where transaction_id = p_transaction_id
    and status in ('pending', 'approved', 'completed')
    and (p_request_id is null or id <> p_request_id);

  v_remaining := v_transaction.amount - v_reserved;
  if p_amount > v_remaining then
    raise exception 'Refund exceeds the remaining refundable amount';
  end if;

  -- Wallet-debit guard (refund clawback safeguard): a refund that moves
  -- money out of the salon's own recoverable funds must be backed by a real,
  -- already-committed wallet_ledger_entries debit — taking that debit here
  -- would be too late for the paystack path (the external refund already
  -- happened by the time this RPC runs), so the debit is taken up front by
  -- debit_salon_wallet_for_refund and merely validated here.
  v_requires_wallet_debit := p_refund_type in ('paystack', 'store_credit', 'original_method')
    and v_transaction.method <> 'purse';

  if v_requires_wallet_debit and p_wallet_debit_entry_id is null then
    raise exception 'REFUND_WALLET_DEBIT_REQUIRED: a refund of this type must be completed through the refund-via-paystack function';
  end if;

  if p_wallet_debit_entry_id is not null then
    if not v_requires_wallet_debit then
      raise exception 'REFUND_WALLET_DEBIT_UNEXPECTED: this refund does not draw on the salon wallet and must not carry a wallet debit';
    end if;

    select * into v_debit
    from public.wallet_ledger_entries
    where id = p_wallet_debit_entry_id
    for update;

    if v_debit.id is null
       or v_debit.tenant_id <> v_transaction.tenant_id
       or v_debit.wallet_type <> 'salon'
       or v_debit.entry_type <> 'salon_purse_debit_refund'
       or v_debit.amount <> -p_amount
       or v_debit.currency <> v_transaction.currency
       or v_debit.reference_id <> p_transaction_id then
      raise exception 'REFUND_WALLET_DEBIT_INVALID: the supplied wallet debit does not cover this refund';
    end if;
  end if;

  v_method := case
    when p_refund_type = 'store_credit' then 'purse'::public.payment_method
    when p_refund_type = 'offline' and v_transaction.method = 'cash' then 'cash'::public.payment_method
    when p_refund_type = 'offline' then 'transfer'::public.payment_method
    else v_transaction.method
  end;

  insert into public.transactions (
    tenant_id, customer_id, appointment_id, type, method, amount, currency,
    provider, provider_reference, status, created_by_id, original_transaction_id,
    refund_request_id
  )
  values (
    v_transaction.tenant_id, v_transaction.customer_id, v_transaction.appointment_id,
    'refund', v_method, p_amount, v_transaction.currency,
    case when p_refund_type = 'store_credit' then 'customer_balance' else 'external' end,
    p_transaction_id::text, 'completed', auth.uid(), p_transaction_id, p_request_id
  )
  returning id into v_refund_id;

  if p_request_id is null then
    insert into public.refund_requests (
      tenant_id, transaction_id, customer_id, refund_type, amount, reason,
      status, requested_by_id, approved_by_id, approved_at, processed_transaction_id,
      wallet_debit_entry_id
    )
    values (
      v_transaction.tenant_id, p_transaction_id, v_transaction.customer_id,
      p_refund_type, p_amount, trim(p_reason), 'completed', auth.uid(), auth.uid(),
      now(), v_refund_id, p_wallet_debit_entry_id
    )
    returning id into v_request_id;

    update public.transactions
    set refund_request_id = v_request_id
    where id = v_refund_id;
  else
    v_request_id := p_request_id;
    update public.refund_requests
    set status = 'completed',
        approved_by_id = auth.uid(),
        approved_at = now(),
        processed_transaction_id = v_refund_id,
        wallet_debit_entry_id = p_wallet_debit_entry_id,
        updated_at = now()
    where id = p_request_id;
  end if;

  if v_transaction.method = 'purse' and v_transaction.appointment_id is not null then
    v_balance_refund_handled := public.refund_customer_balance_reservation(
      v_transaction.appointment_id,
      p_amount,
      p_refund_type in ('store_credit', 'original_method')
    );
  end if;

  if (
    p_refund_type = 'store_credit'
    or (p_refund_type = 'original_method' and v_transaction.method = 'purse')
  ) and not v_balance_refund_handled then
    perform public.credit_customer_balance(
      v_transaction.tenant_id,
      v_transaction.customer_id,
      p_amount,
      v_transaction.currency,
      'refund',
      v_refund_id,
      false,
      null,
      'Refund issued as store credit',
      'refund_credit_' || v_refund_id::text,
      jsonb_build_object(
        'original_transaction_id', p_transaction_id,
        'refund_request_id', v_request_id
      )
    );
  end if;

  if v_transaction.appointment_id is not null then
    update public.appointments
    set amount_paid = greatest(0, amount_paid - p_amount),
    payment_status = case
      when amount_paid - p_amount <= 0 then 'refunded_full'::public.payment_status
      else 'refunded_partial'::public.payment_status
    end,
    updated_at = now()
    where id = v_transaction.appointment_id;
  end if;

  perform public.log_audit_event(
    v_transaction.tenant_id,
    'update',
    'transaction',
    p_transaction_id,
    null,
    jsonb_build_object(
      'refund_transaction_id', v_refund_id,
      'refund_request_id', v_request_id,
      'amount', p_amount,
      'refund_type', p_refund_type,
      'processed_by_id', auth.uid(),
      'wallet_debit_entry_id', p_wallet_debit_entry_id
    )
  );

  return v_refund_id;
end;
$$;

grant execute on function public.complete_transaction_refund(
  uuid, numeric, public.refund_type, text, uuid, uuid
) to authenticated;
