-- customer_purses.balance is a denormalized cache of spendable credit, kept
-- in sync by sync_customer_purse_balance() — called from credit_customer_balance,
-- consume_customer_balance_reservation and refund_customer_balance_reservation.
-- Two gaps left it stale as soon as a reservation (soft hold) was created:
--
-- 1. sync_customer_purse_balance() only summed `remaining_amount` over active
--    grants, never subtracting `reserved_amount` — so it was architecturally
--    incapable of reflecting an open hold, only ever dropping once a
--    reservation was consumed (remaining_amount itself reduced).
-- 2. reserve_customer_balance() (the RPC create-public-booking calls to apply
--    voucher/store-credit balance toward a booking) never called
--    sync_customer_purse_balance() at all, unlike every sibling function that
--    touches reserved_amount.
--
-- Net effect: a customer who claimed a ₵50 gift voucher, then immediately
-- spent all ₵50 of it as a reservation against a booking, still saw ₵50.00
-- "available" on the client-portal dashboard (which reads customer_purses.balance)
-- even though customer_credit_available() — the ledger/grants system's own
-- source of truth — correctly reported ₵0.00. release_customer_balance_reservation
-- had the same missing-sync gap in the opposite direction (a released hold
-- wouldn't reappear as available until something else happened to resync it).

begin;

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
  select coalesce(sum(remaining_amount - reserved_amount), 0)
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

    v_currency := coalesce(v_currency, v_grant.currency);
    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    raise exception 'Unable to reserve the requested balance';
  end if;

  if v_currency is null then
    select currency into v_currency
    from public.customer_purses
    where tenant_id = p_tenant_id and customer_id = p_customer_id;
  end if;

  perform public.sync_customer_purse_balance(p_tenant_id, p_customer_id, coalesce(v_currency, 'USD'));

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
  v_currency text;
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

  select currency into v_currency
  from public.customer_purses
  where tenant_id = v_reservation.tenant_id and customer_id = v_reservation.customer_id;

  perform public.sync_customer_purse_balance(
    v_reservation.tenant_id, v_reservation.customer_id, coalesce(v_currency, 'USD')
  );

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

-- Backfill: resync every customer's cached purse balance now that the
-- formula accounts for open reservations, so existing stale rows (like the
-- one this bug produced) correct themselves immediately rather than waiting
-- for their next credit/consume/refund event.
do $$
declare
  v_row record;
begin
  for v_row in
    select distinct tenant_id, customer_id, currency
    from public.customer_purses
  loop
    perform public.sync_customer_purse_balance(v_row.tenant_id, v_row.customer_id, v_row.currency);
  end loop;
end;
$$;

commit;
