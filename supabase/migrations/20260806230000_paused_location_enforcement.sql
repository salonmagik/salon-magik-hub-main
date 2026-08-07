-- Paused-location enforcement. `locations.is_paused` (added in
-- 20260720000003_branch_pausing.sql) has never been enforced at the RLS
-- layer — only inside pause_locations/revive_location/resolve_user_contexts,
-- plus a client-side blocking banner. Two real gaps this closes:
--
-- 1. Public-facing: the anon "for booking" SELECT policies on `locations`
--    and the four *_locations mapping tables never checked is_paused, so a
--    paused branch's page/services/products/packages/vouchers were still
--    readable — and create-public-booking (patched separately, see the
--    accompanying edge function change) never checked it either, so a
--    paused branch could still accept public bookings.
-- 2. Internal: staff-facing write policies on appointments/staff_locations/
--    the *_locations mapping tables are tenant-membership-scoped only, with
--    no location-awareness at all. assign_staff_locations is SECURITY
--    DEFINER and bypasses RLS regardless, so it needs its own explicit check.
--
-- Deliberately NOT touched: appointments UPDATE. Existing bookings at a
-- newly-paused location must still be manageable (completed/cancelled) —
-- pausing blocks new business, it doesn't freeze what's already booked.
-- Same reasoning for *_locations mapping tables: only INSERT/UPDATE
-- (creating or re-enabling a mapping) is blocked; DELETE and disabling a
-- mapping stay allowed so cleanup at a paused branch isn't itself blocked.

begin;

create or replace function public.is_location_active(_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not coalesce(
    (select is_paused from public.locations where id = _location_id),
    false
  )
$$;

grant execute on function public.is_location_active(uuid) to authenticated, anon;

-- ─── Public booking reads: exclude paused locations ────────────────────────

drop policy if exists "Anon can read locations for booking" on public.locations;
create policy "Anon can read locations for booking"
on public.locations
for select
to anon
using (
  (availability is null or availability = 'open')
  and not coalesce(is_paused, false)
  and tenant_id in (
    select id from public.public_booking_tenants
  )
);

-- Note: these previously scoped via `tenant_id in (select id from tenants
-- where online_booking_enabled = true and slug is not null)`, which has
-- always evaluated to an empty set for anon — anon has no RLS-granted read
-- access to raw `public.tenants` at all. Swapped to `public_booking_tenants`,
-- the view that exists specifically to give anon a safe tenant-scoping
-- target (and already what the `locations` anon policy above uses).

drop policy if exists "Anon can read service location mappings for booking" on public.service_locations;
create policy "Anon can read service location mappings for booking"
  on public.service_locations
  for select
  to anon, authenticated
  using (
    tenant_id in (select id from public.public_booking_tenants)
    and public.is_location_active(location_id)
  );

drop policy if exists "Anon can read product location mappings for booking" on public.product_locations;
create policy "Anon can read product location mappings for booking"
  on public.product_locations
  for select
  to anon, authenticated
  using (
    tenant_id in (select id from public.public_booking_tenants)
    and public.is_location_active(location_id)
  );

drop policy if exists "Anon can read package location mappings for booking" on public.package_locations;
create policy "Anon can read package location mappings for booking"
  on public.package_locations
  for select
  to anon, authenticated
  using (
    tenant_id in (select id from public.public_booking_tenants)
    and public.is_location_active(location_id)
  );

drop policy if exists "Anon can read voucher location mappings for booking" on public.voucher_locations;
create policy "Anon can read voucher location mappings for booking"
  on public.voucher_locations
  for select
  to anon, authenticated
  using (
    tenant_id in (select id from public.public_booking_tenants)
    and public.is_location_active(location_id)
  );

-- ─── Internal writes: block creating/enabling things at a paused location ──

drop policy if exists "Users can create appointments for their tenants" on public.appointments;
create policy "Users can create appointments for their tenants"
on public.appointments
for insert
to authenticated
with check (
  tenant_id in (select get_user_tenant_ids(auth.uid()))
  and public.is_location_active(location_id)
);

drop policy if exists "Users can insert own staff_locations during onboarding" on public.staff_locations;
create policy "Users can insert own staff_locations during onboarding"
on public.staff_locations
for insert
to authenticated
with check (
  user_id = auth.uid()
  and tenant_id in (select public.get_user_tenant_ids(auth.uid()))
  and public.is_location_active(location_id)
);

drop policy if exists "Users can manage service location mappings in tenant" on public.service_locations;
create policy "Users can manage service location mappings in tenant"
  on public.service_locations
  for all
  to authenticated
  using (belongs_to_tenant(auth.uid(), tenant_id))
  with check (belongs_to_tenant(auth.uid(), tenant_id) and public.is_location_active(location_id));

drop policy if exists "Users can manage product location mappings in tenant" on public.product_locations;
create policy "Users can manage product location mappings in tenant"
  on public.product_locations
  for all
  to authenticated
  using (belongs_to_tenant(auth.uid(), tenant_id))
  with check (belongs_to_tenant(auth.uid(), tenant_id) and public.is_location_active(location_id));

drop policy if exists "Users can manage package location mappings in tenant" on public.package_locations;
create policy "Users can manage package location mappings in tenant"
  on public.package_locations
  for all
  to authenticated
  using (belongs_to_tenant(auth.uid(), tenant_id))
  with check (belongs_to_tenant(auth.uid(), tenant_id) and public.is_location_active(location_id));

drop policy if exists "Users can manage voucher location mappings in tenant" on public.voucher_locations;
create policy "Users can manage voucher location mappings in tenant"
  on public.voucher_locations
  for all
  to authenticated
  using (belongs_to_tenant(auth.uid(), tenant_id))
  with check (belongs_to_tenant(auth.uid(), tenant_id) and public.is_location_active(location_id));

-- ─── assign_staff_locations is SECURITY DEFINER: RLS above never runs for it,
-- so it needs its own explicit check. ───────────────────────────────────────

create or replace function public.assign_staff_locations(
  p_tenant_id uuid,
  p_user_id uuid,
  p_location_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role public.app_role;
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
  end
  limit 1;

  if v_actor_role not in ('owner', 'manager') then
    raise exception 'ASSIGNMENT_FORBIDDEN';
  end if;

  if not exists (
    select 1
    from public.user_roles ur
    where ur.user_id = p_user_id
      and ur.tenant_id = p_tenant_id
  ) then
    raise exception 'TARGET_USER_NOT_IN_TENANT';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_location_ids, '{}'::uuid[])) as lid
    left join public.locations l on l.id = lid
    where l.id is null or l.tenant_id <> p_tenant_id
  ) then
    raise exception 'INVALID_LOCATION_SCOPE';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_location_ids, '{}'::uuid[])) as lid
    join public.locations l on l.id = lid
    where coalesce(l.is_paused, false)
  ) then
    raise exception 'CANNOT_ASSIGN_STAFF_TO_PAUSED_LOCATION';
  end if;

  delete from public.staff_locations
  where tenant_id = p_tenant_id
    and user_id = p_user_id;

  if array_length(coalesce(p_location_ids, '{}'::uuid[]), 1) is not null then
    insert into public.staff_locations (
      user_id,
      tenant_id,
      location_id
    )
    select
      p_user_id,
      p_tenant_id,
      lid
    from unnest(p_location_ids) as lid;
  end if;
end;
$$;

commit;
