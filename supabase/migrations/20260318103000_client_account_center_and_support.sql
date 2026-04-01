-- Client account center, OTP rate limits, and support ticketing foundations.

alter table public.profiles
  add column if not exists client_password_initialized boolean not null default false;

create table if not exists public.auth_otp_attempts (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  identifier_type text not null check (identifier_type in ('email', 'phone')),
  channel text not null check (channel in ('email', 'sms')),
  app_scope text not null check (app_scope in ('client_portal', 'salon_admin')),
  created_at timestamptz not null default now()
);

create index if not exists idx_auth_otp_attempts_identifier_created_at
  on public.auth_otp_attempts (identifier, created_at desc);

create table if not exists public.client_account_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email_booking_updates boolean not null default true,
  sms_booking_updates boolean not null default false,
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  source_app text not null check (source_app in ('client_portal', 'salon_admin', 'backoffice')),
  requester_user_id uuid references auth.users(id) on delete set null,
  requester_email text,
  requester_phone text,
  tenant_id uuid references public.tenants(id) on delete set null,
  issue_type text not null,
  subject text not null,
  body text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'waiting_on_salon', 'waiting_on_customer', 'resolved', 'closed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_backoffice_user_id uuid references public.backoffice_users(user_id) on delete set null,
  sla_due_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_support_tickets_requester on public.support_tickets (requester_user_id, created_at desc);
create index if not exists idx_support_tickets_tenant on public.support_tickets (tenant_id, created_at desc);
create index if not exists idx_support_tickets_status on public.support_tickets (status, created_at desc);

alter table public.auth_otp_attempts enable row level security;
alter table public.client_account_preferences enable row level security;
alter table public.support_tickets enable row level security;

drop policy if exists "Users can read own client account preferences" on public.client_account_preferences;
create policy "Users can read own client account preferences"
  on public.client_account_preferences
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can insert own client account preferences" on public.client_account_preferences;
create policy "Users can insert own client account preferences"
  on public.client_account_preferences
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update own client account preferences" on public.client_account_preferences;
create policy "Users can update own client account preferences"
  on public.client_account_preferences
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can read own support tickets" on public.support_tickets;
create policy "Users can read own support tickets"
  on public.support_tickets
  for select
  to authenticated
  using (
    requester_user_id = auth.uid()
    or (
      tenant_id is not null
      and exists (
        select 1
        from public.user_roles ur
        where ur.user_id = auth.uid()
          and ur.tenant_id = support_tickets.tenant_id
          and coalesce(ur.is_active, true) = true
      )
    )
    or public.has_backoffice_role(auth.uid(), 'super_admin')
    or public.has_backoffice_role(auth.uid(), 'admin')
    or public.has_backoffice_role(auth.uid(), 'support_agent')
  );

drop policy if exists "Users can insert own support tickets" on public.support_tickets;
create policy "Users can insert own support tickets"
  on public.support_tickets
  for insert
  to authenticated
  with check (requester_user_id = auth.uid());

drop policy if exists "Backoffice can update support tickets" on public.support_tickets;
create policy "Backoffice can update support tickets"
  on public.support_tickets
  for update
  to authenticated
  using (
    public.has_backoffice_role(auth.uid(), 'super_admin')
    or public.has_backoffice_role(auth.uid(), 'admin')
    or public.has_backoffice_role(auth.uid(), 'support_agent')
  )
  with check (
    public.has_backoffice_role(auth.uid(), 'super_admin')
    or public.has_backoffice_role(auth.uid(), 'admin')
    or public.has_backoffice_role(auth.uid(), 'support_agent')
  );

create or replace function public.touch_client_account_preferences_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_client_account_preferences_updated_at on public.client_account_preferences;
create trigger update_client_account_preferences_updated_at
  before update on public.client_account_preferences
  for each row
  execute function public.touch_client_account_preferences_updated_at();

create or replace function public.touch_support_tickets_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_support_tickets_updated_at on public.support_tickets;
create trigger update_support_tickets_updated_at
  before update on public.support_tickets
  for each row
  execute function public.touch_support_tickets_updated_at();
