-- Corrects the refund-clawback safeguard adopted in the previous five
-- migrations: debit_salon_wallet_for_refund used the gross refund amount,
-- but the wallet is only ever credited net of the platform fee
-- (payment-webhook-processor.ts, credit_salon_purse call sites). At the
-- default 0.5% fee a full refund of a lone payment was short exactly the
-- fee and blocked every time. See
-- docs/design/payout-refund-wallet-not-debited.design.md AD-N1/AD-N2/AD-N5.

-- Derives the salon's actual recoverable share of a refunded transaction
-- from the wallet ledger itself, never from p_amount or the tenant's
-- current platform_percentage_charge (which may have changed since the
-- transaction was credited). Internal to the enforcement path only.
create or replace function public.refund_wallet_debit_amount(
  p_transaction_id uuid,
  p_amount numeric
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.transactions%rowtype;
  v_credited numeric(12,2);
  v_debited numeric(12,2);
  v_reversed numeric(12,2);
  v_already numeric(12,2);
  v_remaining_wallet numeric(12,2);
  v_reserved numeric(12,2);
  v_txn_remaining numeric(12,2);
  v_debit numeric(12,2);
begin
  select * into v_transaction
  from public.transactions
  where id = p_transaction_id;

  if v_transaction.id is null then
    raise exception 'Transaction not found for id %', p_transaction_id;
  end if;

  -- Attribution: gateway-funded credits match by provider reference;
  -- purse-funded redemption credits (settle_customer_balance_reservation)
  -- match by appointment with no gateway_reference. credited = 0 means the
  -- salon was never given this money (e.g. credit_salon_purse's own error
  -- was swallowed at webhook time) — nothing to debit, not a block.
  select coalesce(sum(amount), 0) into v_credited
  from public.wallet_ledger_entries
  where tenant_id = v_transaction.tenant_id
    and wallet_type = 'salon'
    and entry_type in ('salon_purse_credit_booking', 'salon_purse_credit_invoice')
    and (
      (v_transaction.provider_reference is not null and gateway_reference = v_transaction.provider_reference)
      or (
        v_transaction.appointment_id is not null
        and reference_type = 'appointment'
        and reference_id = v_transaction.appointment_id
        and gateway_reference is null
      )
    );

  if v_credited <= 0 then
    return 0;
  end if;

  select coalesce(sum(amount), 0) into v_debited
  from public.wallet_ledger_entries
  where tenant_id = v_transaction.tenant_id
    and wallet_type = 'salon'
    and entry_type = 'salon_purse_debit_refund'
    and reference_type = 'transaction'
    and reference_id = p_transaction_id;

  select coalesce(sum(r.amount), 0) into v_reversed
  from public.wallet_ledger_entries r
  where r.tenant_id = v_transaction.tenant_id
    and r.wallet_type = 'salon'
    and r.entry_type = 'salon_purse_reversal'
    and r.reference_type = 'reversal'
    and exists (
      select 1
      from public.wallet_ledger_entries d
      where d.id = r.reference_id
        and d.tenant_id = v_transaction.tenant_id
        and d.entry_type = 'salon_purse_debit_refund'
        and d.reference_type = 'transaction'
        and d.reference_id = p_transaction_id
    );

  -- v_debited sums negative debit amounts; v_reversed sums the positive
  -- credits that reversed some of them back. already <= 0.
  v_already := v_debited + v_reversed;
  v_remaining_wallet := v_credited + v_already;

  if v_remaining_wallet <= 0 then
    return 0;
  end if;

  -- Final tranche detection: when this refund settles the transaction's
  -- entire remaining refundable amount, take the remaining wallet share
  -- exactly rather than a pro-rata fraction, so no rounding residue
  -- accumulates across partial refunds. Only 'completed' refund_requests
  -- count as already reserved — a 'pending' row for this very call has not
  -- had its wallet debit taken yet.
  select coalesce(sum(amount), 0) into v_reserved
  from public.refund_requests
  where transaction_id = p_transaction_id
    and status = 'completed';

  v_txn_remaining := v_transaction.amount - v_reserved;

  if v_transaction.amount > 0 and p_amount = v_txn_remaining then
    v_debit := v_remaining_wallet;
  else
    v_debit := round(v_credited * (p_amount / nullif(v_transaction.amount, 0)), 2);
  end if;

  return least(v_debit, v_remaining_wallet);
end;
$$;

revoke execute on function public.refund_wallet_debit_amount(uuid, numeric) from public, anon, authenticated;
grant execute on function public.refund_wallet_debit_amount(uuid, numeric) to service_role;

-- debit_salon_wallet_for_refund: amount is now computed via
-- refund_wallet_debit_amount instead of trusting p_amount (the gross refund
-- amount) directly; the ledger row it creates is stamped with the gross
-- amount it was taken for, since the amount identity the guard in
-- complete_transaction_refund relies on no longer holds; gains
-- p_allow_negative for the future out-of-band-refund seam (AD-N5) — no
-- caller passes true yet.
create or replace function public.debit_salon_wallet_for_refund(
  p_transaction_id uuid,
  p_amount numeric,
  p_refund_type public.refund_type,
  p_reason text,
  p_actor_id uuid,
  p_idempotency_key text,
  p_refund_request_id uuid default null,
  p_appointment_id uuid default null,
  p_allow_negative boolean default false
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
  v_debit_amount numeric(12,2);
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

  v_debit_amount := public.refund_wallet_debit_amount(p_transaction_id, p_amount);

  if v_debit_amount <= 0 then
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

  if v_wallet_balance < v_debit_amount then
    v_shortfall := v_debit_amount - v_wallet_balance;

    insert into public.refund_block_events (
      tenant_id, transaction_id, refund_request_id, appointment_id, refund_type,
      attempted_amount, currency, wallet_balance_at_attempt, shortfall, reason, attempted_by_id
    )
    values (
      v_transaction.tenant_id, p_transaction_id, p_refund_request_id, p_appointment_id, p_refund_type,
      v_debit_amount, v_transaction.currency, v_wallet_balance, v_shortfall, p_reason, p_actor_id
    )
    returning id into v_block_event_id;

    if not p_allow_negative then
      return jsonb_build_object(
        'ok', false,
        'code', 'INSUFFICIENT_RECOVERABLE_FUNDS',
        'wallet_balance', v_wallet_balance,
        'shortfall', v_shortfall,
        'currency', v_transaction.currency,
        'block_event_id', v_block_event_id
      );
    end if;

    -- p_allow_negative: take the debit anyway, driving the balance negative,
    -- while still leaving the block event above as the arrears record.
    -- debit_salon_purse itself refuses an insufficient balance, so this one
    -- path writes the ledger row and balance update directly rather than
    -- calling it.
    update public.salon_wallets
    set balance = v_wallet_balance - v_debit_amount,
        updated_at = now()
    where id = v_wallet_id;

    insert into public.wallet_ledger_entries (
      tenant_id, wallet_type, wallet_id, entry_type, currency, amount,
      balance_before, balance_after, reference_type, reference_id,
      idempotency_key, metadata
    )
    values (
      v_transaction.tenant_id, 'salon', v_wallet_id, 'salon_purse_debit_refund', v_transaction.currency,
      -1 * v_debit_amount, v_wallet_balance, v_wallet_balance - v_debit_amount, 'transaction', p_transaction_id,
      p_idempotency_key, jsonb_build_object('refund_gross_amount', p_amount)
    )
    returning id into v_ledger_entry_id;

    return jsonb_build_object('ok', true, 'ledger_entry_id', v_ledger_entry_id);
  end if;

  v_ledger_entry_id := public.debit_salon_purse(
    v_transaction.tenant_id,
    'salon_purse_debit_refund',
    'transaction',
    p_transaction_id,
    v_debit_amount,
    v_transaction.currency,
    p_idempotency_key
  );

  update public.wallet_ledger_entries
  set metadata = metadata || jsonb_build_object('refund_gross_amount', p_amount)
  where id = v_ledger_entry_id;

  return jsonb_build_object('ok', true, 'ledger_entry_id', v_ledger_entry_id);
end;
$$;

revoke execute on function public.debit_salon_wallet_for_refund(
  uuid, numeric, public.refund_type, text, uuid, text, uuid, uuid, boolean
) from public, anon, authenticated;
grant execute on function public.debit_salon_wallet_for_refund(
  uuid, numeric, public.refund_type, text, uuid, text, uuid, uuid, boolean
) to service_role;

-- The old 8-argument signature is replaced, not overloaded — every caller
-- (refund-via-paystack, refund-cancelled-appointment) is updated in this
-- same change to pass p_allow_negative or rely on its default.
drop function if exists public.debit_salon_wallet_for_refund(
  uuid, numeric, public.refund_type, text, uuid, text, uuid, uuid
);

-- complete_transaction_refund's proof-of-debit amount check: the identity
-- "debit amount = refund amount" no longer holds (the debit is now the
-- wallet's net share, not the gross refund), so the check is re-pointed at
-- the gross amount the debit was stamped with instead of recomputing it —
-- recomputing would disagree with itself once "already" has moved.
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

  -- A null wallet_debit_entry_id is legitimate, not just a bypass, when the
  -- salon was never actually given this money in the first place (design
  -- edge case 4 — a swallowed credit_salon_purse error on the original
  -- charge): debit_salon_wallet_for_refund correctly returns a null entry id
  -- for that case too, since there is nothing to debit. Recompute the same
  -- way it did to tell the two apart, rather than trusting a bare null.
  if v_requires_wallet_debit and p_wallet_debit_entry_id is null
     and public.refund_wallet_debit_amount(p_transaction_id, p_amount) > 0 then
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
       or (v_debit.metadata->>'refund_gross_amount')::numeric <> p_amount
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

-- Credit-attribution lookups in refund_wallet_debit_amount above are scoped
-- by tenant_id and an equality on gateway_reference or
-- (reference_type, reference_id) — bounded to the entries for one
-- transaction, but only if indexed; without these it degrades to a
-- per-tenant scan of the highest-volume table in the schema.
create index if not exists wallet_ledger_entries_tenant_gateway_reference_idx
  on public.wallet_ledger_entries (tenant_id, gateway_reference);

create index if not exists wallet_ledger_entries_tenant_reference_idx
  on public.wallet_ledger_entries (tenant_id, reference_type, reference_id);

-- Reverse the actual net debit, validating the recorded gross refund.
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
  perform 1 from public.transactions where id=p_transaction_id for update;
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
     or coalesce((v_debit_entry.metadata->>'refund_gross_amount')::numeric, -v_debit_entry.amount) is distinct from p_amount
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
