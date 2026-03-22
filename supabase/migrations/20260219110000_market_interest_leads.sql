create table if not exists public.market_interest_leads (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone_e164 text not null,
  country text not null,
  city text not null,
  salon_name text not null,
  team_size integer,
  notes text,
  source text not null,
  status text not null default 'new' check (status in ('new', 'reviewing', 'contacted', 'qualified', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_market_interest_leads_created_at
  on public.market_interest_leads (created_at desc);
create index if not exists idx_market_interest_leads_status
  on public.market_interest_leads (status);
create index if not exists idx_market_interest_leads_country
  on public.market_interest_leads (country);
create index if not exists idx_market_interest_leads_email
  on public.market_interest_leads (email);

drop trigger if exists update_market_interest_leads_updated_at on public.market_interest_leads;
create trigger update_market_interest_leads_updated_at
  before update on public.market_interest_leads
  for each row
  execute function public.update_updated_at_column();

alter table public.market_interest_leads enable row level security;

drop policy if exists "Backoffice can read market interest leads" on public.market_interest_leads;
create policy "Backoffice can read market interest leads"
  on public.market_interest_leads
  for select
  using (
    exists (
      select 1
      from public.backoffice_users bu
      where bu.user_id = auth.uid()
        and bu.is_active = true
        and bu.role in ('super_admin', 'admin')
    )
  );

drop policy if exists "Backoffice can update market interest status" on public.market_interest_leads;
create policy "Backoffice can update market interest status"
  on public.market_interest_leads
  for update
  using (
    exists (
      select 1
      from public.backoffice_users bu
      where bu.user_id = auth.uid()
        and bu.is_active = true
        and bu.role in ('super_admin', 'admin')
    )
  );

insert into public.feature_flags (name, description, scope, is_enabled, reason)
values (
  'other_countries_interest_enabled',
  'Shows interest capture CTA for countries outside Ghana and Nigeria on marketing.',
  'platform',
  false,
  'Launch flag for region expansion form'
)
on conflict (name) do update
set
  description = excluded.description,
  scope = excluded.scope;
