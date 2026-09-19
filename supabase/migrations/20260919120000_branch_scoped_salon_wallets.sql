-- Branch-scoped salon wallets.
--
-- A tenant keeps a central wallet for legacy/unassigned funds. When a tenant
-- has multiple locations, booking and invoice credits are attributed to the
-- appointment/invoice location and use that branch wallet. Withdrawals must
-- name the wallet scope explicitly; they can never spend another branch's
-- balance.

alter table public.salon_wallets
  add column if not exists location_id uuid references public.locations(id) on delete set null;

alter table public.wallet_ledger_entries
  add column if not exists location_id uuid references public.locations(id) on delete set null;

alter table public.salon_withdrawals
  add column if not exists location_id uuid references public.locations(id) on delete set null;

alter table public.salon_wallets
  drop constraint if exists salon_wallets_tenant_id_key;

-- The original tenant trigger named the removed tenant-wide unique constraint
-- in its ON CONFLICT clause. Keep tenant creation idempotent with the new
-- partial central-wallet index instead.
create or replace function public.create_salon_wallet_for_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.salon_wallets (tenant_id, currency, balance)
  values (new.id, new.currency, 0)
  on conflict do nothing;
  return new;
end;
$$;

create unique index if not exists salon_wallets_tenant_central_unique
  on public.salon_wallets (tenant_id)
  where location_id is null;

create unique index if not exists salon_wallets_tenant_location_unique
  on public.salon_wallets (tenant_id, location_id)
  where location_id is not null;

create index if not exists salon_wallets_location_idx
  on public.salon_wallets (tenant_id, location_id);

create index if not exists wallet_ledger_entries_location_idx
  on public.wallet_ledger_entries (tenant_id, location_id, created_at desc);

create index if not exists salon_withdrawals_location_idx
  on public.salon_withdrawals (tenant_id, location_id, requested_at desc);

