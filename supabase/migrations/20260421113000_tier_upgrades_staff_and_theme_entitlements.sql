-- Tier upgrades, seat add-ons, theme entitlements, and multi-country storefront support.

alter table public.tenant_plan_entitlements
  add column if not exists allowed_staff integer,
  add column if not exists base_staff_per_location integer;

update public.tenant_plan_entitlements
set
  allowed_staff = coalesce(allowed_staff, allowed_locations * 12),
  base_staff_per_location = coalesce(base_staff_per_location, 12)
where allowed_staff is null
   or base_staff_per_location is null;

alter table public.tenant_plan_entitlements
  alter column base_staff_per_location set default 12;

alter table public.tenant_plan_entitlements
  drop constraint if exists tenant_plan_entitlements_allowed_staff_check;

alter table public.tenant_plan_entitlements
  add constraint tenant_plan_entitlements_allowed_staff_check
  check (allowed_staff is null or allowed_staff >= 1);

alter table public.tenant_plan_entitlements
  drop constraint if exists tenant_plan_entitlements_base_staff_per_location_check;

alter table public.tenant_plan_entitlements
  add constraint tenant_plan_entitlements_base_staff_per_location_check
  check (base_staff_per_location >= 1);

-- Normalize current plan limits to the tier defaults described in product.
update public.plan_limits pl
set
  max_locations = case p.slug
    when 'solo' then 1
    when 'studio' then 1
    when 'chain' then 1
    else pl.max_locations
  end,
  max_staff = case p.slug
    when 'solo' then 2
    when 'studio' then 6
    when 'chain' then 12
    else pl.max_staff
  end
from public.plans p
where p.id = pl.plan_id
  and p.slug in ('solo', 'studio', 'chain');

alter table public.tenant_addon_quotes
  add column if not exists addon_type text not null default 'extra_location',
  add column if not exists addon_key text,
  add column if not exists quantity integer not null default 1,
  add column if not exists billing_interval text not null default 'monthly',
  add column if not exists unit_price numeric not null default 0,
  add column if not exists total_price numeric not null default 0,
  add column if not exists status text not null default 'accepted';

update public.tenant_addon_quotes
set
  unit_price = coalesce(nullif(unit_price, 0), unit_price_per_extra_location, 0),
  total_price = coalesce(nullif(total_price, 0), monthly_addon_total, 0)
where unit_price = 0
   or total_price = 0;

alter table public.tenant_addon_quotes
  drop constraint if exists tenant_addon_quotes_addon_type_check;

alter table public.tenant_addon_quotes
  add constraint tenant_addon_quotes_addon_type_check
  check (addon_type in ('extra_location', 'extra_seat', 'theme_ecommerce', 'plan_upgrade'));

alter table public.tenant_addon_quotes
  drop constraint if exists tenant_addon_quotes_billing_interval_check;

alter table public.tenant_addon_quotes
  add constraint tenant_addon_quotes_billing_interval_check
  check (billing_interval in ('monthly', 'annual', 'one_time'));

alter table public.tenant_addon_quotes
  drop constraint if exists tenant_addon_quotes_status_check;

alter table public.tenant_addon_quotes
  add constraint tenant_addon_quotes_status_check
  check (status in ('draft', 'accepted', 'active', 'expired', 'cancelled'));

alter table public.tenant_addon_quotes
  drop constraint if exists tenant_addon_quotes_quantity_check;

alter table public.tenant_addon_quotes
  add constraint tenant_addon_quotes_quantity_check
  check (quantity >= 1);

create index if not exists idx_tenant_addon_quotes_type_created
  on public.tenant_addon_quotes (tenant_id, addon_type, created_at desc);

