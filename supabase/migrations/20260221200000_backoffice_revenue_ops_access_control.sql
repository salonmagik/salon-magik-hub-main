-- Backoffice role templates (non-super admins) + revenue ops sales tables.

create table if not exists public.backoffice_permission_keys (
  key text primary key,
  label text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.backoffice_page_keys (
  key text primary key,
  label text not null,
  route_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.backoffice_role_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists update_backoffice_role_templates_updated_at on public.backoffice_role_templates;
create trigger update_backoffice_role_templates_updated_at
before update on public.backoffice_role_templates
for each row execute function public.update_updated_at_column();

create table if not exists public.backoffice_role_template_permissions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.backoffice_role_templates(id) on delete cascade,
  permission_key text not null references public.backoffice_permission_keys(key) on delete cascade,
  created_at timestamptz not null default now(),
  unique (template_id, permission_key)
);

create table if not exists public.backoffice_role_template_pages (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.backoffice_role_templates(id) on delete cascade,
  page_key text not null references public.backoffice_page_keys(key) on delete cascade,
  created_at timestamptz not null default now(),
  unique (template_id, page_key)
);

create table if not exists public.backoffice_user_role_assignments (
  id uuid primary key default gen_random_uuid(),
  backoffice_user_id uuid not null unique references public.backoffice_users(id) on delete cascade,
  role_template_id uuid not null references public.backoffice_role_templates(id) on delete restrict,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists update_backoffice_user_role_assignments_updated_at on public.backoffice_user_role_assignments;
create trigger update_backoffice_user_role_assignments_updated_at
before update on public.backoffice_user_role_assignments
for each row execute function public.update_updated_at_column();

alter table public.backoffice_permission_keys enable row level security;
alter table public.backoffice_page_keys enable row level security;
alter table public.backoffice_role_templates enable row level security;
alter table public.backoffice_role_template_permissions enable row level security;
alter table public.backoffice_role_template_pages enable row level security;
alter table public.backoffice_user_role_assignments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'backoffice_permission_keys' and policyname = 'Backoffice can read permission keys'
  ) then
    create policy "Backoffice can read permission keys"
      on public.backoffice_permission_keys
      for select
      to authenticated
      using (is_backoffice_user(auth.uid()));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'backoffice_permission_keys' and policyname = 'Super admins can manage permission keys'
  ) then
    create policy "Super admins can manage permission keys"
      on public.backoffice_permission_keys
      for all
      to authenticated
      using (has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role))
      with check (has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'backoffice_page_keys' and policyname = 'Backoffice can read page keys'
  ) then
    create policy "Backoffice can read page keys"
      on public.backoffice_page_keys
      for select
      to authenticated
      using (is_backoffice_user(auth.uid()));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'backoffice_page_keys' and policyname = 'Super admins can manage page keys'
  ) then
    create policy "Super admins can manage page keys"
      on public.backoffice_page_keys
      for all
      to authenticated
      using (has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role))
      with check (has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'backoffice_role_templates' and policyname = 'Backoffice can read role templates'
  ) then
    create policy "Backoffice can read role templates"
      on public.backoffice_role_templates
      for select
      to authenticated
      using (is_backoffice_user(auth.uid()));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'backoffice_role_templates' and policyname = 'Super admins can manage role templates'
  ) then
    create policy "Super admins can manage role templates"
      on public.backoffice_role_templates
      for all
      to authenticated
      using (has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role))
      with check (has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'backoffice_role_template_permissions' and policyname = 'Backoffice can read role template permissions'
  ) then
    create policy "Backoffice can read role template permissions"
      on public.backoffice_role_template_permissions
      for select
      to authenticated
      using (is_backoffice_user(auth.uid()));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'backoffice_role_template_permissions' and policyname = 'Super admins can manage role template permissions'
  ) then
    create policy "Super admins can manage role template permissions"
      on public.backoffice_role_template_permissions
      for all
      to authenticated
      using (has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role))
      with check (has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'backoffice_role_template_pages' and policyname = 'Backoffice can read role template pages'
  ) then
    create policy "Backoffice can read role template pages"
      on public.backoffice_role_template_pages
      for select
      to authenticated
      using (is_backoffice_user(auth.uid()));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'backoffice_role_template_pages' and policyname = 'Super admins can manage role template pages'
  ) then
    create policy "Super admins can manage role template pages"
      on public.backoffice_role_template_pages
      for all
      to authenticated
      using (has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role))
      with check (has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'backoffice_user_role_assignments' and policyname = 'Backoffice can read role assignments'
  ) then
    create policy "Backoffice can read role assignments"
      on public.backoffice_user_role_assignments
      for select
      to authenticated
      using (is_backoffice_user(auth.uid()));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'backoffice_user_role_assignments' and policyname = 'Super admins can manage role assignments'
  ) then
    create policy "Super admins can manage role assignments"
      on public.backoffice_user_role_assignments
      for all
      to authenticated
      using (has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role))
      with check (has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role));
  end if;
