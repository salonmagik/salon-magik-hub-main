-- Phase 1: wire package-credit redemption into booking creation.
-- 1. Link a reservation to its exact appointment_service line.
alter table public.package_entitlement_reservations
  add column if not exists appointment_service_id uuid references public.appointment_services(id) on delete cascade;

create unique index if not exists idx_package_entitlement_reservations_appointment_service_id
  on public.package_entitlement_reservations (appointment_service_id)
  where appointment_service_id is not null;

-- 2 & 3. Extend reserve_customer_package_credit with appointment_service_id + tenant-scoped authorization.
drop function if exists public.reserve_customer_package_credit(uuid, uuid);

create or replace function public.reserve_customer_package_credit(
  p_appointment_id uuid,
  p_service_id uuid,
  p_appointment_service_id uuid
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
  v_appointment_service public.appointment_services%rowtype;
begin
  select * into v_appointment
  from public.appointments
  where id = p_appointment_id
  for update;
  if v_appointment.id is null then raise exception 'Appointment not found'; end if;

  if auth.role() <> 'service_role'
     and v_appointment.tenant_id not in (select public.get_user_tenant_ids(auth.uid())) then
    raise exception 'Not authorized for this tenant';
  end if;

  select * into v_appointment_service
  from public.appointment_services
  where id = p_appointment_service_id
    and appointment_id = p_appointment_id
    and service_id = p_service_id;
  if v_appointment_service.id is null then
    raise exception 'Appointment service not found or does not match appointment/service';
  end if;

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
    tenant_id, customer_id, appointment_id, entitlement_item_id, appointment_service_id
  )
  values (
    v_appointment.tenant_id, v_appointment.customer_id, p_appointment_id, v_item.id, p_appointment_service_id
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

revoke all on function public.reserve_customer_package_credit(uuid, uuid, uuid) from public, authenticated;
grant execute on function public.reserve_customer_package_credit(uuid, uuid, uuid) to authenticated, service_role;

-- 4. Snapshot columns on invoice_line_items for invoice/email breakdown.
alter table public.invoice_line_items
  add column if not exists is_package_covered boolean not null default false,
  add column if not exists package_name text;
