-- Customer value, voucher claiming, balance reservations, and atomic refunds.
-- Keeps the existing customer_purses table as the cached spendable total while
-- introducing source-aware credit grants and an immutable ledger.

alter table public.transactions
  add column if not exists original_transaction_id uuid references public.transactions(id) on delete restrict,
  add column if not exists refund_request_id uuid references public.refund_requests(id) on delete set null;

alter table public.refund_requests
  add column if not exists processed_transaction_id uuid references public.transactions(id) on delete set null;

create index if not exists idx_transactions_original_transaction
  on public.transactions (original_transaction_id)
  where original_transaction_id is not null;

create index if not exists idx_refund_requests_transaction_status
  on public.refund_requests (transaction_id, status);

create table if not exists public.voucher_redemptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  voucher_id uuid not null references public.vouchers(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  appointment_id uuid references public.appointments(id) on delete set null,
  event_type text not null check (event_type in ('claim', 'redeem', 'release')),
  amount numeric(12,2) not null default 0 check (amount >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_voucher_redemptions_voucher
  on public.voucher_redemptions (voucher_id, created_at desc);

alter table public.vouchers
  add column if not exists voucher_type text not null default 'gift'
    check (voucher_type in ('gift', 'promotion')),
  add column if not exists access_type text not null default 'public'
    check (access_type in ('public', 'private')),
  add column if not exists discount_type text not null default 'fixed'
    check (discount_type in ('fixed', 'percentage')),
  add column if not exists discount_value numeric(12,2),
  add column if not exists starts_at timestamptz,
  add column if not exists max_redemptions integer,
  add column if not exists per_customer_limit integer not null default 1,
  add column if not exists minimum_spend numeric(12,2) not null default 0,
  add column if not exists claimed_by_customer_id uuid references public.customers(id) on delete set null,
  add column if not exists claimed_at timestamptz;

update public.vouchers
set discount_value = coalesce(discount_value, amount)
where discount_value is null;

alter table public.vouchers
  alter column discount_value set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'vouchers_customer_value_rules'
      and conrelid = 'public.vouchers'::regclass
  ) then
    alter table public.vouchers
      add constraint vouchers_customer_value_rules check (
        discount_value > 0
        and (discount_type <> 'percentage' or discount_value <= 100)
        and minimum_spend >= 0
        and (max_redemptions is null or max_redemptions > 0)
        and per_customer_limit > 0
        and (access_type <> 'private' or target_customer_id is not null)
        and (voucher_type <> 'gift' or discount_type = 'fixed')
      );
  end if;
end
$$;

create table if not exists public.customer_credit_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  currency text not null,
  source_type text not null
    check (source_type in ('paid_topup', 'refund', 'voucher', 'adjustment', 'legacy')),
  source_id uuid,
  original_amount numeric(12,2) not null check (original_amount > 0),
  remaining_amount numeric(12,2) not null check (remaining_amount >= 0),
  reserved_amount numeric(12,2) not null default 0 check (reserved_amount >= 0),
  is_cashable boolean not null default false,
  expires_at timestamptz,
  status text not null default 'active'
    check (status in ('active', 'exhausted', 'expired', 'voided')),
  metadata jsonb not null default '{}'::jsonb,
  created_by_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_credit_grants_reserved_check
    check (reserved_amount <= remaining_amount)
);

create unique index if not exists idx_customer_credit_grants_source
  on public.customer_credit_grants (tenant_id, source_type, source_id)
  where source_id is not null and source_type in ('refund', 'voucher');

create index if not exists idx_customer_credit_grants_available
  on public.customer_credit_grants (tenant_id, customer_id, expires_at, created_at)
  where status = 'active';

create table if not exists public.customer_credit_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  status text not null default 'reserved'
    check (status in ('reserved', 'consumed', 'released')),
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  released_at timestamptz,
  unique (appointment_id)
);