end $$;

create or replace function public.backoffice_user_has_permission(
  p_user_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    has_backoffice_role(p_user_id, 'super_admin'::backoffice_role)
    or exists (
      select 1
      from public.backoffice_users bu
      join public.backoffice_user_role_assignments aura on aura.backoffice_user_id = bu.id
      join public.backoffice_role_templates t on t.id = aura.role_template_id and t.is_active
      join public.backoffice_role_template_permissions tp on tp.template_id = t.id
      where bu.user_id = p_user_id
        and tp.permission_key = p_permission_key
    );
$$;

grant execute on function public.backoffice_user_has_permission(uuid, text) to authenticated;

-- ---- Revenue ops / sales-agent foundation ----

create table if not exists public.sales_agents (
  id uuid primary key default gen_random_uuid(),
  backoffice_user_id uuid not null unique references public.backoffice_users(id) on delete cascade,
  employment_status text not null default 'active' check (employment_status in ('active', 'inactive', 'suspended')),
  country_code text not null default 'NG',
  hire_date date,
  monthly_base_salary numeric not null default 0 check (monthly_base_salary >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists update_sales_agents_updated_at on public.sales_agents;
create trigger update_sales_agents_updated_at
before update on public.sales_agents
for each row execute function public.update_updated_at_column();

create table if not exists public.sales_agent_kyc (
  id uuid primary key default gen_random_uuid(),
  sales_agent_id uuid not null unique references public.sales_agents(id) on delete cascade,
  legal_full_name text,
  national_id_number text,
  national_id_type text,
  next_of_kin_name text,
  next_of_kin_phone text,
  reference_person_name text,
  reference_person_phone text,
  past_workplace text,
  verification_status text not null default 'pending' check (verification_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists update_sales_agent_kyc_updated_at on public.sales_agent_kyc;
create trigger update_sales_agent_kyc_updated_at
before update on public.sales_agent_kyc
for each row execute function public.update_updated_at_column();

create table if not exists public.sales_agent_documents (
  id uuid primary key default gen_random_uuid(),
  sales_agent_id uuid not null references public.sales_agents(id) on delete cascade,
  document_type text not null check (document_type in ('national_id_front', 'national_id_back', 'passport_photo', 'other')),
  storage_path text not null,
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.sales_promo_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value numeric not null check (discount_value >= 0),
  enable_trial_extension boolean not null default false,
  trial_extension_days integer not null default 0 check (trial_extension_days between 0 and 30),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists update_sales_promo_campaigns_updated_at on public.sales_promo_campaigns;
create trigger update_sales_promo_campaigns_updated_at
before update on public.sales_promo_campaigns
for each row execute function public.update_updated_at_column();

create table if not exists public.sales_promo_codes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.sales_promo_campaigns(id) on delete cascade,
  agent_id uuid not null references public.sales_agents(id) on delete cascade,
  code text not null unique,
  target_email text not null,
  expires_at timestamptz not null,
  is_one_time boolean not null default true,
  status text not null default 'active' check (status in ('active', 'redeemed', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  redeemed_at timestamptz
);

create index if not exists idx_sales_promo_codes_target_email on public.sales_promo_codes (lower(target_email));
create index if not exists idx_sales_promo_codes_expires_at on public.sales_promo_codes (expires_at);

create table if not exists public.sales_promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references public.sales_promo_codes(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete set null,
  owner_user_id uuid references auth.users(id) on delete set null,
  owner_email text not null,
  email_match boolean not null default false,
  discount_snapshot jsonb not null default '{}'::jsonb,
  trial_extension_days integer not null default 0,
  status text not null default 'provisional' check (status in ('provisional', 'finalized', 'rejected', 'reversed')),
  provider_reference text,
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);

create table if not exists public.annual_lockin_offers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  eligible_until timestamptz not null,
  bonus_trial_days integer not null default 30 check (bonus_trial_days between 0 and 30),
  status text not null default 'eligible' check (status in ('eligible', 'claimed', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists update_annual_lockin_offers_updated_at on public.annual_lockin_offers;
create trigger update_annual_lockin_offers_updated_at
before update on public.annual_lockin_offers
for each row execute function public.update_updated_at_column();

create table if not exists public.annual_lockin_events (
  id uuid primary key default gen_random_uuid(),
  annual_offer_id uuid references public.annual_lockin_offers(id) on delete set null,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  payment_provider text not null default 'stripe',
  provider_reference text,
  amount numeric,
  currency text,
  status text not null default 'provisional' check (status in ('provisional', 'paid', 'failed', 'reversed')),
  occurred_at timestamptz not null default now()
);

create table if not exists public.sales_commission_ledger (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.sales_agents(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete set null,
  promo_code_id uuid references public.sales_promo_codes(id) on delete set null,
  payment_reference text,
  tier_label text,
  base_commission numeric not null default 0,
  bonus_amount numeric not null default 0,
  total_amount numeric not null default 0,
  status text not null default 'pending' check (status in ('pending', 'accrued', 'paid', 'cancelled')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create table if not exists public.sales_targets (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.sales_agents(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  weekly_target integer not null default 0 check (weekly_target >= 0),
  commission_tiers jsonb not null default '[]'::jsonb,
  monthly_base_salary numeric not null default 0 check (monthly_base_salary >= 0),
  bonus_rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, week_start, week_end)
);

drop trigger if exists update_sales_targets_updated_at on public.sales_targets;
create trigger update_sales_targets_updated_at
before update on public.sales_targets
for each row execute function public.update_updated_at_column();

alter table public.sales_agents enable row level security;
alter table public.sales_agent_kyc enable row level security;
alter table public.sales_agent_documents enable row level security;
alter table public.sales_promo_campaigns enable row level security;
alter table public.sales_promo_codes enable row level security;
alter table public.sales_promo_redemptions enable row level security;
alter table public.annual_lockin_offers enable row level security;
alter table public.annual_lockin_events enable row level security;
alter table public.sales_commission_ledger enable row level security;
alter table public.sales_targets enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'sales_agents',
    'sales_agent_kyc',
    'sales_agent_documents',
    'sales_promo_campaigns',
    'sales_promo_codes',
    'sales_promo_redemptions',
    'annual_lockin_offers',
    'annual_lockin_events',
    'sales_commission_ledger',
    'sales_targets'
  ]
  loop
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = t
        and policyname = 'Backoffice can manage ' || t
    ) then
      execute format(
        'create policy %I on public.%I for all to authenticated using (has_backoffice_role(auth.uid(), ''super_admin''::backoffice_role) or backoffice_user_has_permission(auth.uid(), ''sales_promo.create'')) with check (has_backoffice_role(auth.uid(), ''super_admin''::backoffice_role) or backoffice_user_has_permission(auth.uid(), ''sales_promo.create''))',
        'Backoffice can manage ' || t,
        t
      );
    end if;
  end loop;
end $$;

create or replace function public.backoffice_generate_sales_promo_code(
  p_campaign_id uuid,
  p_agent_id uuid,
  p_target_email text
)
returns public.sales_promo_codes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_code text;
  v_result public.sales_promo_codes;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not (
    has_backoffice_role(v_actor, 'super_admin'::backoffice_role)
    or backoffice_user_has_permission(v_actor, 'sales_promo.create')
  ) then
    raise exception 'ACCESS_DENIED';
  end if;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.sales_promo_codes (
    campaign_id,
    agent_id,
    code,
    target_email,
    expires_at
  )
  values (
    p_campaign_id,
    p_agent_id,
    v_code,
    lower(trim(p_target_email)),
    now() + interval '24 hours'
  )
  returning * into v_result;

  return v_result;
end;
$$;

grant execute on function public.backoffice_generate_sales_promo_code(uuid, uuid, text) to authenticated;

insert into public.backoffice_permission_keys (key, label, description)
values
  ('sales_promo.create', 'Create sales promo codes', 'Generate and manage sales promo codes and campaigns'),
  ('sales_agents.manage', 'Manage sales agents', 'Manage sales agents, KYC records, targets and commissions'),
  ('admins.manage_templates', 'Manage admin templates', 'Manage non-super-admin role templates and assignments')
on conflict (key) do nothing;

insert into public.backoffice_page_keys (key, label, route_path)
values
  ('admins', 'Admins', '/admins'),
  ('tenants', 'Tenants', '/tenants'),
  ('feature_flags', 'Feature Flags', '/feature-flags'),
  ('sales_ops', 'Sales Ops', '/sales')
on conflict (key) do nothing;
