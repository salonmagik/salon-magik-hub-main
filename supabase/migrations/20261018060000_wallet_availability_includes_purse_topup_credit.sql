-- get_salon_wallet_availability() holds back gateway-sourced salon wallet
-- credits until the next business day, but its entry_type allowlist
-- ('salon_purse_credit_booking', 'salon_purse_credit_invoice',
-- 'salon_purse_topup') predates 'salon_purse_credit_purse_topup' (added in
-- 20261018030000_salon_purse_credit_purse_topup_entry_type.sql for the
-- customer-purse-topup salon-wallet-credit fix). Money entering the salon
-- wallet this way is just as much real, unsettled Paystack money as a
-- booking payment -- without this, a customer topping up their store
-- credit made the equivalent cash instantly withdrawable by the salon
-- before Paystack had actually settled it, exactly the fraud-adjacent gap
-- the holdback exists to prevent.
create or replace function public.get_salon_wallet_availability(
  p_tenant_id uuid,
  p_location_id uuid default null
)
returns table (balance numeric, available numeric, pending numeric, currency text, next_settlement_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet record;
  v_pending numeric := 0;
  v_next_settlement timestamptz;
  v_in_flight numeric := 0;
begin
  if auth.role() <> 'service_role' and not exists (
    select 1 from public.user_roles where tenant_id = p_tenant_id and user_id = auth.uid() and is_active
  ) then raise exception 'Not authorized to view this wallet'; end if;

  select * into v_wallet from public.salon_wallets
  where tenant_id = p_tenant_id and location_id is not distinct from p_location_id;
  if v_wallet is null then
    return query select 0::numeric, 0::numeric, 0::numeric,
      (select currency from public.tenants where id = p_tenant_id), null::timestamptz;
    return;
  end if;

  select coalesce(sum(le.amount) filter (where le.created_at + interval '1 day'
      + case extract(dow from le.created_at + interval '1 day')::int
          when 6 then interval '2 days' when 0 then interval '1 day' else interval '0 days' end > now()), 0),
    min(le.created_at + interval '1 day'
      + case extract(dow from le.created_at + interval '1 day')::int
          when 6 then interval '2 days' when 0 then interval '1 day' else interval '0 days' end)
      filter (where le.created_at + interval '1 day'
      + case extract(dow from le.created_at + interval '1 day')::int
          when 6 then interval '2 days' when 0 then interval '1 day' else interval '0 days' end > now())
  into v_pending, v_next_settlement
  from public.wallet_ledger_entries le
  where le.wallet_type = 'salon' and le.wallet_id = v_wallet.id
    and le.entry_type in (
      'salon_purse_credit_booking', 'salon_purse_credit_invoice', 'salon_purse_topup',
      'salon_purse_credit_purse_topup'
    );

  select coalesce(sum(greatest(0, amount + transfer_fee + stamp_duty - wallet_debited)), 0)
  into v_in_flight from public.salon_withdrawals
  where tenant_id = p_tenant_id and salon_wallet_id = v_wallet.id
    and status in ('pending', 'awaiting_otp');

  v_pending := least(coalesce(v_pending, 0), v_wallet.balance);
  return query select v_wallet.balance,
    greatest(0, v_wallet.balance - v_pending - v_in_flight), v_pending,
    v_wallet.currency, case when v_pending > 0 then v_next_settlement else null end;
end;
$$;

grant execute on function public.get_salon_wallet_availability(uuid, uuid) to authenticated;