-- Legacy webhook reconciliation identifies the exact wallet through the
-- withdrawal row. It must never select an arbitrary wallet once a chain has
-- more than one.
create or replace function public.debit_salon_purse_for_withdrawal(
  p_tenant_id uuid,
  p_withdrawal_id uuid,
  p_amount numeric,
  p_currency text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_withdrawal public.salon_withdrawals%rowtype;
  v_wallet public.salon_wallets%rowtype;
  v_existing uuid;
  v_entry uuid;
begin
  select id into v_existing from public.wallet_ledger_entries
  where tenant_id = p_tenant_id and idempotency_key = p_idempotency_key limit 1;
  if v_existing is not null then return v_existing; end if;
  select * into v_withdrawal from public.salon_withdrawals
  where id = p_withdrawal_id and tenant_id = p_tenant_id for update;
  if v_withdrawal.id is null then raise exception 'Withdrawal not found'; end if;
  select * into v_wallet from public.salon_wallets where id = v_withdrawal.salon_wallet_id for update;
  if v_wallet.id is null or v_wallet.tenant_id <> p_tenant_id then raise exception 'Salon wallet not found'; end if;
  if v_wallet.currency <> p_currency then raise exception 'Currency mismatch'; end if;
  if v_wallet.balance < p_amount then raise exception 'Insufficient wallet balance'; end if;
  update public.salon_wallets set balance = balance - p_amount, updated_at = now() where id = v_wallet.id;
  insert into public.wallet_ledger_entries (tenant_id, location_id, wallet_type, wallet_id, entry_type, currency,
    amount, balance_before, balance_after, reference_type, reference_id, idempotency_key, created_at)
  values (p_tenant_id, v_wallet.location_id, 'salon', v_wallet.id, 'salon_purse_withdrawal', p_currency,
    -p_amount, v_wallet.balance, v_wallet.balance - p_amount, 'withdrawal', p_withdrawal_id, p_idempotency_key, now())
  returning id into v_entry;
  return v_entry;
end;
$$;

-- Keep all wallet ledger writes branch-labelled, including older reconciliation
-- functions that only know the wallet id.
create or replace function public.stamp_wallet_ledger_location()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.location_id is null then
    select sw.location_id into new.location_id from public.salon_wallets sw where sw.id = new.wallet_id and new.wallet_type = 'salon';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_stamp_wallet_ledger_location on public.wallet_ledger_entries;
create trigger trg_stamp_wallet_ledger_location
before insert on public.wallet_ledger_entries
for each row execute function public.stamp_wallet_ledger_location();

-- Resolve a branch only for chain tenants. Single-location tenants continue to
-- use their existing central wallet, preserving the current product behavior.
create or replace function public.resolve_salon_wallet_location(
  p_tenant_id uuid,
  p_reference_type text,
  p_reference_id uuid,
  p_requested_location_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_location_id uuid := p_requested_location_id;
  v_location_count integer;
  v_inferred_location_id uuid;
begin
  if v_location_id is not null then
    if not exists (
      select 1 from public.locations
      where id = v_location_id and tenant_id = p_tenant_id
    ) then
      raise exception 'Location does not belong to tenant';
    end if;
    return v_location_id;
  end if;

  select count(*) into v_location_count
  from public.locations
  where tenant_id = p_tenant_id;

  if v_location_count <= 1 then
    return null;
  end if;

  if p_reference_type = 'appointment' then
    select location_id into v_inferred_location_id
    from public.appointments
    where id = p_reference_id and tenant_id = p_tenant_id;
  elsif p_reference_type = 'invoice' then
    select a.location_id into v_inferred_location_id
    from public.invoices i
    left join public.appointments a on a.id = i.appointment_id
    where i.id = p_reference_id and i.tenant_id = p_tenant_id;
  end if;

  if v_inferred_location_id is not null then
    return v_inferred_location_id;
  end if;

  -- Top-ups and other tenant-wide credits stay in the central wallet.
  return null;
end;
$$;

revoke all on function public.resolve_salon_wallet_location(uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.resolve_salon_wallet_location(uuid, text, uuid, uuid) to service_role;

drop function if exists public.credit_salon_purse(uuid, public.wallet_entry_type, text, uuid, numeric, text, text, text);

create or replace function public.credit_salon_purse(
  p_tenant_id uuid,
  p_entry_type public.wallet_entry_type,
  p_reference_type text,
  p_reference_id uuid,
  p_amount numeric(12, 2),
  p_currency text,
  p_idempotency_key text,
  p_gateway_reference text default null,
  p_location_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet_id uuid;
  v_wallet_currency text;
  v_balance_before numeric(12, 2);
  v_balance_after numeric(12, 2);
  v_ledger_entry_id uuid;
  v_existing_entry_id uuid;
  v_location_id uuid;
begin
  select id into v_existing_entry_id
  from public.wallet_ledger_entries
  where tenant_id = p_tenant_id and idempotency_key = p_idempotency_key
  limit 1;
  if v_existing_entry_id is not null then return v_existing_entry_id; end if;

  v_location_id := public.resolve_salon_wallet_location(
    p_tenant_id, p_reference_type, p_reference_id, p_location_id
  );

  select id, currency, balance into v_wallet_id, v_wallet_currency, v_balance_before
  from public.salon_wallets
  where tenant_id = p_tenant_id
    and location_id is not distinct from v_location_id
  for update;

  if v_wallet_id is null and v_location_id is not null then
    insert into public.salon_wallets (tenant_id, location_id, currency, balance)
    values (p_tenant_id, v_location_id, p_currency, 0)
    on conflict do nothing;
    select id, currency, balance into v_wallet_id, v_wallet_currency, v_balance_before
    from public.salon_wallets
    where tenant_id = p_tenant_id and location_id = v_location_id
    for update;
  end if;

  if v_wallet_id is null then
    raise exception 'Salon wallet not found for tenant % and location %', p_tenant_id, v_location_id;
  end if;
  if v_wallet_currency <> p_currency then
    raise exception 'Currency mismatch: salon wallet currency is % but received %', v_wallet_currency, p_currency;
  end if;

  v_balance_after := v_balance_before + p_amount;
  update public.salon_wallets
  set balance = v_balance_after, updated_at = now()
  where id = v_wallet_id;

  insert into public.wallet_ledger_entries (
    tenant_id, location_id, wallet_type, wallet_id, entry_type, currency, amount,
    balance_before, balance_after, reference_type, reference_id, gateway,
    gateway_reference, idempotency_key, created_at
  ) values (
    p_tenant_id, v_location_id, 'salon', v_wallet_id, p_entry_type, p_currency,
    p_amount, v_balance_before, v_balance_after, p_reference_type, p_reference_id,
    case when p_gateway_reference is not null then 'paystack' else null end,
    p_gateway_reference, p_idempotency_key, now()
  ) returning id into v_ledger_entry_id;

  return v_ledger_entry_id;
end;
$$;

comment on function public.credit_salon_purse is
  'Credits a central or branch salon wallet. Chain booking/invoice credits are attributed to their location.';

drop function if exists public.debit_salon_purse(uuid, public.wallet_entry_type, text, uuid, numeric, text, text);

create or replace function public.debit_salon_purse(
  p_tenant_id uuid,
  p_entry_type public.wallet_entry_type,
  p_reference_type text,
  p_reference_id uuid,
  p_amount numeric(12, 2),
  p_currency text,
  p_idempotency_key text,
  p_location_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet_id uuid;
  v_wallet_currency text;
  v_balance_before numeric(12, 2);
  v_balance_after numeric(12, 2);
  v_ledger_entry_id uuid;
  v_existing_entry_id uuid;
begin
  select id into v_existing_entry_id
  from public.wallet_ledger_entries
  where tenant_id = p_tenant_id and idempotency_key = p_idempotency_key
  limit 1;
  if v_existing_entry_id is not null then return v_existing_entry_id; end if;

  if p_location_id is not null and not exists (
    select 1 from public.locations where id = p_location_id and tenant_id = p_tenant_id
  ) then
    raise exception 'Location does not belong to tenant';
  end if;

  select id, currency, balance into v_wallet_id, v_wallet_currency, v_balance_before
  from public.salon_wallets
  where tenant_id = p_tenant_id and location_id is not distinct from p_location_id
  for update;
  if v_wallet_id is null then raise exception 'Salon wallet not found for tenant %', p_tenant_id; end if;
  if v_wallet_currency <> p_currency then
    raise exception 'Currency mismatch: salon wallet currency is % but received %', v_wallet_currency, p_currency;
  end if;
  if v_balance_before < p_amount then
    raise exception 'Insufficient wallet balance. Available: %, Required: %', v_balance_before, p_amount;
  end if;

  v_balance_after := v_balance_before - p_amount;
  update public.salon_wallets set balance = v_balance_after, updated_at = now() where id = v_wallet_id;
  insert into public.wallet_ledger_entries (
    tenant_id, location_id, wallet_type, wallet_id, entry_type, currency, amount,
    balance_before, balance_after, reference_type, reference_id, idempotency_key, created_at
  ) values (
    p_tenant_id, p_location_id, 'salon', v_wallet_id, p_entry_type, p_currency,
    -p_amount, v_balance_before, v_balance_after, p_reference_type, p_reference_id,
    p_idempotency_key, now()
  ) returning id into v_ledger_entry_id;
  return v_ledger_entry_id;
end;
$$;

revoke all on function public.debit_salon_purse(uuid, public.wallet_entry_type, text, uuid, numeric, text, text, uuid) from public, anon, authenticated;
grant execute on function public.debit_salon_purse(uuid, public.wallet_entry_type, text, uuid, numeric, text, text, uuid) to service_role;

drop function if exists public.get_salon_wallet_availability(uuid);

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
    and le.entry_type in ('salon_purse_credit_booking', 'salon_purse_credit_invoice', 'salon_purse_topup');

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

-- Ensure a withdrawal cannot cross wallet scopes or send a branch withdrawal
-- to a different branch's destination.
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
     or (v_destination.location_id is not null and v_destination.location_id is distinct from new.location_id) then
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

create or replace function public.guard_withdrawal_fee_snapshot()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.fee_version is not null then
    if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
    if row(new.amount, new.currency, new.tenant_id, new.salon_wallet_id, new.payout_destination_id,
           new.location_id, new.transfer_fee, new.stamp_duty, new.fee_version, new.paystack_reference)
       is distinct from
       row(old.amount, old.currency, old.tenant_id, old.salon_wallet_id, old.payout_destination_id,
           old.location_id, old.transfer_fee, old.stamp_duty, old.fee_version, old.paystack_reference) then
      raise exception 'Withdrawal fee snapshot is immutable';
    end if;
  elsif new.fee_version is not null then raise exception 'Cannot add fees to an existing withdrawal'; end if;
  return new;
end;
$$;

comment on column public.salon_wallets.location_id is
  'Null is the central/unassigned wallet; populated values are branch wallets for chain tenants.';
