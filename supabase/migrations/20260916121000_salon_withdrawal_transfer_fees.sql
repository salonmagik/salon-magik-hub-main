-- Existing withdrawals keep zero fees; never retroactively charge them.
alter table public.salon_withdrawals
  add column transfer_fee numeric(12,2) not null default 0 check (transfer_fee >= 0),
  add column stamp_duty numeric(12,2) not null default 0 check (stamp_duty >= 0),
  add column fee_version text,
  add column fee_outcome text check (fee_outcome in ('success', 'failed', 'reversed')),
  add column fee_reconciliation_required boolean not null default false,
  add column wallet_debited numeric(12,2) not null default 0;

-- Lock the wallet before reserving funds, so concurrent requests cannot spend
-- the same cleared balance. The pending row is the reservation, including fees.
create or replace function public.reserve_fee_bearing_withdrawal()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_available numeric;
  v_wallet public.salon_wallets%rowtype;
  v_destination public.salon_payout_destinations%rowtype;
  v_fee numeric;
  v_duty numeric;
begin
  if new.fee_version is null then return new; end if;
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
  if new.fee_version <> 'paystack-2026-09-16' or new.status <> 'pending'
    or new.wallet_debited <> 0 or new.fee_outcome is not null then
    raise exception 'Invalid withdrawal fee policy or initial state';
  end if;
  select * into strict v_wallet from public.salon_wallets where id = new.salon_wallet_id for update;
  select * into strict v_destination from public.salon_payout_destinations where id = new.payout_destination_id;
  if v_wallet.tenant_id <> new.tenant_id or v_destination.tenant_id <> new.tenant_id
    or v_wallet.currency <> new.currency or v_destination.currency <> new.currency then
    raise exception 'Withdrawal ownership or currency mismatch';
  end if;
  if new.currency = 'NGN' and v_destination.destination_type = 'bank' then
    if new.amount < 500 or new.amount > 10000000 then raise exception 'Invalid NGN withdrawal amount'; end if;
    v_fee := case when new.amount <= 5000 then 10 when new.amount <= 50000 then 25 else 50 end;
    v_duty := case when new.amount >= 10000 then 50 else 0 end;
  elsif new.currency = 'GHS' and v_destination.destination_type in ('bank', 'mobile_money') then
    if new.amount < 50 or new.amount > 50000 then raise exception 'Invalid GHS withdrawal amount'; end if;
    v_fee := case when v_destination.destination_type = 'bank' then 8 else 1 end;
    v_duty := 0;
  else raise exception 'Unsupported withdrawal destination';
  end if;
  if new.transfer_fee <> v_fee or new.stamp_duty <> v_duty then raise exception 'Withdrawal fee mismatch'; end if;
  select available into v_available from public.get_salon_wallet_availability(new.tenant_id);
  if v_available is null or v_available < new.amount + new.transfer_fee + new.stamp_duty then
    raise exception 'Insufficient cleared funds for withdrawal and fees';
  end if;
  return new;
end;
$$;
create trigger reserve_fee_bearing_withdrawal before insert on public.salon_withdrawals
for each row execute function public.reserve_fee_bearing_withdrawal();

