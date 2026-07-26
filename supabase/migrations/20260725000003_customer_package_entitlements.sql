-- Packages are customer-owned service entitlements, not monetary store credit.

create table if not exists public.customer_package_entitlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  package_id uuid not null references public.packages(id) on delete restrict,
  purchased_transaction_id uuid references public.transactions(id) on delete set null,
  status text not null default 'active'
    check (status in ('active', 'exhausted', 'expired', 'cancelled', 'refunded')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_package_entitlement_items (
  id uuid primary key default gen_random_uuid(),
  entitlement_id uuid not null references public.customer_package_entitlements(id) on delete cascade,
  service_id uuid references public.services(id) on delete restrict,
  product_id uuid references public.products(id) on delete restrict,
  total_quantity integer not null check (total_quantity > 0),
  remaining_quantity integer not null check (remaining_quantity >= 0),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0),
  constraint package_entitlement_item_reserved_check
    check (reserved_quantity <= remaining_quantity),
  constraint package_entitlement_item_kind_check
    check (num_nonnulls(service_id, product_id) = 1)
);

create unique index if not exists idx_package_entitlement_service
  on public.customer_package_entitlement_items (entitlement_id, service_id)
  where service_id is not null;
create unique index if not exists idx_package_entitlement_product
  on public.customer_package_entitlement_items (entitlement_id, product_id)
  where product_id is not null;

create table if not exists public.package_entitlement_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  entitlement_item_id uuid not null references public.customer_package_entitlement_items(id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  status text not null default 'reserved'
    check (status in ('reserved', 'consumed', 'released')),
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  released_at timestamptz,
  unique (appointment_id, entitlement_item_id)
);

create index if not exists idx_customer_packages_customer
  on public.customer_package_entitlements (tenant_id, customer_id, status, expires_at);

