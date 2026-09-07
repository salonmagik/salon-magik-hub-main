-- get_salon_wallet_availability only ever subtracted not-yet-settled
-- gateway credits from the raw balance — it never accounted for a
-- withdrawal that's already in flight (pending, or stuck awaiting OTP
-- finalization on our side). A withdrawal only debits salon_wallets.balance
-- once Paystack's transfer.success webhook lands, so the full balance still
-- looks "available" while one is outstanding — and since the duplicate-
-- request check in process-salon-withdrawal only blocks a second request to
-- the SAME payout destination, a tenant with more than one destination
-- could request the same money twice before either transfer resolves.
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

  select coalesce(sum(amount), 0)
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
