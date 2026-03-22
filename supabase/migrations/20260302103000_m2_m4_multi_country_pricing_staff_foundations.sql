-- M2-M4 foundations:
-- - M2 multi-country booking availability mapping tables
-- - M3 chain add-on pricing/quote snapshots
-- - M4 staff-service mapping and booking staff-selection settings

begin;

-- ---------------------------------------------------------------------------
-- M2: Location-derived catalog and voucher availability tables
-- ---------------------------------------------------------------------------

create table if not exists public.service_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  is_enabled boolean not null default true,
  price_override numeric null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_locations_price_override_check check (price_override is null or price_override >= 0),
  constraint service_locations_unique unique (service_id, location_id)
);

create index if not exists idx_service_locations_tenant_location
  on public.service_locations (tenant_id, location_id, is_enabled);

create index if not exists idx_service_locations_tenant_service
  on public.service_locations (tenant_id, service_id, is_enabled);

create table if not exists public.product_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  is_enabled boolean not null default true,
  price_override numeric null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_locations_price_override_check check (price_override is null or price_override >= 0),
  constraint product_locations_unique unique (product_id, location_id)
);

create index if not exists idx_product_locations_tenant_location
  on public.product_locations (tenant_id, location_id, is_enabled);

create index if not exists idx_product_locations_tenant_product
  on public.product_locations (tenant_id, product_id, is_enabled);

create table if not exists public.package_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  package_id uuid not null references public.packages(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  is_enabled boolean not null default true,
  price_override numeric null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint package_locations_price_override_check check (price_override is null or price_override >= 0),
  constraint package_locations_unique unique (package_id, location_id)
);

create index if not exists idx_package_locations_tenant_location
  on public.package_locations (tenant_id, location_id, is_enabled);

create index if not exists idx_package_locations_tenant_package
  on public.package_locations (tenant_id, package_id, is_enabled);

create table if not exists public.voucher_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  voucher_id uuid not null references public.vouchers(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voucher_locations_unique unique (voucher_id, location_id)
);

create index if not exists idx_voucher_locations_tenant_location
  on public.voucher_locations (tenant_id, location_id, is_enabled);

create index if not exists idx_voucher_locations_tenant_voucher
  on public.voucher_locations (tenant_id, voucher_id, is_enabled);

-- Keep timestamps fresh for all new mapping tables.
drop trigger if exists trg_service_locations_updated_at on public.service_locations;
create trigger trg_service_locations_updated_at
before update on public.service_locations
for each row execute function public.update_updated_at_column();

drop trigger if exists trg_product_locations_updated_at on public.product_locations;
create trigger trg_product_locations_updated_at
before update on public.product_locations
for each row execute function public.update_updated_at_column();

drop trigger if exists trg_package_locations_updated_at on public.package_locations;
create trigger trg_package_locations_updated_at
before update on public.package_locations
for each row execute function public.update_updated_at_column();

drop trigger if exists trg_voucher_locations_updated_at on public.voucher_locations;
create trigger trg_voucher_locations_updated_at
before update on public.voucher_locations
for each row execute function public.update_updated_at_column();

alter table public.service_locations enable row level security;
alter table public.product_locations enable row level security;
alter table public.package_locations enable row level security;
alter table public.voucher_locations enable row level security;