create or replace function public.issue_customer_package(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_package_id uuid,
  p_transaction_id uuid default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entitlement_id uuid;
begin
  if auth.role() <> 'service_role'
     and not exists (
       select 1 from public.user_roles
       where tenant_id = p_tenant_id
         and user_id = auth.uid()
         and role in ('owner', 'manager')
         and is_active = true
     ) then
    raise exception 'Only owners and managers can issue packages';
  end if;

  if not exists (
    select 1 from public.customers
    where id = p_customer_id and tenant_id = p_tenant_id
  ) or not exists (
    select 1 from public.packages
    where id = p_package_id and tenant_id = p_tenant_id and status = 'active'
  ) then
    raise exception 'Customer or package was not found';
  end if;

  if p_transaction_id is not null then
    select id into v_entitlement_id
    from public.customer_package_entitlements
    where purchased_transaction_id = p_transaction_id;
    if v_entitlement_id is not null then return v_entitlement_id; end if;
  end if;

  insert into public.customer_package_entitlements (
    tenant_id, customer_id, package_id, purchased_transaction_id,
    expires_at, created_by_id
  )
  values (
    p_tenant_id, p_customer_id, p_package_id, p_transaction_id,
    p_expires_at, auth.uid()
  )
  returning id into v_entitlement_id;

  insert into public.customer_package_entitlement_items (
    entitlement_id, service_id, total_quantity, remaining_quantity
  )
  select v_entitlement_id, service_id, quantity, quantity
  from public.package_items
  where package_id = p_package_id
    and product_id is null
  on conflict (entitlement_id, service_id) where service_id is not null
  do update set
    total_quantity = public.customer_package_entitlement_items.total_quantity + excluded.total_quantity,
    remaining_quantity = public.customer_package_entitlement_items.remaining_quantity + excluded.remaining_quantity;

  insert into public.customer_package_entitlement_items (
    entitlement_id, product_id, total_quantity, remaining_quantity
  )
  select v_entitlement_id, product_id, quantity, quantity
  from public.package_items
  where package_id = p_package_id
    and product_id is not null
  on conflict (entitlement_id, product_id) where product_id is not null
  do update set
    total_quantity = public.customer_package_entitlement_items.total_quantity + excluded.total_quantity,
    remaining_quantity = public.customer_package_entitlement_items.remaining_quantity + excluded.remaining_quantity;

  return v_entitlement_id;
end;
$$;

create or replace function public.reserve_customer_package_credit(
  p_appointment_id uuid,
  p_service_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment public.appointments%rowtype;
  v_item public.customer_package_entitlement_items%rowtype;
  v_reservation_id uuid;
begin
  select * into v_appointment
  from public.appointments
  where id = p_appointment_id
  for update;
  if v_appointment.id is null then raise exception 'Appointment not found'; end if;

  select pei.* into v_item
  from public.customer_package_entitlement_items pei
  join public.customer_package_entitlements pe on pe.id = pei.entitlement_id
  where pe.tenant_id = v_appointment.tenant_id
    and pe.customer_id = v_appointment.customer_id
    and pe.status = 'active'
    and (pe.expires_at is null or pe.expires_at > now())
    and pei.service_id = p_service_id
    and pei.remaining_quantity > pei.reserved_quantity
  order by pe.expires_at asc nulls last, pe.created_at asc
  limit 1
  for update of pei;

  if v_item.id is null then raise exception 'No available package credit for this service'; end if;

  insert into public.package_entitlement_reservations (
    tenant_id, customer_id, appointment_id, entitlement_item_id
  )
  values (
    v_appointment.tenant_id, v_appointment.customer_id, p_appointment_id, v_item.id
  )
  on conflict (appointment_id, entitlement_item_id)
  do nothing
  returning id into v_reservation_id;

  if v_reservation_id is null then
    select id into v_reservation_id
    from public.package_entitlement_reservations
    where appointment_id = p_appointment_id
      and entitlement_item_id = v_item.id;
    return v_reservation_id;
  end if;

  update public.customer_package_entitlement_items
  set reserved_quantity = reserved_quantity + 1
  where id = v_item.id;

  return v_reservation_id;
end;
$$;

create or replace function public.issue_unscheduled_package_purchase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_package_id uuid;
begin
  if new.status <> 'completed'
     or new.type <> 'payment'
     or new.appointment_id is null
     or new.customer_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.appointments
    where id = new.appointment_id
      and is_unscheduled = true
      and payment_status = 'fully_paid'
  ) then
    return new;
  end if;

  for v_package_id in
    select distinct package_id
    from public.appointment_services
    where appointment_id = new.appointment_id
      and package_id is not null
  loop
    if not exists (
      select 1
      from public.customer_package_entitlements pe
      join public.transactions purchase on purchase.id = pe.purchased_transaction_id
      where purchase.appointment_id = new.appointment_id
        and pe.package_id = v_package_id
    ) then
      perform public.issue_customer_package(
        new.tenant_id,
        new.customer_id,
        v_package_id,
        new.id,
        null
      );
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_issue_unscheduled_package_purchase on public.transactions;
create trigger trg_issue_unscheduled_package_purchase
after insert on public.transactions
for each row
execute function public.issue_unscheduled_package_purchase();

create or replace function public.sync_refunded_package_entitlements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_status = 'refunded_full'
     and new.payment_status is distinct from old.payment_status then
    update public.customer_package_entitlements
    set status = 'refunded', updated_at = now()
    where purchased_transaction_id in (
      select id from public.transactions where appointment_id = new.id
    )
      and status in ('active', 'exhausted');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_refunded_package_entitlements on public.appointments;
create trigger trg_sync_refunded_package_entitlements
after update of payment_status on public.appointments
for each row
execute function public.sync_refunded_package_entitlements();

create or replace function public.settle_appointment_value_reservations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_package_reservation record;
begin
  if new.status = old.status then return new; end if;

  if new.status = 'completed' then
    perform public.consume_customer_balance_reservation(new.id);

    for v_package_reservation in
      select per.id, per.entitlement_item_id, per.quantity, pei.entitlement_id
      from public.package_entitlement_reservations per
      join public.customer_package_entitlement_items pei on pei.id = per.entitlement_item_id
      where per.appointment_id = new.id and per.status = 'reserved'
      for update of per, pei
    loop
      update public.customer_package_entitlement_items
      set remaining_quantity = remaining_quantity - v_package_reservation.quantity,
          reserved_quantity = reserved_quantity - v_package_reservation.quantity
      where id = v_package_reservation.entitlement_item_id;

      update public.package_entitlement_reservations
      set status = 'consumed', consumed_at = now()
      where id = v_package_reservation.id;

      update public.customer_package_entitlements pe
      set status = case
        when not exists (
          select 1 from public.customer_package_entitlement_items pei
          where pei.entitlement_id = pe.id
            and pei.remaining_quantity > 0
        ) then 'exhausted'
        else pe.status
      end,
      updated_at = now()
      where pe.id = v_package_reservation.entitlement_id;
    end loop;
  elsif new.status = 'cancelled' then
    perform public.release_customer_balance_reservation(new.id);

    for v_package_reservation in
      select id, entitlement_item_id, quantity
      from public.package_entitlement_reservations
      where appointment_id = new.id and status = 'reserved'
      for update
    loop
      update public.customer_package_entitlement_items
      set reserved_quantity = greatest(0, reserved_quantity - v_package_reservation.quantity)
      where id = v_package_reservation.entitlement_item_id;
      update public.package_entitlement_reservations
      set status = 'released', released_at = now()
      where id = v_package_reservation.id;
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_settle_appointment_value_reservations on public.appointments;
create trigger trg_settle_appointment_value_reservations
after update of status on public.appointments
for each row
execute function public.settle_appointment_value_reservations();

alter table public.customer_package_entitlements enable row level security;
alter table public.customer_package_entitlement_items enable row level security;
alter table public.package_entitlement_reservations enable row level security;

create policy "Staff can read tenant package entitlements"
  on public.customer_package_entitlements for select to authenticated
  using (tenant_id in (select public.get_user_tenant_ids(auth.uid())));
create policy "Customers can read own package entitlements"
  on public.customer_package_entitlements for select to authenticated
  using (customer_id in (select id from public.customers where user_id = auth.uid()));

create policy "Users can read visible package entitlement items"
  on public.customer_package_entitlement_items for select to authenticated
  using (
    entitlement_id in (
      select id from public.customer_package_entitlements
      where tenant_id in (select public.get_user_tenant_ids(auth.uid()))
         or customer_id in (select id from public.customers where user_id = auth.uid())
    )
  );

create policy "Staff can read package reservations"
  on public.package_entitlement_reservations for select to authenticated
  using (tenant_id in (select public.get_user_tenant_ids(auth.uid())));
create policy "Customers can read own package reservations"
  on public.package_entitlement_reservations for select to authenticated
  using (customer_id in (select id from public.customers where user_id = auth.uid()));

revoke all on function public.reserve_customer_package_credit(uuid, uuid) from public, authenticated;
grant execute on function public.issue_customer_package(uuid, uuid, uuid, uuid, timestamptz) to authenticated, service_role;
grant execute on function public.reserve_customer_package_credit(uuid, uuid) to service_role;
