-- Check-ins and time off are sold together as the Staff Operations add-on.
-- Pricing is controlled by Backoffice per market and billed monthly per location.

create table if not exists public.staff_operations_addon_pricing (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
  currency text not null,
  unit_price_per_location numeric(12, 2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  notes text,
  effective_from timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_operations_pricing_country_check check (length(trim(country_code)) >= 2),
  constraint staff_operations_pricing_currency_check check (length(trim(currency)) = 3),
  constraint staff_operations_pricing_amount_check check (unit_price_per_location >= 0)
);

create index if not exists idx_staff_operations_pricing_market
  on public.staff_operations_addon_pricing
  (country_code, currency, status, effective_from desc);

drop trigger if exists trg_staff_operations_pricing_updated_at
  on public.staff_operations_addon_pricing;
create trigger trg_staff_operations_pricing_updated_at
before update on public.staff_operations_addon_pricing
for each row execute function public.update_updated_at_column();

alter table public.staff_operations_addon_pricing enable row level security;

create policy "Authenticated can read staff operations pricing"
  on public.staff_operations_addon_pricing
  for select
  to authenticated
  using (true);

create policy "Backoffice super admins manage staff operations pricing"
  on public.staff_operations_addon_pricing
  for all
  to authenticated
  using (public.has_backoffice_role(auth.uid(), 'super_admin'::public.backoffice_role))
  with check (public.has_backoffice_role(auth.uid(), 'super_admin'::public.backoffice_role));

-- Extend the shared entitlement ledger with the Staff Operations bundle.
alter table public.tenant_addon_entitlements
  drop constraint if exists tenant_addon_entitlements_addon_type_check;
alter table public.tenant_addon_entitlements
  add constraint tenant_addon_entitlements_addon_type_check
  check (addon_type in ('extra_seat', 'theme_ecommerce', 'staff_operations'));

create unique index if not exists idx_tenant_active_staff_operations
  on public.tenant_addon_entitlements (tenant_id, addon_type)
  where addon_type = 'staff_operations' and status = 'active';

insert into public.staff_operations_addon_pricing (
  country_code,
  currency,
  unit_price_per_location,
  status,
  notes
)
values (
  'GH',
  'GHS',
  25,
  'active',
  'Initial Staff Operations price: check-ins and time off, billed monthly per salon location.'
)
on conflict do nothing;

create or replace function public.activate_staff_operations_addon(
  p_tenant_id uuid,
  p_reason text default 'Enabled from Staff'
)
returns public.tenant_addon_entitlements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_country text;
  v_currency text;
  v_subscription_status text;
  v_pricing_id uuid;
  v_entitlement public.tenant_addon_entitlements;
begin
  if v_actor is null or not public.belongs_to_tenant(v_actor, p_tenant_id) then
    raise exception 'TENANT_ACCESS_DENIED';
  end if;

  if not exists (
    select 1
    from public.user_roles ur
    where ur.tenant_id = p_tenant_id
      and ur.user_id = v_actor
      and ur.role::text = 'owner'
      and coalesce(ur.is_active, true)
  ) then
    raise exception 'OWNER_REQUIRED';
  end if;

  select upper(coalesce(t.country, 'GH')),
         upper(coalesce(t.currency, 'GHS')),
         t.subscription_status::text
  into v_country, v_currency, v_subscription_status
  from public.tenants t
  where t.id = p_tenant_id;

  if v_subscription_status is distinct from 'active' then
    raise exception 'ACTIVE_SUBSCRIPTION_REQUIRED';
  end if;

  select pricing.id
  into v_pricing_id
  from public.staff_operations_addon_pricing pricing
  where pricing.country_code = v_country
    and pricing.currency = v_currency
    and pricing.status = 'active'
    and pricing.effective_from <= now()
  order by pricing.effective_from desc
  limit 1;

  if v_pricing_id is null then
    raise exception 'STAFF_OPERATIONS_PRICE_NOT_CONFIGURED';
  end if;

  select *
  into v_entitlement
  from public.tenant_addon_entitlements entitlement
  where entitlement.tenant_id = p_tenant_id
    and entitlement.addon_type = 'staff_operations'
    and entitlement.status = 'active'
  limit 1;

  if v_entitlement.id is not null then
    return v_entitlement;
  end if;

  insert into public.tenant_addon_entitlements (
    tenant_id,
    addon_type,
    addon_key,
    quantity,
    billing_interval,
    status,
    pricing_id,
    source,
    reason,
    created_by
  )
  values (
    p_tenant_id,
    'staff_operations',
    'checkins_time_off',
    1,
    'monthly',
    'active',
    v_pricing_id,
    'salon_admin',
    nullif(trim(p_reason), ''),
    v_actor
  )
  returning * into v_entitlement;

  insert into public.audit_logs (
    tenant_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_tenant_id,
    v_actor,
    'staff_operations_addon_enabled',
    'tenant_addon_entitlement',
    v_entitlement.id,
    jsonb_build_object('pricing_id', v_pricing_id, 'billing_interval', 'monthly')
  );

  return v_entitlement;
end;
$$;

create or replace function public.cancel_staff_operations_addon(
  p_tenant_id uuid,
  p_reason text default 'Disabled from Staff'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_updated integer;
begin
  if v_actor is null or not public.belongs_to_tenant(v_actor, p_tenant_id) then
    raise exception 'TENANT_ACCESS_DENIED';
  end if;

  if not exists (
    select 1
    from public.user_roles ur
    where ur.tenant_id = p_tenant_id
      and ur.user_id = v_actor
      and ur.role::text = 'owner'
      and coalesce(ur.is_active, true)
  ) then
    raise exception 'OWNER_REQUIRED';
  end if;

  update public.tenant_addon_entitlements
  set status = 'cancelled',
      ends_at = now(),
      reason = nullif(trim(p_reason), ''),
      updated_at = now()
  where tenant_id = p_tenant_id
    and addon_type = 'staff_operations'
    and status = 'active';
  get diagnostics v_updated = row_count;

  if v_updated > 0 then
    insert into public.audit_logs (
      tenant_id,
      actor_user_id,
      action,
      entity_type,
      entity_id,
      metadata
    )
    values (
      p_tenant_id,
      v_actor,
      'staff_operations_addon_cancelled',
      'tenant',
      p_tenant_id,
      jsonb_build_object('reason', nullif(trim(p_reason), ''))
    );
  end if;

  return v_updated > 0;
end;
$$;

grant execute on function public.activate_staff_operations_addon(uuid, text) to authenticated;
grant execute on function public.cancel_staff_operations_addon(uuid, text) to authenticated;

create or replace function public.compute_current_addon_total(
  p_tenant_id uuid
)
returns table (
  addon_total numeric,
  currency text,
  breakdown jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_slug text;
  v_currency text;
  v_chain_plan_id uuid;
  v_current_allowed_locations integer;
  v_current_extra_seats integer;
  v_seat_unit_price numeric := 0;
  v_country text;
  v_location_count integer := 0;
  v_location_addon_price numeric := 0;
  v_staff_operations_unit_price numeric := 0;
  v_staff_operations_total numeric := 0;
  v_has_staff_operations boolean := false;
  v_chain_quote_current record;
  v_chain_quote_base record;
begin
  select t.plan::text, upper(coalesce(t.currency, 'USD')), upper(coalesce(t.country, 'US'))
  into v_plan_slug, v_currency, v_country
  from public.tenants t
  where t.id = p_tenant_id;

  if v_plan_slug is null then
    raise exception 'TENANT_NOT_FOUND';
  end if;

  select count(*)::integer
  into v_location_count
  from public.locations
  where tenant_id = p_tenant_id
    and coalesce(is_paused, false) = false;

  select coalesce(sum(tae.quantity), 0)::integer
  into v_current_extra_seats
  from public.tenant_addon_entitlements tae
  where tae.tenant_id = p_tenant_id
    and tae.addon_type = 'extra_seat'
    and tae.status = 'active'
    and (tae.ends_at is null or tae.ends_at > now());

  select sap.unit_price_per_extra_seat
  into v_seat_unit_price
  from public.staff_addon_pricing sap
  where sap.country_code = v_country
    and sap.currency = v_currency
    and sap.status = 'active'
    and sap.effective_from <= now()
  order by sap.effective_from desc
  limit 1;
  v_seat_unit_price := coalesce(v_seat_unit_price, 0);

  select exists (
    select 1
    from public.tenant_addon_entitlements tae
    where tae.tenant_id = p_tenant_id
      and tae.addon_type = 'staff_operations'
      and tae.status = 'active'
      and (tae.ends_at is null or tae.ends_at > now())
  )
  into v_has_staff_operations;

  if v_has_staff_operations then
    select pricing.unit_price_per_location
    into v_staff_operations_unit_price
    from public.staff_operations_addon_pricing pricing
    where pricing.country_code = v_country
      and pricing.currency = v_currency
      and pricing.status = 'active'
      and pricing.effective_from <= now()
    order by pricing.effective_from desc
    limit 1;
    v_staff_operations_unit_price := coalesce(v_staff_operations_unit_price, 0);
    v_staff_operations_total :=
      greatest(v_location_count, 1) * v_staff_operations_unit_price;
  end if;

  if lower(v_plan_slug) = 'chain' then
    select e.allowed_locations into v_current_allowed_locations
    from public.tenant_plan_entitlements e
    where e.tenant_id = p_tenant_id;
    v_current_allowed_locations := coalesce(v_current_allowed_locations, 1);

    select p.id into v_chain_plan_id
    from public.plans p
    where lower(p.slug) = 'chain'
    order by p.is_active desc nulls last, p.created_at desc nulls last
    limit 1;

    select * into v_chain_quote_current
    from public.compute_chain_price(v_chain_plan_id, v_currency, greatest(v_current_allowed_locations, 1))
    limit 1;

    select * into v_chain_quote_base
    from public.compute_chain_price(v_chain_plan_id, v_currency, 1)
    limit 1;

    v_location_addon_price :=
      greatest(coalesce(v_chain_quote_current.total_price, 0) - coalesce(v_chain_quote_base.total_price, 0), 0);
  end if;

  return query
  select
    v_location_addon_price
      + (v_current_extra_seats * v_seat_unit_price)
      + v_staff_operations_total,
    v_currency,
    jsonb_build_object(
      'extra_seats', v_current_extra_seats,
      'seat_unit_price', v_seat_unit_price,
      'seat_addon_total', v_current_extra_seats * v_seat_unit_price,
      'location_addon_total', v_location_addon_price,
      'staff_operations_enabled', v_has_staff_operations,
      'staff_operations_locations', greatest(v_location_count, 1),
      'staff_operations_unit_price', v_staff_operations_unit_price,
      'staff_operations_total', v_staff_operations_total
    );
end;
$$;

grant execute on function public.compute_current_addon_total(uuid) to authenticated;
grant execute on function public.compute_current_addon_total(uuid) to service_role;
