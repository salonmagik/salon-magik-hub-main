-- Fix: restore location fallback for non-chain tenants in resolve_user_contexts.
--
-- The staff_assignment_pending_enforcement migration correctly removed the
-- "give all locations when staff_locations is empty" fallback to force explicit
-- branch assignment on chain plans. But it also broke solo/studio tenants —
-- their staff never have staff_locations entries (the assignment UI is chain-only),
-- so they'd be stuck on the AssignmentPendingPage indefinitely.
--
-- Fix: restore the fallback ONLY for non-chain tenants (solo/studio) so their
-- single location is automatically available to all non-owner staff.

create or replace function public.resolve_user_contexts(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_tenant uuid := p_tenant_id;
  v_role public.app_role;
  v_available_location_ids uuid[] := '{}'::uuid[];
  v_default_location_id uuid;
  v_can_use_owner_hub boolean := false;
  v_available_locations jsonb;
  v_is_chain boolean := false;
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if v_tenant is null then
    select ur.tenant_id
      into v_tenant
    from public.user_roles ur
    where ur.user_id = v_user
      and coalesce(ur.is_active, true) = true
    order by ur.created_at asc
    limit 1;
  end if;

  if v_tenant is null then
    return jsonb_build_object(
      'default_context_type', 'location',
      'default_location_id', null,
      'available_locations', '[]'::jsonb,
      'can_use_owner_hub', false,
      'role', null
    );
  end if;

  select (coalesce(t.plan, 'solo') = 'chain')
    into v_is_chain
  from public.tenants t
  where t.id = v_tenant;

  select ur.role
    into v_role
  from public.user_roles ur
  where ur.user_id = v_user
    and ur.tenant_id = v_tenant
    and coalesce(ur.is_active, true) = true
  order by case ur.role
    when 'owner' then 1
    when 'manager' then 2
    when 'supervisor' then 3
    when 'receptionist' then 4
    else 5
  end
  limit 1;

  if v_role is null then
    raise exception 'TENANT_ACCESS_DENIED';
  end if;

  if v_role = 'owner' then
    select coalesce(array_agg(l.id order by l.is_default desc, l.created_at asc), '{}'::uuid[])
      into v_available_location_ids
    from public.locations l
    where l.tenant_id = v_tenant;
  else
    select coalesce(array_agg(sl.location_id), '{}'::uuid[])
      into v_available_location_ids
    from (
      select distinct sl.location_id
      from public.staff_locations sl
      where sl.user_id = v_user
        and sl.tenant_id = v_tenant
    ) sl;

    -- Non-chain tenants: if no explicit staff_locations entries, fall back to all
    -- tenant locations (typically just one). Chain tenants require explicit assignment.
    if not v_is_chain and array_length(v_available_location_ids, 1) is null then
      select coalesce(array_agg(l.id order by l.is_default desc, l.created_at asc), '{}'::uuid[])
        into v_available_location_ids
      from public.locations l
      where l.tenant_id = v_tenant;
    end if;
  end if;

  v_can_use_owner_hub :=
    v_role = 'owner'
    or (
      v_role in ('manager', 'supervisor')
      and coalesce(array_length(v_available_location_ids, 1), 0) > 1
    );

  select l.id
    into v_default_location_id
  from public.locations l
  where l.tenant_id = v_tenant
    and l.id = any(v_available_location_ids)
  order by l.is_default desc, l.created_at asc
  limit 1;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', l.id,
        'name', l.name,
        'city', l.city,
        'country', l.country,
        'is_default', l.is_default
      )
      order by l.is_default desc, l.created_at asc
    ),
    '[]'::jsonb
  )
  into v_available_locations
  from public.locations l
  where l.tenant_id = v_tenant
    and l.id = any(v_available_location_ids);

  return jsonb_build_object(
    'default_context_type', case when v_can_use_owner_hub then 'owner_hub' else 'location' end,
    'default_location_id', v_default_location_id,
    'available_locations', v_available_locations,
    'can_use_owner_hub', v_can_use_owner_hub,
    'role', v_role::text
  );
end;
$$;

grant execute on function public.resolve_user_contexts(uuid) to authenticated;
