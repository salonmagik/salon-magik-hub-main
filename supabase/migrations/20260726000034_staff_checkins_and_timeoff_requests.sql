-- Staff Operations was sold as "location check-ins, time-off requests, leave
-- allowances, and manager approvals" but only leave allowances were fully
-- built. staff_time_off.status only ever supported 'approved'/'cancelled' —
-- managers could directly record leave, but staff had no way to request
-- anything themselves, and check-ins didn't exist as a concept anywhere.

-- ── Time off: widen to a real request -> approve/reject workflow ──────────
alter table public.staff_time_off
  drop constraint if exists staff_time_off_status_check;
alter table public.staff_time_off
  add constraint staff_time_off_status_check
  check (status in ('pending', 'approved', 'rejected', 'cancelled'));

alter table public.staff_time_off
  add column if not exists responded_at timestamptz,
  add column if not exists responded_by uuid references auth.users(id) on delete set null,
  add column if not exists rejection_reason text;

alter table public.staff_time_off
  alter column status set default 'pending';

-- Replace the old single FOR ALL policy with per-command policies so staff
-- can insert their own pending request without being able to touch anyone
-- else's, while owners/managers can still respond to a request they didn't
-- create (the old WITH CHECK required created_by = auth.uid() on every
-- write, which would have blocked a manager from ever approving a
-- staff-submitted request).
drop policy if exists "Owners and managers can manage time off" on public.staff_time_off;

create policy "Owners and managers can insert time off"
on public.staff_time_off for insert
with check (
  created_by = auth.uid()
  and (
    public.has_role(auth.uid(), tenant_id, 'owner')
    or public.has_role(auth.uid(), tenant_id, 'manager')
  )
);

create policy "Staff can request their own time off"
on public.staff_time_off for insert
with check (
  created_by = auth.uid()
  and user_id = auth.uid()
  and status = 'pending'
  and public.belongs_to_tenant(auth.uid(), tenant_id)
);

create policy "Owners and managers can update time off"
on public.staff_time_off for update
using (
  public.has_role(auth.uid(), tenant_id, 'owner')
  or public.has_role(auth.uid(), tenant_id, 'manager')
)
with check (
  public.has_role(auth.uid(), tenant_id, 'owner')
  or public.has_role(auth.uid(), tenant_id, 'manager')
);

create policy "Staff can cancel their own pending request"
on public.staff_time_off for update
using (user_id = auth.uid() and status = 'pending')
with check (user_id = auth.uid() and status = 'cancelled');

create policy "Owners and managers can delete time off"
on public.staff_time_off for delete
using (
  public.has_role(auth.uid(), tenant_id, 'owner')
  or public.has_role(auth.uid(), tenant_id, 'manager')
);

comment on column public.staff_time_off.status is
  'pending = staff-requested, awaiting a manager/owner response. approved/rejected = responded_by + responded_at set. cancelled = withdrawn by the requester or an owner/manager.';

-- ── Location check-ins ──────────────────────────────────────────────────────
-- GPS is captured on every check-in/out (satisfies "requires GPS on staff
-- devices"), but locations have no stored coordinates today (only a free-text
-- address), so there is no automatic radius verification yet — that needs a
-- separate geocoding/coordinate-capture step for locations, deliberately not
-- bundled into this migration. Managers see the raw coordinates for now.
create table if not exists public.staff_check_ins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz,
  check_in_latitude numeric,
  check_in_longitude numeric,
  check_out_latitude numeric,
  check_out_longitude numeric,
  created_at timestamptz not null default now()
);

create index if not exists idx_staff_check_ins_tenant_open
  on public.staff_check_ins (tenant_id, user_id)
  where checked_out_at is null;

create index if not exists idx_staff_check_ins_location
  on public.staff_check_ins (location_id, checked_in_at desc);

-- One open (not checked-out) check-in per staff member at a time.
create unique index if not exists idx_staff_check_ins_one_open_per_user
  on public.staff_check_ins (user_id)
  where checked_out_at is null;

alter table public.staff_check_ins enable row level security;

create policy "Tenant staff can view check-ins"
on public.staff_check_ins for select
using (public.belongs_to_tenant(auth.uid(), tenant_id));

create policy "Staff can check themselves in"
on public.staff_check_ins for insert
with check (
  user_id = auth.uid()
  and public.belongs_to_tenant(auth.uid(), tenant_id)
  and exists (
    select 1 from public.tenant_addon_entitlements tae
    where tae.tenant_id = staff_check_ins.tenant_id
      and tae.addon_type = 'staff_operations'
      and tae.status = 'active'
  )
);

create policy "Staff can check themselves out"
on public.staff_check_ins for update
using (user_id = auth.uid() and checked_out_at is null)
with check (user_id = auth.uid());

create policy "Owners and managers can manage any check-in"
on public.staff_check_ins for all
using (
  public.has_role(auth.uid(), tenant_id, 'owner')
  or public.has_role(auth.uid(), tenant_id, 'manager')
)
with check (
  public.has_role(auth.uid(), tenant_id, 'owner')
  or public.has_role(auth.uid(), tenant_id, 'manager')
);

comment on table public.staff_check_ins is
  'Staff location check-ins for the Staff Operations add-on. GPS is captured but not yet verified against a stored location radius — locations have no coordinates yet.';