-- Tenant members can manage mapping rows in their tenant.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'service_locations'
      and policyname = 'Users can manage service location mappings in tenant'
  ) then
    create policy "Users can manage service location mappings in tenant"
      on public.service_locations
      for all
      to authenticated
      using (belongs_to_tenant(auth.uid(), tenant_id))
      with check (belongs_to_tenant(auth.uid(), tenant_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'product_locations'
      and policyname = 'Users can manage product location mappings in tenant'
  ) then
    create policy "Users can manage product location mappings in tenant"
      on public.product_locations
      for all
      to authenticated
      using (belongs_to_tenant(auth.uid(), tenant_id))
      with check (belongs_to_tenant(auth.uid(), tenant_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'package_locations'
      and policyname = 'Users can manage package location mappings in tenant'
  ) then
    create policy "Users can manage package location mappings in tenant"
      on public.package_locations
      for all
      to authenticated
      using (belongs_to_tenant(auth.uid(), tenant_id))
      with check (belongs_to_tenant(auth.uid(), tenant_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'voucher_locations'
      and policyname = 'Users can manage voucher location mappings in tenant'
  ) then
    create policy "Users can manage voucher location mappings in tenant"
      on public.voucher_locations
      for all
      to authenticated
      using (belongs_to_tenant(auth.uid(), tenant_id))
      with check (belongs_to_tenant(auth.uid(), tenant_id));
  end if;
end $$;

-- Public booking reads only for online-booking-enabled tenants.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'service_locations'
      and policyname = 'Anon can read service location mappings for booking'
  ) then
    create policy "Anon can read service location mappings for booking"
      on public.service_locations
      for select
      to anon, authenticated
      using (
        tenant_id in (
          select id
          from public.tenants
          where online_booking_enabled = true
            and slug is not null
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'product_locations'
      and policyname = 'Anon can read product location mappings for booking'
  ) then
    create policy "Anon can read product location mappings for booking"
      on public.product_locations
      for select
      to anon, authenticated
      using (
        tenant_id in (
          select id
          from public.tenants
          where online_booking_enabled = true
            and slug is not null
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'package_locations'
      and policyname = 'Anon can read package location mappings for booking'
  ) then
    create policy "Anon can read package location mappings for booking"
      on public.package_locations
      for select
      to anon, authenticated
      using (
        tenant_id in (
          select id
          from public.tenants
          where online_booking_enabled = true
            and slug is not null
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'voucher_locations'
      and policyname = 'Anon can read voucher location mappings for booking'
  ) then
    create policy "Anon can read voucher location mappings for booking"
      on public.voucher_locations
      for select
      to anon, authenticated
      using (
        tenant_id in (
          select id
          from public.tenants
          where online_booking_enabled = true
            and slug is not null
        )
      );
  end if;
end $$;

-- Backfill mapping tables from active catalog items + open locations.
insert into public.service_locations (tenant_id, service_id, location_id, is_enabled)
select s.tenant_id, s.id, l.id, true
from public.services s
join public.locations l
  on l.tenant_id = s.tenant_id
where s.status = 'active'
  and s.deleted_at is null
  and l.availability = 'open'
on conflict (service_id, location_id) do nothing;

insert into public.product_locations (tenant_id, product_id, location_id, is_enabled)
select p.tenant_id, p.id, l.id, true
from public.products p
join public.locations l
  on l.tenant_id = p.tenant_id
where p.status = 'active'
  and p.deleted_at is null
  and l.availability = 'open'
on conflict (product_id, location_id) do nothing;

insert into public.package_locations (tenant_id, package_id, location_id, is_enabled)
select p.tenant_id, p.id, l.id, true
from public.packages p
join public.locations l
  on l.tenant_id = p.tenant_id
where p.status = 'active'
  and p.deleted_at is null
  and l.availability = 'open'
on conflict (package_id, location_id) do nothing;

insert into public.voucher_locations (tenant_id, voucher_id, location_id, is_enabled)
select v.tenant_id, v.id, l.id, true
from public.vouchers v
join public.locations l
  on l.tenant_id = v.tenant_id
where v.status = 'active'
  and v.deleted_at is null
  and l.availability = 'open'
on conflict (voucher_id, location_id) do nothing;

-- ---------------------------------------------------------------------------
-- M3: Chain add-on pricing/quote foundations
-- ---------------------------------------------------------------------------

create table if not exists public.chain_addon_pricing (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
  currency text not null,
  unit_price_per_extra_location numeric not null,
  effective_from timestamptz not null default now(),
  status text not null default 'active' check (status in ('draft', 'active', 'retired')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chain_addon_pricing_country_code_check check (length(trim(country_code)) >= 2),
  constraint chain_addon_pricing_currency_check check (length(trim(currency)) = 3),
  constraint chain_addon_pricing_unit_price_check check (unit_price_per_extra_location >= 0)
);

create index if not exists idx_chain_addon_pricing_country_currency_status
  on public.chain_addon_pricing (country_code, currency, status, effective_from desc);

drop trigger if exists trg_chain_addon_pricing_updated_at on public.chain_addon_pricing;
create trigger trg_chain_addon_pricing_updated_at
before update on public.chain_addon_pricing
for each row execute function public.update_updated_at_column();

create table if not exists public.chain_addon_pricing_history (
  id uuid primary key default gen_random_uuid(),
  pricing_id uuid not null references public.chain_addon_pricing(id) on delete cascade,
  changed_by uuid references auth.users(id) on delete set null,
  change_type text not null,
  old_values jsonb,
  new_values jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_chain_addon_pricing_history_pricing_created
  on public.chain_addon_pricing_history (pricing_id, created_at desc);

create table if not exists public.tenant_addon_quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  country_code text not null,
  currency text not null,
  included_locations integer not null default 1,
  active_locations integer not null default 1,
  extra_locations integer not null default 0,
  unit_price_per_extra_location numeric not null default 0,
  monthly_addon_total numeric not null default 0,
  pricing_id uuid references public.chain_addon_pricing(id) on delete set null,
  snapshot jsonb not null default '{}'::jsonb,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_addon_quotes_counts_check check (
    included_locations >= 1
    and active_locations >= 1
    and extra_locations >= 0
  ),
  constraint tenant_addon_quotes_prices_check check (
    unit_price_per_extra_location >= 0
    and monthly_addon_total >= 0
  )
);

create index if not exists idx_tenant_addon_quotes_tenant_created
  on public.tenant_addon_quotes (tenant_id, created_at desc);

create index if not exists idx_tenant_addon_quotes_pricing
  on public.tenant_addon_quotes (pricing_id);

drop trigger if exists trg_tenant_addon_quotes_updated_at on public.tenant_addon_quotes;
create trigger trg_tenant_addon_quotes_updated_at
before update on public.tenant_addon_quotes
for each row execute function public.update_updated_at_column();

alter table public.chain_addon_pricing enable row level security;
alter table public.chain_addon_pricing_history enable row level security;
alter table public.tenant_addon_quotes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'chain_addon_pricing'
      and policyname = 'Backoffice users can read chain addon pricing'
  ) then
    create policy "Backoffice users can read chain addon pricing"
      on public.chain_addon_pricing
      for select
      to authenticated
      using (is_backoffice_user(auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'chain_addon_pricing'
      and policyname = 'Backoffice super admins manage chain addon pricing'
  ) then
    create policy "Backoffice super admins manage chain addon pricing"
      on public.chain_addon_pricing
      for all
      to authenticated
      using (has_backoffice_role(auth.uid(), 'super_admin'::public.backoffice_role))
      with check (has_backoffice_role(auth.uid(), 'super_admin'::public.backoffice_role));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'chain_addon_pricing_history'
      and policyname = 'Backoffice users can read chain addon pricing history'
  ) then
    create policy "Backoffice users can read chain addon pricing history"
      on public.chain_addon_pricing_history
      for select
      to authenticated
      using (is_backoffice_user(auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'chain_addon_pricing_history'
      and policyname = 'Backoffice super admins write chain addon pricing history'
  ) then
    create policy "Backoffice super admins write chain addon pricing history"
      on public.chain_addon_pricing_history
      for insert
      to authenticated
      with check (has_backoffice_role(auth.uid(), 'super_admin'::public.backoffice_role));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tenant_addon_quotes'
      and policyname = 'Tenant members can read tenant addon quotes'
  ) then
    create policy "Tenant members can read tenant addon quotes"
      on public.tenant_addon_quotes
      for select
      to authenticated
      using (belongs_to_tenant(auth.uid(), tenant_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tenant_addon_quotes'
      and policyname = 'Tenant members can create tenant addon quotes'
  ) then
    create policy "Tenant members can create tenant addon quotes"
      on public.tenant_addon_quotes
      for insert
      to authenticated
      with check (belongs_to_tenant(auth.uid(), tenant_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tenant_addon_quotes'
      and policyname = 'Tenant members can update tenant addon quotes'
  ) then
    create policy "Tenant members can update tenant addon quotes"
      on public.tenant_addon_quotes
      for update
      to authenticated
      using (belongs_to_tenant(auth.uid(), tenant_id))
      with check (belongs_to_tenant(auth.uid(), tenant_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tenant_addon_quotes'
      and policyname = 'Backoffice users can read tenant addon quotes'
  ) then
    create policy "Backoffice users can read tenant addon quotes"
      on public.tenant_addon_quotes
      for select
      to authenticated
      using (is_backoffice_user(auth.uid()));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- M4: Staff-service mapping + booking staff selection controls
-- ---------------------------------------------------------------------------

alter table public.tenants
  add column if not exists allow_staff_selection boolean not null default true,
  add column if not exists require_staff_selection boolean not null default false,
  add column if not exists auto_assign_staff boolean not null default true;

alter table public.tenants
  drop constraint if exists tenants_require_staff_selection_requires_allow;

alter table public.tenants
  add constraint tenants_require_staff_selection_requires_allow
    check (require_staff_selection = false or allow_staff_selection = true);

create table if not exists public.staff_service_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  staff_user_id uuid not null,
  category_id uuid not null references public.service_categories(id) on delete cascade,
  location_id uuid null references public.locations(id) on delete cascade,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_service_categories_unique unique (staff_user_id, category_id, location_id)
);

create index if not exists idx_staff_service_categories_tenant_staff
  on public.staff_service_categories (tenant_id, staff_user_id, is_enabled);

create index if not exists idx_staff_service_categories_tenant_category
  on public.staff_service_categories (tenant_id, category_id, is_enabled);

create table if not exists public.staff_services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  staff_user_id uuid not null,
  service_id uuid not null references public.services(id) on delete cascade,
  location_id uuid null references public.locations(id) on delete cascade,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_services_unique unique (staff_user_id, service_id, location_id)
);

create index if not exists idx_staff_services_tenant_staff
  on public.staff_services (tenant_id, staff_user_id, is_enabled);

create index if not exists idx_staff_services_tenant_service
  on public.staff_services (tenant_id, service_id, is_enabled);

create table if not exists public.staff_location_services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  staff_user_id uuid not null,
  service_id uuid not null references public.services(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_location_services_unique unique (staff_user_id, service_id, location_id)
);

create index if not exists idx_staff_location_services_tenant_location
  on public.staff_location_services (tenant_id, location_id, is_enabled);

create index if not exists idx_staff_location_services_tenant_staff
  on public.staff_location_services (tenant_id, staff_user_id, is_enabled);

drop trigger if exists trg_staff_service_categories_updated_at on public.staff_service_categories;
create trigger trg_staff_service_categories_updated_at
before update on public.staff_service_categories
for each row execute function public.update_updated_at_column();

drop trigger if exists trg_staff_services_updated_at on public.staff_services;
create trigger trg_staff_services_updated_at
before update on public.staff_services
for each row execute function public.update_updated_at_column();

drop trigger if exists trg_staff_location_services_updated_at on public.staff_location_services;
create trigger trg_staff_location_services_updated_at
before update on public.staff_location_services
for each row execute function public.update_updated_at_column();

alter table public.staff_service_categories enable row level security;
alter table public.staff_services enable row level security;
alter table public.staff_location_services enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'staff_service_categories'
      and policyname = 'Users can manage tenant staff service categories'
  ) then
    create policy "Users can manage tenant staff service categories"
      on public.staff_service_categories
      for all
      to authenticated
      using (belongs_to_tenant(auth.uid(), tenant_id))
      with check (belongs_to_tenant(auth.uid(), tenant_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'staff_services'
      and policyname = 'Users can manage tenant staff services'
  ) then
    create policy "Users can manage tenant staff services"
      on public.staff_services
      for all
      to authenticated
      using (belongs_to_tenant(auth.uid(), tenant_id))
      with check (belongs_to_tenant(auth.uid(), tenant_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'staff_location_services'
      and policyname = 'Users can manage tenant staff location services'
  ) then
    create policy "Users can manage tenant staff location services"
      on public.staff_location_services
      for all
      to authenticated
      using (belongs_to_tenant(auth.uid(), tenant_id))
      with check (belongs_to_tenant(auth.uid(), tenant_id));
  end if;
end $$;

commit;
