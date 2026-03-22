create table if not exists public.branch_unavailability_windows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz null,
  is_indefinite boolean not null default false,
  reason text null,
  created_by uuid null references auth.users(id) on delete set null,
  ended_at timestamptz null,
  ended_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branch_unavailability_valid_window
    check (ends_at is null or ends_at > starts_at)
);

create index if not exists idx_branch_unavailability_location_window
  on public.branch_unavailability_windows (location_id, starts_at, ends_at)
  where ended_at is null;

create index if not exists idx_branch_unavailability_tenant
  on public.branch_unavailability_windows (tenant_id, location_id, created_at desc);

create unique index if not exists idx_branch_unavailability_active_indefinite
  on public.branch_unavailability_windows (location_id)
  where ended_at is null and (is_indefinite = true or ends_at is null);

drop trigger if exists update_branch_unavailability_updated_at on public.branch_unavailability_windows;
create trigger update_branch_unavailability_updated_at
before update on public.branch_unavailability_windows
for each row execute function public.update_updated_at_column();

alter table public.branch_unavailability_windows enable row level security;

drop policy if exists "Users can read tenant branch unavailability windows" on public.branch_unavailability_windows;
create policy "Users can read tenant branch unavailability windows"
on public.branch_unavailability_windows
for select
using (tenant_id in (select get_user_tenant_ids(auth.uid())));

drop policy if exists "Owners can create branch unavailability windows" on public.branch_unavailability_windows;
create policy "Owners can create branch unavailability windows"
on public.branch_unavailability_windows
for insert
with check (public.is_tenant_owner(auth.uid(), tenant_id));

drop policy if exists "Owners can update branch unavailability windows" on public.branch_unavailability_windows;
create policy "Owners can update branch unavailability windows"
on public.branch_unavailability_windows
for update
using (public.is_tenant_owner(auth.uid(), tenant_id))
with check (public.is_tenant_owner(auth.uid(), tenant_id));