-- Resolve the payment and its accounting in one transaction. Retries and
-- out-of-order callbacks cannot duplicate the debit or resurrect a reversal.
create or replace function public.finalize_fee_bearing_withdrawal(
  p_withdrawal_id uuid, p_outcome text, p_transfer_fee_refunded boolean default false
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_w public.salon_withdrawals%rowtype;
  v_balance numeric;
  v_target numeric;
  v_delta numeric;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
  if p_outcome is null or p_outcome not in ('success', 'failed', 'reversed') then raise exception 'Invalid transfer outcome'; end if;
  select * into strict v_w from public.salon_withdrawals where id = p_withdrawal_id for update;
  if v_w.fee_version is null then raise exception 'Legacy withdrawal must use legacy reconciliation'; end if;
  if v_w.fee_outcome = 'reversed' and p_outcome <> 'reversed' then return; end if;
  if v_w.fee_outcome = 'success' and p_outcome = 'failed' then return; end if;
  if v_w.fee_outcome = 'failed' and p_outcome = 'success' then return; end if;
  -- Once a transfer fee refund has been confirmed, a duplicate reversal must
  -- never re-charge it. Stamp duty, once applied, is non-refundable.
  if p_outcome = 'success' then
    v_target := v_w.amount + v_w.transfer_fee + v_w.stamp_duty;
  elsif p_outcome = 'failed' then
    v_target := v_w.stamp_duty;
  else
    v_target := v_w.stamp_duty + case
      when p_transfer_fee_refunded or (v_w.fee_outcome = 'reversed' and not v_w.fee_reconciliation_required)
      then 0 else v_w.transfer_fee end;
  end if;
  select balance into strict v_balance from public.salon_wallets where id = v_w.salon_wallet_id for update;
  v_delta := v_target - v_w.wallet_debited;
  if v_delta <> 0 then
    -- The provider has already moved funds. Record the true liability even if
    -- another operation consumed funds; never silently omit a confirmed debit.
    update public.salon_wallets set balance = balance - v_delta, updated_at = now() where id = v_w.salon_wallet_id;
    insert into public.wallet_ledger_entries
      (tenant_id, wallet_type, wallet_id, entry_type, currency, amount, balance_before, balance_after,
       reference_type, reference_id, idempotency_key, metadata)
    values (v_w.tenant_id, 'salon', v_w.salon_wallet_id,
      case when v_delta > 0 then 'salon_purse_withdrawal'::wallet_entry_type else 'salon_purse_reversal'::wallet_entry_type end,
      v_w.currency, -v_delta, v_balance, v_balance - v_delta, 'withdrawal', v_w.id,
      'withdrawal-fees:' || v_w.id || ':' || p_outcome || ':' || v_target,
      jsonb_build_object('transfer_amount', v_w.amount, 'transfer_fee', v_w.transfer_fee,
        'stamp_duty', v_w.stamp_duty, 'fee_version', v_w.fee_version, 'outcome', p_outcome));
  end if;
  update public.salon_withdrawals set
    wallet_debited = v_target, fee_outcome = p_outcome,
    fee_reconciliation_required = p_outcome = 'reversed' and v_target > stamp_duty,
    status = case when p_outcome = 'success' then 'completed'::withdrawal_status else 'failed'::withdrawal_status end,
    failure_reason = case when p_outcome = 'success' then null
      when p_outcome = 'reversed' then 'Transfer reversed. Any provider fee refund is subject to reconciliation; applied stamp duty is non-refundable.'
      else 'Transfer failed. Applied stamp duty is non-refundable.' end
  where id = v_w.id;
end;
$$;
revoke all on function public.finalize_fee_bearing_withdrawal(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.finalize_fee_bearing_withdrawal(uuid, text, boolean) to service_role;

-- Reserve the fee and duty as well as the amount sent.
create or replace function public.get_salon_wallet_availability(p_tenant_id uuid)
returns table (
  balance numeric,
  available numeric,
  pending numeric,
  currency text,
  next_settlement_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet record;
  v_pending numeric;
  v_next_settlement timestamptz;
  v_in_flight_withdrawals numeric;
begin
  if auth.role() <> 'service_role' and not exists (
    select 1 from public.user_roles
    where tenant_id = p_tenant_id
      and user_id = auth.uid()
      and is_active = true
  ) then
    raise exception 'Not authorized to view this wallet';
  end if;

  select * into v_wallet from public.salon_wallets where tenant_id = p_tenant_id;

  if v_wallet is null then
    return query select 0::numeric, 0::numeric, 0::numeric, null::text, null::timestamptz;
    return;
  end if;

  with pending_entries as (
    select
      le.amount,
      le.created_at + interval '1 day'
        + case extract(dow from le.created_at + interval '1 day')::int
            when 6 then interval '2 days'
            when 0 then interval '1 day'
            else interval '0 days'
          end as settles_at
    from public.wallet_ledger_entries le
    where le.wallet_type = 'salon'
      and le.wallet_id = v_wallet.id
      and le.entry_type in ('salon_purse_credit_booking', 'salon_purse_credit_invoice', 'salon_purse_topup')
  )
  select
    coalesce(sum(amount) filter (where settles_at > now()), 0),
    min(settles_at) filter (where settles_at > now())
  into v_pending, v_next_settlement
  from pending_entries;

  select coalesce(sum(greatest(0, amount + transfer_fee + stamp_duty - wallet_debited)), 0)
  into v_in_flight_withdrawals
  from public.salon_withdrawals
  where tenant_id = p_tenant_id
    and status in ('pending', 'awaiting_otp');

  -- v_pending (not-yet-settled gateway credits) is reported as-is — it has
  -- a specific UI meaning ("X still settling") that in-flight withdrawals
  -- aren't part of. Only "available" needs to additionally exclude money
  -- that's already committed to an outstanding withdrawal.
  v_pending := least(coalesce(v_pending, 0), v_wallet.balance);

  return query select
    v_wallet.balance,
    greatest(0, v_wallet.balance - v_pending - v_in_flight_withdrawals),
    v_pending,
    v_wallet.currency,
    case when v_pending > 0 then v_next_settlement else null end;
end;
$$;

grant execute on function public.get_salon_wallet_availability(uuid) to authenticated;

-- A quoted fee snapshot cannot be altered after money is reserved.
create or replace function public.guard_withdrawal_fee_snapshot()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.fee_version is not null then
    if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
    if row(new.amount, new.currency, new.tenant_id, new.salon_wallet_id, new.payout_destination_id,
           new.transfer_fee, new.stamp_duty, new.fee_version, new.paystack_reference)
       is distinct from
       row(old.amount, old.currency, old.tenant_id, old.salon_wallet_id, old.payout_destination_id,
           old.transfer_fee, old.stamp_duty, old.fee_version, old.paystack_reference) then
      raise exception 'Withdrawal fee snapshot is immutable';
    end if;
  elsif new.fee_version is not null then raise exception 'Cannot add fees to an existing withdrawal';
  end if;
  return new;
end;
$$;
create trigger guard_withdrawal_fee_snapshot before update on public.salon_withdrawals
for each row execute function public.guard_withdrawal_fee_snapshot();