create table if not exists public.customer_credit_reservation_allocations (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.customer_credit_reservations(id) on delete cascade,
  grant_id uuid not null references public.customer_credit_grants(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  unique (reservation_id, grant_id)
);

create table if not exists public.customer_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  grant_id uuid references public.customer_credit_grants(id) on delete set null,
  reservation_id uuid references public.customer_credit_reservations(id) on delete set null,
  entry_type text not null check (
    entry_type in (
      'paid_topup', 'refund_credit', 'voucher_claim', 'adjustment',
      'booking_reservation', 'booking_redemption', 'reservation_release',
      'refund_reversal', 'migration'
    )
  ),
  amount numeric(12,2) not null,
  balance_after numeric(12,2) not null,
  reference_type text,
  reference_id uuid,
  description text,
  created_by_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_credit_ledger_customer
  on public.customer_credit_ledger (tenant_id, customer_id, created_at desc);

-- Preserve every existing purse balance as a source-aware legacy grant.
insert into public.customer_credit_grants (
  tenant_id,
  customer_id,
  currency,
  source_type,
  original_amount,
  remaining_amount,
  is_cashable,
  metadata
)
select
  cp.tenant_id,
  cp.customer_id,
  cp.currency,
  'legacy',
  cp.balance,
  cp.balance,
  true,
  jsonb_build_object('migration', 'customer_purses')
from public.customer_purses cp
where cp.balance > 0
  and not exists (
    select 1
    from public.customer_credit_grants cg
    where cg.tenant_id = cp.tenant_id
      and cg.customer_id = cp.customer_id
      and cg.source_type = 'legacy'
      and cg.metadata ->> 'migration' = 'customer_purses'
  );

create or replace function public.customer_credit_available(
  p_tenant_id uuid,
  p_customer_id uuid
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(remaining_amount - reserved_amount), 0)
  from public.customer_credit_grants
  where tenant_id = p_tenant_id
    and customer_id = p_customer_id
    and status = 'active'
    and (expires_at is null or expires_at > now());
$$;

create or replace function public.sync_customer_purse_balance(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_currency text
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric(12,2);
begin
  select coalesce(sum(remaining_amount), 0)
  into v_balance
  from public.customer_credit_grants
  where tenant_id = p_tenant_id
    and customer_id = p_customer_id
    and status in ('active', 'exhausted')
    and (expires_at is null or expires_at > now());

  insert into public.customer_purses (tenant_id, customer_id, currency, balance)
  values (p_tenant_id, p_customer_id, p_currency, v_balance)
  on conflict (customer_id, tenant_id)
  do update set
    balance = excluded.balance,
    currency = excluded.currency,
    updated_at = now();

  return v_balance;
end;
$$;

create or replace function public.credit_customer_balance(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_amount numeric,
  p_currency text,
  p_source_type text,
  p_source_id uuid default null,
  p_is_cashable boolean default false,
  p_expires_at timestamptz default null,
  p_description text default null,
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_grant_id uuid;
  v_balance numeric(12,2);
  v_entry_type text;
  v_customer_owner uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Credit amount must be greater than zero';
  end if;

  if p_source_type not in ('paid_topup', 'refund', 'voucher', 'adjustment', 'legacy') then
    raise exception 'Unsupported credit source';
  end if;

  select user_id into v_customer_owner
  from public.customers
  where id = p_customer_id and tenant_id = p_tenant_id;

  if auth.role() <> 'service_role'
     and not exists (
       select 1 from public.user_roles
       where tenant_id = p_tenant_id
         and user_id = v_user_id
         and is_active = true
     )
     and v_customer_owner is distinct from v_user_id then
    raise exception 'Not authorized to credit this customer balance';
  end if;

  if p_source_type = 'adjustment'
     and auth.role() <> 'service_role'
     and not exists (
       select 1 from public.user_roles
       where tenant_id = p_tenant_id
         and user_id = v_user_id
         and role in ('owner', 'manager')
         and is_active = true
     ) then
    raise exception 'Only owners and managers can adjust customer balances';
  end if;

  if p_idempotency_key is not null then
    select id into v_grant_id
    from public.customer_credit_grants
    where tenant_id = p_tenant_id
      and metadata ->> 'idempotency_key' = p_idempotency_key
    limit 1;
    if v_grant_id is not null then
      return v_grant_id;
    end if;
  end if;

  insert into public.customer_credit_grants (
    tenant_id, customer_id, currency, source_type, source_id,
    original_amount, remaining_amount, is_cashable, expires_at,
    metadata, created_by_id
  )
  values (
    p_tenant_id, p_customer_id, p_currency, p_source_type, p_source_id,
    p_amount, p_amount, p_is_cashable, p_expires_at,
    coalesce(p_metadata, '{}'::jsonb) ||
      case when p_idempotency_key is null then '{}'::jsonb
           else jsonb_build_object('idempotency_key', p_idempotency_key) end,
    v_user_id
  )
  returning id into v_grant_id;

  v_balance := public.sync_customer_purse_balance(p_tenant_id, p_customer_id, p_currency);
  v_entry_type := case p_source_type
    when 'paid_topup' then 'paid_topup'
    when 'refund' then 'refund_credit'
    when 'voucher' then 'voucher_claim'
    when 'adjustment' then 'adjustment'
    else 'migration'
  end;

  insert into public.customer_credit_ledger (
    tenant_id, customer_id, grant_id, entry_type, amount, balance_after,
    reference_type, reference_id, description, created_by_id, metadata
  )
  values (
    p_tenant_id, p_customer_id, v_grant_id, v_entry_type, p_amount, v_balance,
    p_source_type, p_source_id, p_description, v_user_id, coalesce(p_metadata, '{}'::jsonb)
  );

  return v_grant_id;
end;
$$;

create or replace function public.adjust_customer_balance(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_amount numeric,
  p_currency text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.user_roles
    where tenant_id = p_tenant_id
      and user_id = auth.uid()
      and role in ('owner', 'manager')
      and is_active = true
  ) then
    raise exception 'Only owners and managers can add salon credit';
  end if;

  if nullif(trim(p_reason), '') is null then
    raise exception 'A reason is required';
  end if;

  return public.credit_customer_balance(
    p_tenant_id,
    p_customer_id,
    p_amount,
    p_currency,
    'adjustment',
    null,
    false,
    null,
    trim(p_reason),
    null,
    jsonb_build_object('reason', trim(p_reason))
  );
end;
$$;

-- Existing payment webhooks use this signature. Paid top-ups now create a
-- source-aware cashable grant while preserving the previous API.
create or replace function public.credit_customer_purse(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_amount numeric,
  p_currency text,
  p_idempotency_key text,
  p_gateway_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grant_id uuid;
  v_ledger_id uuid;
  v_purse_id uuid;
  v_balance numeric(12,2);
begin
  select id into v_ledger_id
  from public.wallet_ledger_entries
  where tenant_id = p_tenant_id
    and idempotency_key = p_idempotency_key
  limit 1;
  if v_ledger_id is not null then return v_ledger_id; end if;

  v_grant_id := public.credit_customer_balance(
    p_tenant_id,
    p_customer_id,
    p_amount,
    p_currency,
    'paid_topup',
    null,
    true,
    null,
    'Customer balance top-up',
    p_idempotency_key,
    jsonb_build_object('gateway_reference', p_gateway_reference)
  );

  select id, balance into v_purse_id, v_balance
  from public.customer_purses
  where tenant_id = p_tenant_id and customer_id = p_customer_id;

  insert into public.wallet_ledger_entries (
    tenant_id, wallet_type, wallet_id, entry_type, currency, amount,
    balance_before, balance_after, reference_type, reference_id,
    gateway, gateway_reference, idempotency_key
  )
  values (
    p_tenant_id, 'customer', v_purse_id, 'customer_purse_topup',
    p_currency, p_amount, greatest(0, v_balance - p_amount), v_balance,
    'topup', v_grant_id,
    case when p_gateway_reference is null then null else 'paystack' end,
    p_gateway_reference, p_idempotency_key
  )
  returning id into v_ledger_id;

  return v_ledger_id;
end;
$$;

create or replace function public.claim_voucher_to_balance(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_code text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_voucher public.vouchers%rowtype;
  v_user_id uuid := auth.uid();
  v_customer_owner uuid;
  v_grant_id uuid;
  v_currency text;
begin
  select user_id into v_customer_owner
  from public.customers
  where id = p_customer_id and tenant_id = p_tenant_id;

  if auth.role() <> 'service_role'
     and v_customer_owner is distinct from v_user_id
     and not exists (
       select 1 from public.user_roles
       where tenant_id = p_tenant_id and user_id = v_user_id and is_active = true
     ) then
    raise exception 'Not authorized to claim this voucher';
  end if;

  select * into v_voucher
  from public.vouchers
  where tenant_id = p_tenant_id
    and upper(code) = upper(trim(p_code))
    and deleted_at is null
  for update;

  if v_voucher.id is null then
    raise exception 'Voucher not found';
  end if;
  if v_voucher.voucher_type <> 'gift' or v_voucher.discount_type <> 'fixed' then
    raise exception 'Promotional vouchers are applied at checkout and cannot be claimed as balance';
  end if;
  if v_voucher.status <> 'active' or v_voucher.balance <= 0 then
    raise exception 'Voucher is no longer available';
  end if;
  if v_voucher.starts_at is not null and v_voucher.starts_at > now() then
    raise exception 'Voucher is not active yet';
  end if;
  if v_voucher.expires_at is not null and v_voucher.expires_at <= now() then
    raise exception 'Voucher has expired';
  end if;
  if v_voucher.access_type = 'private'
     and coalesce(v_voucher.target_customer_id, v_voucher.claimed_by_customer_id) is distinct from p_customer_id then
    raise exception 'This private voucher belongs to another customer';
  end if;
  if v_voucher.claimed_by_customer_id is not null
     and v_voucher.claimed_by_customer_id <> p_customer_id then
    raise exception 'Voucher has already been claimed';
  end if;

  select currency into v_currency from public.tenants where id = p_tenant_id;

  v_grant_id := public.credit_customer_balance(
    p_tenant_id,
    p_customer_id,
    v_voucher.balance,
    v_currency,
    'voucher',
    v_voucher.id,
    false,
    v_voucher.expires_at,
    'Gift voucher ' || v_voucher.code,
    'voucher_claim_' || v_voucher.id::text,
    jsonb_build_object('voucher_code', v_voucher.code)
  );

  update public.vouchers
  set claimed_by_customer_id = p_customer_id,
      redeemed_by_customer_id = p_customer_id,
      claimed_at = coalesce(claimed_at, now()),
      status = 'redeemed',
      updated_at = now()
  where id = v_voucher.id;

  insert into public.voucher_redemptions (
    tenant_id, voucher_id, customer_id, event_type, amount
  )
  values (
    p_tenant_id, v_voucher.id, p_customer_id, 'claim', v_voucher.balance
  );

  return v_grant_id;
end;
$$;

create or replace function public.claim_voucher_for_current_user(
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_name text;
  v_tenant_id uuid;
  v_customer_id uuid;
  v_target_customer_id uuid;
  v_grant_id uuid;
  v_match_count integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_code), '') is null then raise exception 'Enter a voucher code'; end if;

  select count(*)
  into v_match_count
  from public.vouchers
  where upper(code) = upper(trim(p_code))
    and deleted_at is null
    and status in ('active', 'redeemed');

  if v_match_count = 0 then raise exception 'Voucher not found'; end if;
  if v_match_count > 1 then
    raise exception 'This code is used by more than one salon. Claim it during booking with the issuing salon.';
  end if;

  select tenant_id, target_customer_id
  into v_tenant_id, v_target_customer_id
  from public.vouchers
  where upper(code) = upper(trim(p_code))
    and deleted_at is null
    and status in ('active', 'redeemed')
  limit 1;

  select email, coalesce(raw_user_meta_data ->> 'full_name', split_part(email, '@', 1))
  into v_email, v_name
  from auth.users
  where id = v_user_id;

  select id into v_customer_id
  from public.customers
  where tenant_id = v_tenant_id and user_id = v_user_id
  order by created_at
  limit 1;

  if v_customer_id is null and v_target_customer_id is not null then
    select id into v_customer_id
    from public.customers
    where id = v_target_customer_id
      and tenant_id = v_tenant_id
      and (user_id = v_user_id or (user_id is null and lower(email) = lower(v_email)))
    limit 1;
  end if;

  if v_customer_id is null then
    select id into v_customer_id
    from public.customers
    where tenant_id = v_tenant_id
      and lower(email) = lower(v_email)
      and (user_id is null or user_id = v_user_id)
    order by created_at
    limit 1;
  end if;

  if v_customer_id is null then
    if v_target_customer_id is not null then
      raise exception 'This private voucher belongs to another customer';
    end if;
    insert into public.customers (tenant_id, user_id, full_name, email)
    values (v_tenant_id, v_user_id, coalesce(nullif(trim(v_name), ''), 'Customer'), lower(v_email))
    returning id into v_customer_id;
  else
    update public.customers
    set user_id = v_user_id, updated_at = now()
    where id = v_customer_id and user_id is null;
  end if;

  v_grant_id := public.claim_voucher_to_balance(v_tenant_id, v_customer_id, p_code);

  return jsonb_build_object(
    'tenant_id', v_tenant_id,
    'customer_id', v_customer_id,
    'grant_id', v_grant_id
  );
end;
$$;

create or replace function public.reserve_customer_balance(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_appointment_id uuid,
  p_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation_id uuid;
  v_remaining numeric(12,2) := p_amount;
  v_take numeric(12,2);
  v_grant record;
  v_currency text;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Reservation amount must be greater than zero';
  end if;

  if not exists (
    select 1 from public.appointments
    where id = p_appointment_id
      and tenant_id = p_tenant_id
      and customer_id = p_customer_id
  ) then
    raise exception 'Appointment does not belong to this customer';
  end if;

  select id into v_reservation_id
  from public.customer_credit_reservations
  where appointment_id = p_appointment_id;
  if v_reservation_id is not null then
    return v_reservation_id;
  end if;

  if public.customer_credit_available(p_tenant_id, p_customer_id) < p_amount then
    raise exception 'Insufficient available balance';
  end if;

  insert into public.customer_credit_reservations (
    tenant_id, customer_id, appointment_id, amount
  )
  values (p_tenant_id, p_customer_id, p_appointment_id, p_amount)
  returning id into v_reservation_id;

  for v_grant in
    select *
    from public.customer_credit_grants
    where tenant_id = p_tenant_id
      and customer_id = p_customer_id
      and status = 'active'
      and remaining_amount > reserved_amount
      and (expires_at is null or expires_at > now())
    order by
      is_cashable asc,
      expires_at asc nulls last,
      created_at asc
    for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_remaining, v_grant.remaining_amount - v_grant.reserved_amount);

    update public.customer_credit_grants
    set reserved_amount = reserved_amount + v_take,
        updated_at = now()
    where id = v_grant.id;

    insert into public.customer_credit_reservation_allocations (
      reservation_id, grant_id, amount
    )
    values (v_reservation_id, v_grant.id, v_take);

    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    raise exception 'Unable to reserve the requested balance';
  end if;

  select currency into v_currency
  from public.customer_purses
  where tenant_id = p_tenant_id and customer_id = p_customer_id;

  insert into public.customer_credit_ledger (
    tenant_id, customer_id, reservation_id, entry_type, amount, balance_after,
    reference_type, reference_id, description
  )
  values (
    p_tenant_id, p_customer_id, v_reservation_id, 'booking_reservation', 0,
    public.customer_credit_available(p_tenant_id, p_customer_id),
    'appointment', p_appointment_id, 'Reserved for booking'
  );

  return v_reservation_id;
end;
$$;

create or replace function public.consume_customer_balance_reservation(
  p_appointment_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.customer_credit_reservations%rowtype;
  v_allocation record;
  v_balance numeric(12,2);
  v_currency text;
  v_cashable_amount numeric(12,2) := 0;
begin
  select * into v_reservation
  from public.customer_credit_reservations
  where appointment_id = p_appointment_id
  for update;

  if v_reservation.id is null then return false; end if;
  if v_reservation.status = 'consumed' then return true; end if;
  if v_reservation.status <> 'reserved' then return false; end if;

  for v_allocation in
    select cra.*, cg.source_type, cg.source_id, cg.is_cashable
    from public.customer_credit_reservation_allocations cra
    join public.customer_credit_grants cg on cg.id = cra.grant_id
    where cra.reservation_id = v_reservation.id
    for update of cg
  loop
    if v_allocation.is_cashable then
      v_cashable_amount := v_cashable_amount + v_allocation.amount;
    end if;
    update public.customer_credit_grants
    set remaining_amount = remaining_amount - v_allocation.amount,
        reserved_amount = reserved_amount - v_allocation.amount,
        status = case
          when remaining_amount - v_allocation.amount <= 0 then 'exhausted'
          else status
        end,
        updated_at = now()
    where id = v_allocation.grant_id;

    if v_allocation.source_type = 'voucher' and v_allocation.source_id is not null then
      update public.vouchers
      set balance = greatest(0, balance - v_allocation.amount),
          updated_at = now()
      where id = v_allocation.source_id;

      insert into public.voucher_redemptions (
        tenant_id, voucher_id, customer_id, appointment_id, event_type, amount
      )
      values (
        v_reservation.tenant_id, v_allocation.source_id, v_reservation.customer_id,
        p_appointment_id, 'redeem', v_allocation.amount
      );
    end if;
  end loop;

  update public.customer_credit_reservations
  set status = 'consumed', consumed_at = now()
  where id = v_reservation.id;

  select currency into v_currency
  from public.customer_purses
  where tenant_id = v_reservation.tenant_id and customer_id = v_reservation.customer_id;

  v_balance := public.sync_customer_purse_balance(
    v_reservation.tenant_id, v_reservation.customer_id, coalesce(v_currency, 'USD')
  );

  if v_cashable_amount > 0 then
    perform public.credit_salon_purse(
      v_reservation.tenant_id,
      'salon_purse_credit_booking'::public.wallet_entry_type,
      'appointment',
      p_appointment_id,
      v_cashable_amount,
      coalesce(v_currency, 'USD'),
      'customer_balance_redemption_' || v_reservation.id::text,
      null
    );
  end if;

  insert into public.customer_credit_ledger (
    tenant_id, customer_id, reservation_id, entry_type, amount, balance_after,
    reference_type, reference_id, description, created_by_id
  )
  values (
    v_reservation.tenant_id, v_reservation.customer_id, v_reservation.id,
    'booking_redemption', -v_reservation.amount, v_balance,
    'appointment', p_appointment_id, 'Used for completed appointment', auth.uid()
  );

  return true;
end;
$$;

create or replace function public.release_customer_balance_reservation(
  p_appointment_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.customer_credit_reservations%rowtype;
  v_allocation record;
begin
  select * into v_reservation
  from public.customer_credit_reservations
  where appointment_id = p_appointment_id
  for update;

  if v_reservation.id is null then return false; end if;
  if v_reservation.status = 'released' then return true; end if;
  if v_reservation.status <> 'reserved' then return false; end if;

  for v_allocation in
    select * from public.customer_credit_reservation_allocations
    where reservation_id = v_reservation.id
  loop
    update public.customer_credit_grants
    set reserved_amount = greatest(0, reserved_amount - v_allocation.amount),
        updated_at = now()
    where id = v_allocation.grant_id;
  end loop;

  update public.customer_credit_reservations
  set status = 'released', released_at = now()
  where id = v_reservation.id;

  insert into public.customer_credit_ledger (
    tenant_id, customer_id, reservation_id, entry_type, amount, balance_after,
    reference_type, reference_id, description, created_by_id
  )
  values (
    v_reservation.tenant_id, v_reservation.customer_id, v_reservation.id,
    'reservation_release', 0,
    public.customer_credit_available(v_reservation.tenant_id, v_reservation.customer_id),
    'appointment', p_appointment_id, 'Booking reservation released', auth.uid()
  );

  return true;
end;
$$;

create or replace function public.refund_customer_balance_reservation(
  p_appointment_id uuid,
  p_amount numeric,
  p_restore_to_balance boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.customer_credit_reservations%rowtype;
  v_allocation record;
  v_remaining numeric(12,2) := p_amount;
  v_take numeric(12,2);
  v_currency text;
  v_balance numeric(12,2);
begin
  if p_amount is null or p_amount <= 0 then return false; end if;

  select * into v_reservation
  from public.customer_credit_reservations
  where appointment_id = p_appointment_id
  for update;

  if v_reservation.id is null
     or v_reservation.status <> 'reserved'
     or p_amount > v_reservation.amount then
    return false;
  end if;

  for v_allocation in
    select cra.*, cg.source_type, cg.source_id
    from public.customer_credit_reservation_allocations cra
    join public.customer_credit_grants cg on cg.id = cra.grant_id
    where cra.reservation_id = v_reservation.id
      and cra.amount > 0
    order by cg.is_cashable asc, cg.expires_at asc nulls last, cg.created_at asc
    for update of cra, cg
  loop
    exit when v_remaining <= 0;
    v_take := least(v_remaining, v_allocation.amount);

    if p_restore_to_balance then
      update public.customer_credit_grants
      set reserved_amount = greatest(0, reserved_amount - v_take),
          updated_at = now()
      where id = v_allocation.grant_id;
    else
      update public.customer_credit_grants
      set remaining_amount = greatest(0, remaining_amount - v_take),
          reserved_amount = greatest(0, reserved_amount - v_take),
          status = case
            when remaining_amount - v_take <= 0 then 'exhausted'
            else status
          end,
          updated_at = now()
      where id = v_allocation.grant_id;

      if v_allocation.source_type = 'voucher' and v_allocation.source_id is not null then
        update public.vouchers
        set balance = greatest(0, balance - v_take), updated_at = now()
        where id = v_allocation.source_id;
        insert into public.voucher_redemptions (
          tenant_id, voucher_id, customer_id, appointment_id, event_type, amount
        )
        values (
          v_reservation.tenant_id, v_allocation.source_id, v_reservation.customer_id,
          p_appointment_id, 'redeem', v_take
        );
      end if;
    end if;

    if v_take >= v_allocation.amount then
      delete from public.customer_credit_reservation_allocations
      where id = v_allocation.id;
    else
      update public.customer_credit_reservation_allocations
      set amount = amount - v_take
      where id = v_allocation.id;
    end if;

    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    raise exception 'Unable to refund the reserved customer balance';
  end if;

  update public.customer_credit_reservations
  set amount = amount - p_amount,
      status = case
        when amount - p_amount > 0 then 'reserved'
        when p_restore_to_balance then 'released'
        else 'consumed'
      end,
      released_at = case
        when amount - p_amount <= 0 and p_restore_to_balance then now()
        else released_at
      end,
      consumed_at = case
        when amount - p_amount <= 0 and not p_restore_to_balance then now()
        else consumed_at
      end
  where id = v_reservation.id;

  select currency into v_currency
  from public.customer_purses
  where tenant_id = v_reservation.tenant_id
    and customer_id = v_reservation.customer_id;
  v_balance := public.sync_customer_purse_balance(
    v_reservation.tenant_id, v_reservation.customer_id, coalesce(v_currency, 'USD')
  );

  insert into public.customer_credit_ledger (
    tenant_id, customer_id, reservation_id, entry_type, amount, balance_after,
    reference_type, reference_id, description, created_by_id
  )
  values (
    v_reservation.tenant_id, v_reservation.customer_id, v_reservation.id,
    case when p_restore_to_balance then 'reservation_release' else 'booking_redemption' end,
    case when p_restore_to_balance then 0 else -p_amount end,
    v_balance, 'appointment', p_appointment_id,
    case
      when p_restore_to_balance then 'Refund restored reserved salon balance'
      else 'Salon balance converted to an offline refund'
    end,
    auth.uid()
  );

  return true;
end;
$$;

create or replace function public.request_transaction_refund(
  p_transaction_id uuid,
  p_amount numeric,
  p_refund_type public.refund_type,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.transactions%rowtype;
  v_request_id uuid;
  v_reserved numeric(12,2);
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
      and is_active = true
  ) then
    raise exception 'Only salon staff can request a refund';
  end if;

  if p_amount is null or p_amount <= 0 or nullif(trim(p_reason), '') is null then
    raise exception 'A valid amount and reason are required';
  end if;

  select coalesce(sum(amount), 0)
  into v_reserved
  from public.refund_requests
  where transaction_id = p_transaction_id
    and status in ('pending', 'approved', 'completed');

  if p_amount > v_transaction.amount - v_reserved then
    raise exception 'Refund exceeds the remaining refundable amount';
  end if;

  insert into public.refund_requests (
    tenant_id, transaction_id, customer_id, refund_type, amount, reason,
    status, requested_by_id
  )
  values (
    v_transaction.tenant_id, p_transaction_id, v_transaction.customer_id,
    p_refund_type, p_amount, trim(p_reason), 'pending', auth.uid()
  )
  returning id into v_request_id;

  return v_request_id;
end;
$$;

create or replace function public.complete_transaction_refund(
  p_transaction_id uuid,
  p_amount numeric,
  p_refund_type public.refund_type,
  p_reason text,
  p_request_id uuid default null
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
      status, requested_by_id, approved_by_id, approved_at, processed_transaction_id
    )
    values (
      v_transaction.tenant_id, p_transaction_id, v_transaction.customer_id,
      p_refund_type, p_amount, trim(p_reason), 'completed', auth.uid(), auth.uid(),
      now(), v_refund_id
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
      'processed_by_id', auth.uid()
    )
  );

  return v_refund_id;
end;
$$;

create or replace function public.reject_transaction_refund(
  p_request_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.refund_requests%rowtype;
begin
  select * into v_request
  from public.refund_requests
  where id = p_request_id
  for update;

  if v_request.id is null or v_request.status <> 'pending' then
    raise exception 'Refund request is no longer pending';
  end if;

  if not exists (
    select 1 from public.user_roles
    where tenant_id = v_request.tenant_id
      and user_id = auth.uid()
      and role in ('owner', 'manager')
      and is_active = true
  ) then
    raise exception 'Only owners and managers can reject refunds';
  end if;

  if nullif(trim(p_reason), '') is null then
    raise exception 'A rejection reason is required';
  end if;

  update public.refund_requests
  set status = 'rejected',
      rejection_reason = trim(p_reason),
      approved_by_id = auth.uid(),
      approved_at = now(),
      updated_at = now()
  where id = p_request_id;

  return true;
end;
$$;

alter table public.customer_credit_grants enable row level security;
alter table public.customer_credit_reservations enable row level security;
alter table public.customer_credit_reservation_allocations enable row level security;
alter table public.customer_credit_ledger enable row level security;
alter table public.voucher_redemptions enable row level security;

create policy "Staff can read tenant credit grants"
  on public.customer_credit_grants for select to authenticated
  using (tenant_id in (select public.get_user_tenant_ids(auth.uid())));

create policy "Customers can read own credit grants"
  on public.customer_credit_grants for select to authenticated
  using (customer_id in (select id from public.customers where user_id = auth.uid()));

create policy "Staff can read tenant credit reservations"
  on public.customer_credit_reservations for select to authenticated
  using (tenant_id in (select public.get_user_tenant_ids(auth.uid())));

create policy "Customers can read own credit reservations"
  on public.customer_credit_reservations for select to authenticated
  using (customer_id in (select id from public.customers where user_id = auth.uid()));

create policy "Users can read visible credit allocations"
  on public.customer_credit_reservation_allocations for select to authenticated
  using (
    reservation_id in (
      select id from public.customer_credit_reservations
      where tenant_id in (select public.get_user_tenant_ids(auth.uid()))
         or customer_id in (select id from public.customers where user_id = auth.uid())
    )
  );

create policy "Staff can read tenant credit ledger"
  on public.customer_credit_ledger for select to authenticated
  using (tenant_id in (select public.get_user_tenant_ids(auth.uid())));

create policy "Customers can read own credit ledger"
  on public.customer_credit_ledger for select to authenticated
  using (customer_id in (select id from public.customers where user_id = auth.uid()));

create policy "Staff can read tenant voucher redemptions"
  on public.voucher_redemptions for select to authenticated
  using (tenant_id in (select public.get_user_tenant_ids(auth.uid())));

create policy "Customers can read own voucher redemptions"
  on public.voucher_redemptions for select to authenticated
  using (customer_id in (select id from public.customers where user_id = auth.uid()));

-- Clients may view their refund history but can no longer create refund requests.
drop policy if exists "Customers can create own refund requests" on public.refund_requests;

-- Refund state transitions are RPC-only. Existing broad staff policies would
-- otherwise let any staff account self-approve a request.
drop policy if exists "Users can update refund requests for their tenants" on public.refund_requests;
drop policy if exists "Users can update tenant refund_requests (permissioned)" on public.refund_requests;
drop policy if exists "Users can create refund requests for their tenants" on public.refund_requests;
drop policy if exists "Users can create tenant refund_requests (permissioned)" on public.refund_requests;

revoke all on function public.sync_customer_purse_balance(uuid, uuid, text) from public, authenticated;
revoke all on function public.credit_customer_balance(uuid, uuid, numeric, text, text, uuid, boolean, timestamptz, text, text, jsonb) from public, authenticated;
revoke all on function public.credit_customer_purse(uuid, uuid, numeric, text, text, text) from public, authenticated;
revoke all on function public.reserve_customer_balance(uuid, uuid, uuid, numeric) from public, authenticated;
revoke all on function public.consume_customer_balance_reservation(uuid) from public, authenticated;
revoke all on function public.release_customer_balance_reservation(uuid) from public, authenticated;
revoke all on function public.refund_customer_balance_reservation(uuid, numeric, boolean) from public, authenticated;

grant execute on function public.sync_customer_purse_balance(uuid, uuid, text) to service_role;
grant execute on function public.credit_customer_balance(uuid, uuid, numeric, text, text, uuid, boolean, timestamptz, text, text, jsonb) to service_role;
grant execute on function public.credit_customer_purse(uuid, uuid, numeric, text, text, text) to service_role;
grant execute on function public.adjust_customer_balance(uuid, uuid, numeric, text, text) to authenticated;
grant execute on function public.customer_credit_available(uuid, uuid) to authenticated, service_role;
grant execute on function public.claim_voucher_to_balance(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.claim_voucher_for_current_user(text) to authenticated;
grant execute on function public.reserve_customer_balance(uuid, uuid, uuid, numeric) to service_role;
grant execute on function public.consume_customer_balance_reservation(uuid) to service_role;
grant execute on function public.release_customer_balance_reservation(uuid) to service_role;
grant execute on function public.refund_customer_balance_reservation(uuid, numeric, boolean) to service_role;
grant execute on function public.request_transaction_refund(uuid, numeric, public.refund_type, text) to authenticated;
grant execute on function public.complete_transaction_refund(uuid, numeric, public.refund_type, text, uuid) to authenticated;
grant execute on function public.reject_transaction_refund(uuid, text) to authenticated;

-- Every active staff role can view transactions and submit refund requests.
insert into public.role_permissions (tenant_id, role, module, allowed)
select t.id, roles.role, 'payments', true
from public.tenants t
cross join (
  values
    ('supervisor'::public.app_role),
    ('receptionist'::public.app_role),
    ('staff'::public.app_role)
) as roles(role)
on conflict (tenant_id, role, module)
do update set allowed = true;
