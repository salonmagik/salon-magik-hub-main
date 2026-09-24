-- A payout destination could only ever be pinned to one branch (or none,
-- meaning "default" — implicitly covering every branch without its own
-- destination). Replacing that with an explicit set of branches: a
-- destination now lists every branch it serves in location_ids, and there
-- is no more implicit fallback — a branch with no destination in any
-- account's location_ids simply has none, until an owner picks one (either
-- from the Accounts tab, or when nudged while withdrawing — see
-- WithdrawalDialog). is_default is unchanged: it still governs which
-- destination serves the General (central/unassigned) wallet.
alter table public.salon_payout_destinations
  add column location_ids uuid[] not null default '{}';

-- Preserve every existing explicit single-branch pin exactly. A tenant's
-- default destination that was implicitly covering other branches is
-- intentionally NOT backfilled with those branches — that implicit
-- coverage is exactly what's being removed. Those branches will be
-- nudged to pick an account (persisted as an explicit pin) the next time
-- someone withdraws from them.
update public.salon_payout_destinations
set location_ids = array[location_id]
where location_id is not null;

create index if not exists salon_payout_destinations_location_ids_idx
  on public.salon_payout_destinations using gin (location_ids);

-- Withdrawal safety check: a destination usable for the General wallet
-- (new.location_id is null) must be the tenant's default; a destination
-- usable for a branch withdrawal must explicitly list that branch. No more
-- "location_id is null" implicit-fallback branch.
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
  select * into strict v_wallet from public.salon_wallets where id = new.salon_wallet_id for update;
  select * into strict v_destination from public.salon_payout_destinations where id = new.payout_destination_id;
  if v_wallet.tenant_id <> new.tenant_id or v_destination.tenant_id <> new.tenant_id
     or v_wallet.currency <> new.currency or v_destination.currency <> new.currency
     or v_wallet.location_id is distinct from new.location_id
     or (new.location_id is null and not coalesce(v_destination.is_default, false))
     or (new.location_id is not null and not (new.location_id = any(v_destination.location_ids))) then
    raise exception 'Withdrawal wallet, destination, and location do not match';
  end if;
  if new.fee_version <> 'paystack-2026-09-16' or new.status <> 'pending'
     or new.wallet_debited <> 0 or new.fee_outcome is not null then
    raise exception 'Invalid withdrawal fee policy or initial state';
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
  select available into v_available from public.get_salon_wallet_availability(new.tenant_id, new.location_id);
  if v_available is null or v_available < new.amount + new.transfer_fee + new.stamp_duty then
    raise exception 'Insufficient cleared funds for withdrawal and fees';
  end if;
  return new;
end;
$$;

drop index if exists public.idx_salon_payout_destinations_location_id;
alter table public.salon_payout_destinations
  drop constraint if exists salon_payout_destinations_location_id_fkey,
  drop column if exists location_id;