create table if not exists public.staff_addon_pricing (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
  currency text not null,
  unit_price_per_extra_seat numeric not null,
  effective_from timestamptz not null default now(),
  status text not null default 'active' check (status in ('draft', 'active', 'retired')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_addon_pricing_country_check check (length(trim(country_code)) >= 2),
  constraint staff_addon_pricing_currency_check check (length(trim(currency)) = 3),
  constraint staff_addon_pricing_unit_price_check check (unit_price_per_extra_seat >= 0)
);

create index if not exists idx_staff_addon_pricing_country_currency_status
  on public.staff_addon_pricing (country_code, currency, status, effective_from desc);

drop trigger if exists trg_staff_addon_pricing_updated_at on public.staff_addon_pricing;
create trigger trg_staff_addon_pricing_updated_at
before update on public.staff_addon_pricing
for each row execute function public.update_updated_at_column();

create table if not exists public.theme_catalog (
  id uuid primary key default gen_random_uuid(),
  theme_key text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_theme_catalog_updated_at on public.theme_catalog;
create trigger trg_theme_catalog_updated_at
before update on public.theme_catalog
for each row execute function public.update_updated_at_column();

create table if not exists public.theme_addon_pricing (
  id uuid primary key default gen_random_uuid(),
  theme_key text not null references public.theme_catalog(theme_key) on delete cascade,
  country_code text not null,
  currency text not null,
  billing_interval text not null default 'annual' check (billing_interval in ('annual')),
  unit_price numeric not null,
  effective_from timestamptz not null default now(),
  status text not null default 'active' check (status in ('draft', 'active', 'retired')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint theme_addon_pricing_country_check check (length(trim(country_code)) >= 2),
  constraint theme_addon_pricing_currency_check check (length(trim(currency)) = 3),
  constraint theme_addon_pricing_unit_price_check check (unit_price >= 0)
);

create index if not exists idx_theme_addon_pricing_theme_country_currency_status
  on public.theme_addon_pricing (theme_key, country_code, currency, status, effective_from desc);

drop trigger if exists trg_theme_addon_pricing_updated_at on public.theme_addon_pricing;
create trigger trg_theme_addon_pricing_updated_at
before update on public.theme_addon_pricing
for each row execute function public.update_updated_at_column();

create table if not exists public.tenant_addon_entitlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  addon_type text not null check (addon_type in ('extra_seat', 'theme_ecommerce')),
  addon_key text,
  quantity integer not null default 1 check (quantity >= 1),
  billing_interval text not null check (billing_interval in ('monthly', 'annual')),
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  pricing_id uuid,
  source text not null,
  reason text,
  started_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tenant_addon_entitlements_tenant_type_status
  on public.tenant_addon_entitlements (tenant_id, addon_type, status, created_at desc);

drop trigger if exists trg_tenant_addon_entitlements_updated_at on public.tenant_addon_entitlements;
create trigger trg_tenant_addon_entitlements_updated_at
before update on public.tenant_addon_entitlements
for each row execute function public.update_updated_at_column();

alter table public.staff_addon_pricing enable row level security;
alter table public.theme_catalog enable row level security;
alter table public.theme_addon_pricing enable row level security;
alter table public.tenant_addon_entitlements enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'staff_addon_pricing'
      and policyname = 'Authenticated can read staff addon pricing'
  ) then
    create policy "Authenticated can read staff addon pricing"
      on public.staff_addon_pricing
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'staff_addon_pricing'
      and policyname = 'Backoffice super admins manage staff addon pricing'
  ) then
    create policy "Backoffice super admins manage staff addon pricing"
      on public.staff_addon_pricing
      for all
      to authenticated
      using (has_backoffice_role(auth.uid(), 'super_admin'::public.backoffice_role))
      with check (has_backoffice_role(auth.uid(), 'super_admin'::public.backoffice_role));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'theme_catalog'
      and policyname = 'Authenticated can read theme catalog'
  ) then
    create policy "Authenticated can read theme catalog"
      on public.theme_catalog
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'theme_catalog'
      and policyname = 'Backoffice super admins manage theme catalog'
  ) then
    create policy "Backoffice super admins manage theme catalog"
      on public.theme_catalog
      for all
      to authenticated
      using (has_backoffice_role(auth.uid(), 'super_admin'::public.backoffice_role))
      with check (has_backoffice_role(auth.uid(), 'super_admin'::public.backoffice_role));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'theme_addon_pricing'
      and policyname = 'Authenticated can read theme addon pricing'
  ) then
    create policy "Authenticated can read theme addon pricing"
      on public.theme_addon_pricing
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'theme_addon_pricing'
      and policyname = 'Backoffice super admins manage theme addon pricing'
  ) then
    create policy "Backoffice super admins manage theme addon pricing"
      on public.theme_addon_pricing
      for all
      to authenticated
      using (has_backoffice_role(auth.uid(), 'super_admin'::public.backoffice_role))
      with check (has_backoffice_role(auth.uid(), 'super_admin'::public.backoffice_role));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tenant_addon_entitlements'
      and policyname = 'Tenant members can read addon entitlements'
  ) then
    create policy "Tenant members can read addon entitlements"
      on public.tenant_addon_entitlements
      for select
      to authenticated
      using (belongs_to_tenant(auth.uid(), tenant_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tenant_addon_entitlements'
      and policyname = 'Backoffice users can read addon entitlements'
  ) then
    create policy "Backoffice users can read addon entitlements"
      on public.tenant_addon_entitlements
      for select
      to authenticated
      using (is_backoffice_user(auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tenant_addon_entitlements'
      and policyname = 'Backoffice super admins manage addon entitlements'
  ) then
    create policy "Backoffice super admins manage addon entitlements"
      on public.tenant_addon_entitlements
      for all
      to authenticated
      using (has_backoffice_role(auth.uid(), 'super_admin'::public.backoffice_role))
      with check (has_backoffice_role(auth.uid(), 'super_admin'::public.backoffice_role));
  end if;
end $$;

insert into public.theme_catalog (theme_key, name, description, is_active)
values ('ecommerce', 'E-commerce', 'A commerce-focused public booking theme for storefront-style salons.', true)
on conflict (theme_key) do update
set
  name = excluded.name,
  description = excluded.description,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.staff_addon_pricing (country_code, currency, unit_price_per_extra_seat, status, notes)
values
  ('US', 'USD', 5, 'active', 'Default per-seat monthly add-on'),
  ('NG', 'NGN', 4000, 'active', 'Default per-seat monthly add-on'),
  ('GH', 'GHS', 60, 'active', 'Default per-seat monthly add-on')
on conflict do nothing;

insert into public.theme_addon_pricing (theme_key, country_code, currency, billing_interval, unit_price, status, notes)
values
  ('ecommerce', 'US', 'USD', 'annual', 120, 'active', 'Default annual e-commerce theme add-on'),
  ('ecommerce', 'NG', 'NGN', 'annual', 96000, 'active', 'Default annual e-commerce theme add-on'),
  ('ecommerce', 'GH', 'GHS', 'annual', 1440, 'active', 'Default annual e-commerce theme add-on')
on conflict do nothing;

create or replace function public.get_tenant_runtime_entitlements(
  p_tenant_id uuid
)
returns table (
  tenant_id uuid,
  plan_slug text,
  used_locations integer,
  allowed_locations integer,
  used_staff integer,
  base_staff_limit integer,
  extra_staff_seats integer,
  allowed_staff integer,
  has_ecommerce_theme boolean,
  ecommerce_theme_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_plan_slug text;
  v_plan_id uuid;
  v_plan_max_locations integer := 1;
  v_plan_max_staff integer := 1;
  v_used_locations integer := 0;
  v_allowed_locations integer := 1;
  v_used_staff integer := 0;
  v_base_staff_limit integer := 1;
  v_extra_staff_seats integer := 0;
  v_allowed_staff integer := 1;
  v_theme_expiry timestamptz;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not (belongs_to_tenant(v_actor, p_tenant_id) or is_backoffice_user(v_actor)) then
    raise exception 'TENANT_ACCESS_DENIED';
  end if;

  select p.id, p.slug
  into v_plan_id, v_plan_slug
  from public.tenants t
  join public.plans p on lower(p.slug) = lower(t.plan::text)
  where t.id = p_tenant_id
  order by p.is_active desc nulls last, p.created_at desc nulls last
  limit 1;

  if v_plan_slug is null then
    raise exception 'TENANT_NOT_FOUND';
  end if;

  select coalesce(pl.max_locations, 1), coalesce(pl.max_staff, 1)
  into v_plan_max_locations, v_plan_max_staff
  from public.plan_limits pl
  where pl.plan_id = v_plan_id;

  select count(*)::integer
  into v_used_locations
  from public.locations
  where tenant_id = p_tenant_id;

  if lower(v_plan_slug) = 'chain' then
    select coalesce(e.allowed_locations, greatest(v_plan_max_locations, 1))
    into v_allowed_locations
    from public.tenant_plan_entitlements e
    where e.tenant_id = p_tenant_id;

    v_allowed_locations := coalesce(v_allowed_locations, greatest(v_plan_max_locations, 1));
    v_base_staff_limit := greatest(coalesce(v_plan_max_staff, 12), 1) * greatest(v_used_locations, 1);
  else
    v_allowed_locations := greatest(v_plan_max_locations, 1);
    v_base_staff_limit := greatest(v_plan_max_staff, 1);
  end if;

  select count(distinct ur.user_id)::integer
  into v_used_staff
  from public.user_roles ur
  where ur.tenant_id = p_tenant_id
    and coalesce(ur.is_active, true) = true;

  select coalesce(sum(tae.quantity), 0)::integer
  into v_extra_staff_seats
  from public.tenant_addon_entitlements tae
  where tae.tenant_id = p_tenant_id
    and tae.addon_type = 'extra_seat'
    and tae.status = 'active'
    and (tae.ends_at is null or tae.ends_at > now());

  select max(tae.ends_at)
  into v_theme_expiry
  from public.tenant_addon_entitlements tae
  where tae.tenant_id = p_tenant_id
    and tae.addon_type = 'theme_ecommerce'
    and tae.status = 'active'
    and (tae.ends_at is null or tae.ends_at > now());

  v_allowed_staff := v_base_staff_limit + v_extra_staff_seats;

  return query
  select
    p_tenant_id,
    v_plan_slug,
    v_used_locations,
    v_allowed_locations,
    v_used_staff,
    v_base_staff_limit,
    v_extra_staff_seats,
    v_allowed_staff,
    v_theme_expiry is not null,
    v_theme_expiry;
end;
$$;

grant execute on function public.get_tenant_runtime_entitlements(uuid) to authenticated;

create or replace function public.assert_tenant_can_add_staff(
  p_tenant_id uuid
)
returns table (
  plan_slug text,
  allowed integer,
  used integer,
  can_add boolean,
  required_plan text,
  addon_type text,
  unit_price numeric,
  currency text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_plan_slug text;
  v_allowed integer := 1;
  v_used integer := 0;
  v_currency text := 'USD';
  v_country text := 'US';
  v_unit_price numeric := 0;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not (belongs_to_tenant(v_actor, p_tenant_id) or is_backoffice_user(v_actor)) then
    raise exception 'TENANT_ACCESS_DENIED';
  end if;

  select t.currency, t.country
  into v_currency, v_country
  from public.tenants t
  where t.id = p_tenant_id;

  select rte.plan_slug, rte.allowed_staff, rte.used_staff
  into v_plan_slug, v_allowed, v_used
  from public.get_tenant_runtime_entitlements(p_tenant_id) rte
  limit 1;

  select sap.unit_price_per_extra_seat
  into v_unit_price
  from public.staff_addon_pricing sap
  where upper(sap.country_code) = upper(coalesce(v_country, 'US'))
    and upper(sap.currency) = upper(coalesce(v_currency, 'USD'))
    and sap.status = 'active'
    and sap.effective_from <= now()
  order by sap.effective_from desc, sap.created_at desc
  limit 1;

  return query
  select
    v_plan_slug,
    v_allowed,
    v_used,
    v_used < v_allowed,
    case when v_used < v_allowed then null when lower(v_plan_slug) = 'solo' then 'studio' else null end,
    case
      when v_used < v_allowed then null
      when lower(v_plan_slug) = 'solo' then 'plan_upgrade'
      else 'extra_seat'
    end,
    coalesce(v_unit_price, 0),
    upper(coalesce(v_currency, 'USD'));
end;
$$;

grant execute on function public.assert_tenant_can_add_staff(uuid) to authenticated;

create or replace function public.purchase_tenant_extra_seats_and_log_billing(
  p_tenant_id uuid,
  p_quantity integer,
  p_source text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_plan_slug text;
  v_currency text;
  v_country text;
  v_unit_price numeric := 0;
  v_total numeric := 0;
  v_entitlement_id uuid;
  v_runtime record;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_quantity is null or p_quantity < 1 then
    raise exception 'EXTRA_SEAT_QUANTITY_INVALID';
  end if;

  if not (public.is_tenant_owner(v_actor, p_tenant_id) or has_backoffice_role(v_actor, 'super_admin'::public.backoffice_role)) then
    raise exception 'EXTRA_SEAT_PURCHASE_FORBIDDEN';
  end if;

  select t.plan::text, t.currency, t.country
  into v_plan_slug, v_currency, v_country
  from public.tenants t
  where t.id = p_tenant_id;

  if v_plan_slug is null then
    raise exception 'TENANT_NOT_FOUND';
  end if;

  if lower(v_plan_slug) not in ('studio', 'chain') then
    raise exception 'EXTRA_SEATS_REQUIRE_STUDIO_OR_CHAIN';
  end if;

  select sap.unit_price_per_extra_seat
  into v_unit_price
  from public.staff_addon_pricing sap
  where upper(sap.country_code) = upper(coalesce(v_country, 'US'))
    and upper(sap.currency) = upper(coalesce(v_currency, 'USD'))
    and sap.status = 'active'
    and sap.effective_from <= now()
  order by sap.effective_from desc, sap.created_at desc
  limit 1;

  v_unit_price := coalesce(v_unit_price, 0);
  v_total := v_unit_price * p_quantity;

  insert into public.tenant_addon_entitlements (
    tenant_id,
    addon_type,
    quantity,
    billing_interval,
    status,
    source,
    reason,
    created_by,
    started_at
  )
  values (
    p_tenant_id,
    'extra_seat',
    p_quantity,
    'monthly',
    'active',
    p_source,
    p_reason,
    v_actor,
    now()
  )
  returning id into v_entitlement_id;

  insert into public.tenant_addon_quotes (
    tenant_id,
    country_code,
    currency,
    included_locations,
    active_locations,
    extra_locations,
    unit_price_per_extra_location,
    monthly_addon_total,
    snapshot,
    accepted_by,
    accepted_at,
    addon_type,
    quantity,
    billing_interval,
    unit_price,
    total_price,
    status
  )
  values (
    p_tenant_id,
    upper(coalesce(v_country, 'US')),
    upper(coalesce(v_currency, 'USD')),
    1,
    1,
    0,
    0,
    v_total,
    jsonb_build_object(
      'reason', p_reason,
      'source', p_source,
      'entitlement_id', v_entitlement_id
    ),
    v_actor,
    now(),
    'extra_seat',
    p_quantity,
    'monthly',
    v_unit_price,
    v_total,
    'active'
  );

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
    'tenant_extra_seats_purchased',
    'tenant_addon_entitlement',
    v_entitlement_id,
    jsonb_build_object(
      'quantity', p_quantity,
      'unit_price', v_unit_price,
      'total_price', v_total,
      'source', p_source,
      'reason', p_reason
    )
  );

  select * into v_runtime
  from public.get_tenant_runtime_entitlements(p_tenant_id)
  limit 1;

  return jsonb_build_object(
    'success', true,
    'entitlement_id', v_entitlement_id,
    'quantity', p_quantity,
    'unit_price', v_unit_price,
    'total_price', v_total,
    'allowed_staff', v_runtime.allowed_staff,
    'used_staff', v_runtime.used_staff
  );
end;
$$;

grant execute on function public.purchase_tenant_extra_seats_and_log_billing(uuid, integer, text, text) to authenticated;

create or replace function public.purchase_tenant_theme_addon_and_log_billing(
  p_tenant_id uuid,
  p_theme_key text default 'ecommerce',
  p_source text default 'settings_subscription',
  p_reason text default 'Tenant purchased annual storefront theme.'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_currency text;
  v_country text;
  v_unit_price numeric := 0;
  v_entitlement_id uuid;
  v_theme_key text := lower(coalesce(nullif(btrim(p_theme_key), ''), 'ecommerce'));
  v_ends_at timestamptz := now() + interval '1 year';
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not (public.is_tenant_owner(v_actor, p_tenant_id) or has_backoffice_role(v_actor, 'super_admin'::public.backoffice_role)) then
    raise exception 'THEME_PURCHASE_FORBIDDEN';
  end if;

  if not exists (
    select 1
    from public.theme_catalog tc
    where lower(tc.theme_key) = v_theme_key
      and tc.is_active = true
  ) then
    raise exception 'THEME_NOT_FOUND';
  end if;

  select t.currency, t.country
  into v_currency, v_country
  from public.tenants t
  where t.id = p_tenant_id;

  select tap.unit_price
  into v_unit_price
  from public.theme_addon_pricing tap
  where lower(tap.theme_key) = v_theme_key
    and upper(tap.country_code) = upper(coalesce(v_country, 'US'))
    and upper(tap.currency) = upper(coalesce(v_currency, 'USD'))
    and tap.status = 'active'
    and tap.effective_from <= now()
  order by tap.effective_from desc, tap.created_at desc
  limit 1;

  v_unit_price := coalesce(v_unit_price, 0);

  update public.tenant_addon_entitlements
  set status = 'expired', ends_at = now(), updated_at = now()
  where tenant_id = p_tenant_id
    and addon_type = 'theme_ecommerce'
    and status = 'active';

  insert into public.tenant_addon_entitlements (
    tenant_id,
    addon_type,
    addon_key,
    quantity,
    billing_interval,
    status,
    source,
    reason,
    started_at,
    ends_at,
    created_by
  )
  values (
    p_tenant_id,
    'theme_ecommerce',
    v_theme_key,
    1,
    'annual',
    'active',
    p_source,
    p_reason,
    now(),
    v_ends_at,
    v_actor
  )
  returning id into v_entitlement_id;

  insert into public.tenant_addon_quotes (
    tenant_id,
    country_code,
    currency,
    included_locations,
    active_locations,
    extra_locations,
    unit_price_per_extra_location,
    monthly_addon_total,
    snapshot,
    accepted_by,
    accepted_at,
    addon_type,
    addon_key,
    quantity,
    billing_interval,
    unit_price,
    total_price,
    status
  )
  values (
    p_tenant_id,
    upper(coalesce(v_country, 'US')),
    upper(coalesce(v_currency, 'USD')),
    1,
    1,
    0,
    0,
    v_unit_price,
    jsonb_build_object(
      'reason', p_reason,
      'source', p_source,
      'theme_key', v_theme_key,
      'entitlement_id', v_entitlement_id
    ),
    v_actor,
    now(),
    'theme_ecommerce',
    v_theme_key,
    1,
    'annual',
    v_unit_price,
    v_unit_price,
    'active'
  );

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
    'tenant_theme_purchased',
    'tenant_addon_entitlement',
    v_entitlement_id,
    jsonb_build_object(
      'theme_key', v_theme_key,
      'unit_price', v_unit_price,
      'billing_interval', 'annual',
      'expires_at', v_ends_at,
      'source', p_source,
      'reason', p_reason
    )
  );

  return jsonb_build_object(
    'success', true,
    'theme_key', v_theme_key,
    'expires_at', v_ends_at,
    'unit_price', v_unit_price
  );
end;
$$;

grant execute on function public.purchase_tenant_theme_addon_and_log_billing(uuid, text, text, text) to authenticated;

create or replace function public.upgrade_tenant_plan_and_log_billing(
  p_tenant_id uuid,
  p_target_plan text,
  p_source text,
  p_reason text,
  p_seed_allowed_locations integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_current_plan text;
  v_target_plan text := lower(btrim(p_target_plan));
  v_target_plan_id uuid;
  v_currency text;
  v_country text;
  v_used_locations integer := 0;
  v_allowed_locations integer := 1;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not (public.is_tenant_owner(v_actor, p_tenant_id) or has_backoffice_role(v_actor, 'super_admin'::public.backoffice_role)) then
    raise exception 'PLAN_UPGRADE_FORBIDDEN';
  end if;

  if v_target_plan not in ('studio', 'chain') then
    raise exception 'TARGET_PLAN_INVALID';
  end if;

  select t.plan::text, t.currency, t.country
  into v_current_plan, v_currency, v_country
  from public.tenants t
  where t.id = p_tenant_id;

  if v_current_plan is null then
    raise exception 'TENANT_NOT_FOUND';
  end if;

  select p.id
  into v_target_plan_id
  from public.plans p
  where lower(p.slug) = v_target_plan
  order by p.is_active desc nulls last, p.created_at desc nulls last
  limit 1;

  if v_target_plan_id is null then
    raise exception 'TARGET_PLAN_NOT_FOUND';
  end if;

  select count(*)::integer into v_used_locations
  from public.locations
  where tenant_id = p_tenant_id;

  update public.tenants
  set plan = v_target_plan::public.subscription_plan,
      updated_at = now()
  where id = p_tenant_id;

  if v_target_plan = 'chain' then
    v_allowed_locations := greatest(coalesce(p_seed_allowed_locations, v_used_locations, 2), v_used_locations, 2);

    insert into public.tenant_plan_entitlements (
      tenant_id,
      plan_id,
      allowed_locations,
      allowed_staff,
      base_staff_per_location,
      source,
      reason,
      updated_by
    )
    values (
      p_tenant_id,
      v_target_plan_id,
      v_allowed_locations,
      12 * greatest(v_allowed_locations, 1),
      12,
      p_source,
      p_reason,
      v_actor
    )
    on conflict (tenant_id)
    do update set
      plan_id = excluded.plan_id,
      allowed_locations = excluded.allowed_locations,
      allowed_staff = excluded.allowed_staff,
      base_staff_per_location = excluded.base_staff_per_location,
      source = excluded.source,
      reason = excluded.reason,
      updated_by = excluded.updated_by,
      updated_at = now();
  end if;

  insert into public.tenant_addon_quotes (
    tenant_id,
    country_code,
    currency,
    included_locations,
    active_locations,
    extra_locations,
    unit_price_per_extra_location,
    monthly_addon_total,
    snapshot,
    accepted_by,
    accepted_at,
    addon_type,
    addon_key,
    quantity,
    billing_interval,
    unit_price,
    total_price,
    status
  )
  values (
    p_tenant_id,
    upper(coalesce(v_country, 'US')),
    upper(coalesce(v_currency, 'USD')),
    1,
    greatest(v_used_locations, 1),
    greatest(greatest(coalesce(p_seed_allowed_locations, v_used_locations, 1), 1) - 1, 0),
    0,
    0,
    jsonb_build_object(
      'from_plan', v_current_plan,
      'to_plan', v_target_plan,
      'source', p_source,
      'reason', p_reason
    ),
    v_actor,
    now(),
    'plan_upgrade',
    v_target_plan,
    1,
    'monthly',
    0,
    0,
    'accepted'
  );

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
    'tenant_plan_upgraded',
    'tenant',
    p_tenant_id,
    jsonb_build_object(
      'from_plan', v_current_plan,
      'to_plan', v_target_plan,
      'seed_allowed_locations', case when v_target_plan = 'chain' then v_allowed_locations else null end,
      'source', p_source,
      'reason', p_reason
    )
  );

  return jsonb_build_object(
    'success', true,
    'from_plan', v_current_plan,
    'to_plan', v_target_plan,
    'allowed_locations', case when v_target_plan = 'chain' then v_allowed_locations else null end
  );
end;
$$;

grant execute on function public.upgrade_tenant_plan_and_log_billing(uuid, text, text, text, integer) to authenticated;

create or replace function public.assert_tenant_can_add_location(
  p_tenant_id uuid
)
returns table (
  allowed integer,
  used integer,
  can_add boolean,
  requires_custom boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_plan_slug text;
  v_plan_limit integer := 1;
  v_allowed integer := 1;
  v_used integer := 0;
begin
  if v_actor_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not (belongs_to_tenant(v_actor_user_id, p_tenant_id) or is_backoffice_user(v_actor_user_id)) then
    raise exception 'TENANT_ACCESS_DENIED';
  end if;

  select t.plan::text
  into v_plan_slug
  from public.tenants t
  where t.id = p_tenant_id;

  if v_plan_slug is null then
    raise exception 'TENANT_NOT_FOUND';
  end if;

  select count(*)::integer
  into v_used
  from public.locations
  where tenant_id = p_tenant_id;

  if lower(v_plan_slug) = 'chain' then
    select rte.allowed_locations
    into v_allowed
    from public.get_tenant_runtime_entitlements(p_tenant_id) rte
    limit 1;

    v_allowed := coalesce(v_allowed, 1);

    return query
      select
        v_allowed,
        v_used,
        (v_used < v_allowed),
        (v_used + 1 > 10);
    return;
  end if;

  select coalesce(pl.max_locations, 1)
  into v_plan_limit
  from public.plans p
  join public.plan_limits pl on pl.plan_id = p.id
  where lower(p.slug) = lower(v_plan_slug)
  order by p.is_active desc, p.created_at desc
  limit 1;

  return query
    select
      v_plan_limit,
      v_used,
      (v_used < v_plan_limit),
      false;
end;
$$;

grant execute on function public.assert_tenant_can_add_location(uuid) to authenticated;

create or replace function public.set_staff_active_status(
  p_tenant_id uuid,
  p_user_id uuid,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role public.app_role;
  v_target_role_row_id uuid;
  v_staff_gate record;
begin
  if v_actor is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select ur.role
    into v_actor_role
  from public.user_roles ur
  where ur.user_id = v_actor
    and ur.tenant_id = p_tenant_id
    and coalesce(ur.is_active, true) = true
  order by case ur.role
    when 'owner' then 1
    when 'manager' then 2
    when 'supervisor' then 3
    when 'receptionist' then 4
    else 5
  end,
  ur.created_at desc,
  ur.id desc
  limit 1;

  if v_actor_role not in ('owner', 'manager') then
    raise exception 'STAFF_STATUS_UPDATE_FORBIDDEN';
  end if;

  if not exists (
    select 1
    from public.user_roles ur
    where ur.tenant_id = p_tenant_id
      and ur.user_id = p_user_id
  ) then
    raise exception 'TARGET_USER_NOT_IN_TENANT';
  end if;

  if exists (
    select 1
    from public.user_roles ur
    where ur.tenant_id = p_tenant_id
      and ur.user_id = p_user_id
      and ur.role = 'owner'::public.app_role
  ) then
    raise exception 'OWNER_ROLE_IMMUTABLE';
  end if;

  if p_is_active then
    select * into v_staff_gate
    from public.assert_tenant_can_add_staff(p_tenant_id)
    limit 1;

    if not coalesce(v_staff_gate.can_add, false) then
      if lower(coalesce(v_staff_gate.required_plan, '')) = 'studio' then
        raise exception 'Studio upgrade required before reactivating another staff member.';
      end if;

      raise exception 'No staff seats available. Purchase an extra seat in Subscription before reactivating this team member.';
    end if;

    select ur.id
      into v_target_role_row_id
    from public.user_roles ur
    where ur.tenant_id = p_tenant_id
      and ur.user_id = p_user_id
    order by ur.created_at desc, ur.id desc
    limit 1;

    if v_target_role_row_id is null then
      raise exception 'TARGET_ROLE_ROW_NOT_FOUND';
    end if;

    update public.user_roles
    set is_active = false
    where tenant_id = p_tenant_id
      and user_id = p_user_id
      and id <> v_target_role_row_id;

    update public.user_roles
    set is_active = true
    where id = v_target_role_row_id;

    return;
  end if;

  update public.user_roles
  set is_active = false
  where tenant_id = p_tenant_id
    and user_id = p_user_id;
end;
$$;

grant execute on function public.set_staff_active_status(uuid, uuid, boolean) to authenticated;

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
