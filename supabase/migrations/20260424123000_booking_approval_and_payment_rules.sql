begin;

alter table public.appointments
  add column if not exists approval_status text not null default 'not_required'
    check (approval_status in (
      'not_required',
      'pending',
      'approved',
      'declined',
      'reschedule_proposed',
      'reschedule_accepted',
      'reschedule_declined'
    )),
  add column if not exists approval_requested_at timestamptz,
  add column if not exists approval_reason text,
  add column if not exists approval_decided_at timestamptz,
  add column if not exists approval_decided_by uuid,
  add column if not exists approval_invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists proposed_start timestamptz,
  add column if not exists proposed_end timestamptz,
  add column if not exists proposed_message text,
  add column if not exists customer_response_status text not null default 'pending'
    check (customer_response_status in ('pending', 'accepted', 'declined', 'not_required'));

update public.appointments
set
  approval_status = case
    when coalesce(auto_confirm_bookings, false) then 'approved'
    else coalesce(approval_status, 'not_required')
  end
from public.tenants
where tenants.id = appointments.tenant_id
  and appointments.approval_status = 'not_required'
  and appointments.confirmation_status = 'auto';

create index if not exists idx_appointments_tenant_approval_status
  on public.appointments (tenant_id, approval_status, created_at desc);

create index if not exists idx_appointments_booking_reference
  on public.appointments (tenant_id, booking_reference);

create or replace view public.public_booking_tenants
with (security_invoker = off)
as
select
  t.id,
  t.name,
  t.slug,
  t.logo_url,
  t.banner_urls,
  t.brand_color,
  t.currency,
  t.timezone,
  t.country,
  t.online_booking_enabled,
  t.deposits_enabled,
  t.default_deposit_percentage,
  t.cancellation_grace_hours,
  t.booking_status_message,
  t.slot_capacity_default,
  t.default_buffer_minutes,
  t.pay_at_salon_enabled,
  t.auto_confirm_bookings,
  case when t.show_contact_on_booking then t.contact_phone else null end as contact_phone,
  t.show_contact_on_booking,
  t.allow_staff_selection,
  t.require_staff_selection,
  t.auto_assign_staff,
  (
    select tae.addon_key
    from public.tenant_addon_entitlements tae
    where tae.tenant_id = t.id
      and tae.addon_type = 'theme_ecommerce'
      and tae.status = 'active'
      and (tae.ends_at is null or tae.ends_at > now())
    order by tae.created_at desc
    limit 1
  ) as theme_key
from public.tenants t
where t.online_booking_enabled = true
  and t.slug is not null;

grant select on public.public_booking_tenants to anon, authenticated;

create or replace function public.create_booking_invoice_for_approved_items(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_booking_reference text default null,
  p_appointment_ids uuid[] default null,
  p_due_date timestamptz default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_currency text;
  v_invoice_number text;
  v_invoice_id uuid;
  v_subtotal numeric := 0;
begin
  if v_actor_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not belongs_to_tenant(v_actor_user_id, p_tenant_id)
     and not has_backoffice_role(v_actor_user_id, 'super_admin'::public.backoffice_role) then
    raise exception 'BOOKING_INVOICE_FORBIDDEN';
  end if;

  select currency
  into v_currency
  from public.tenants
  where id = p_tenant_id;

  if v_currency is null then
    raise exception 'TENANT_NOT_FOUND';
  end if;

  select coalesce(sum(a.total_amount), 0)
  into v_subtotal
  from public.appointments a
  where a.tenant_id = p_tenant_id
    and a.customer_id = p_customer_id
    and a.status <> 'cancelled'
    and a.approval_invoice_id is null
    and a.approval_status in ('approved', 'reschedule_accepted', 'not_required')
    and (p_booking_reference is null or a.booking_reference = p_booking_reference)
    and (p_appointment_ids is null or a.id = any(p_appointment_ids));

  if coalesce(v_subtotal, 0) <= 0 then
    raise exception 'NO_APPROVED_ITEMS_TO_INVOICE';
  end if;

  v_invoice_number := public.generate_invoice_number(p_tenant_id);

  insert into public.invoices (
    invoice_number,
    tenant_id,
    customer_id,
    subtotal,
    total,
    currency,
    status,
    due_date,
    notes
  )
  values (
    v_invoice_number,
    p_tenant_id,
    p_customer_id,
    v_subtotal,
    v_subtotal,
    v_currency,
    'draft',
    p_due_date,
    p_notes
  )
  returning id into v_invoice_id;

  insert into public.invoice_line_items (
    invoice_id,
    description,
    quantity,
    unit_price,
    total_price,
    service_id,
    product_id
  )
  select
    v_invoice_id,
    aps.service_name,
    1,
    aps.price,
    aps.price,
    aps.service_id,
    null
  from public.appointment_services aps
  join public.appointments a on a.id = aps.appointment_id
  where a.tenant_id = p_tenant_id
    and a.customer_id = p_customer_id
    and a.status <> 'cancelled'
    and a.approval_invoice_id is null
    and a.approval_status in ('approved', 'reschedule_accepted', 'not_required')
    and (p_booking_reference is null or a.booking_reference = p_booking_reference)
    and (p_appointment_ids is null or a.id = any(p_appointment_ids));

  insert into public.invoice_line_items (
    invoice_id,
    description,
    quantity,
    unit_price,
    total_price,
    service_id,
    product_id
  )
  select
    v_invoice_id,
    app.product_name,
    app.quantity,
    app.unit_price,
    app.total_price,
    null,
    app.product_id
  from public.appointment_products app
  join public.appointments a on a.id = app.appointment_id
  where a.tenant_id = p_tenant_id
    and a.customer_id = p_customer_id
    and a.status <> 'cancelled'
    and a.approval_invoice_id is null
    and a.approval_status in ('approved', 'reschedule_accepted', 'not_required')
    and (p_booking_reference is null or a.booking_reference = p_booking_reference)
    and (p_appointment_ids is null or a.id = any(p_appointment_ids));

  update public.appointments
  set approval_invoice_id = v_invoice_id
  where tenant_id = p_tenant_id
    and customer_id = p_customer_id
    and status <> 'cancelled'
    and approval_invoice_id is null
    and approval_status in ('approved', 'reschedule_accepted', 'not_required')
    and (p_booking_reference is null or booking_reference = p_booking_reference)
    and (p_appointment_ids is null or id = any(p_appointment_ids));

  return v_invoice_id;
end;
$$;

grant execute on function public.create_booking_invoice_for_approved_items(
  uuid,
  uuid,
  text,
  uuid[],
  timestamptz,
  text
) to authenticated;

commit;
