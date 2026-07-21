-- Branch pausing: billing-driven suspension for tenants that downgrade below their
-- current branch count. Max 3 paused branches per tenant.
alter table public.locations
  add column if not exists is_paused boolean not null default false,
  add column if not exists paused_at timestamptz,
  add column if not exists paused_reason text;

create index if not exists locations_is_paused_idx on public.locations (tenant_id, is_paused);

-- Update resolve_user_contexts to handle paused locations:
--  · Owners see ALL locations (including paused) with is_paused flag.
--  · Non-owners only see active (non-paused) locations.
--  · default_location_id always resolves to an active location.
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
  v_is_owner boolean := false;
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

  v_is_owner := v_role = 'owner';

  if v_is_owner then
    -- Owners see ALL locations including paused ones.
    select coalesce(array_agg(l.id order by l.is_default desc, l.created_at asc), '{}'::uuid[])
      into v_available_location_ids
    from public.locations l
    where l.tenant_id = v_tenant;
  else
    -- Non-owners only get active (non-paused) locations they are assigned to.
    select coalesce(array_agg(sl.location_id), '{}'::uuid[])
      into v_available_location_ids
    from (
      select distinct sl.location_id
      from public.staff_locations sl
      join public.locations l on l.id = sl.location_id
      where sl.user_id = v_user
        and sl.tenant_id = v_tenant
        and not l.is_paused
    ) sl;

    -- Non-chain tenants: if no explicit staff_locations entries, fall back to all
    -- active tenant locations (typically just one). Chain tenants require explicit assignment.
    if not v_is_chain and array_length(v_available_location_ids, 1) is null then
      select coalesce(array_agg(l.id order by l.is_default desc, l.created_at asc), '{}'::uuid[])
        into v_available_location_ids
      from public.locations l
      where l.tenant_id = v_tenant
        and not l.is_paused;
    end if;
  end if;

  v_can_use_owner_hub :=
    v_role = 'owner'
    or (
      v_role in ('manager', 'supervisor')
      and coalesce(array_length(v_available_location_ids, 1), 0) > 1
    );

  -- Default resolves to an active location.
  select l.id
    into v_default_location_id
  from public.locations l
  where l.tenant_id = v_tenant
    and l.id = any(v_available_location_ids)
    and not l.is_paused
  order by l.is_default desc, l.created_at asc
  limit 1;

  -- Fall back to any available location if all are paused (owner edge case).
  if v_default_location_id is null and array_length(v_available_location_ids, 1) is not null then
    select l.id
      into v_default_location_id
    from public.locations l
    where l.id = any(v_available_location_ids)
    order by l.is_default desc, l.created_at asc
    limit 1;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', l.id,
        'name', l.name,
        'city', l.city,
        'country', l.country,
        'is_default', l.is_default,
        'is_paused', l.is_paused
      )
      order by l.is_paused asc, l.is_default desc, l.created_at asc
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

-- Pause one or more locations for a tenant. Only owners can call this.
-- Enforces: max 3 paused locations, cannot pause the last active location.
create or replace function public.pause_locations(
  p_tenant_id uuid,
  p_location_ids uuid[],
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role;
  v_active_count integer;
  v_currently_paused integer;
  v_to_pause_count integer;
begin
  if v_actor is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select ur.role into v_role
  from public.user_roles ur
  where ur.user_id = v_actor
    and ur.tenant_id = p_tenant_id
    and coalesce(ur.is_active, true) = true
  limit 1;

  if v_role <> 'owner' then
    raise exception 'ONLY_OWNERS_CAN_PAUSE_BRANCHES';
  end if;

  if p_location_ids is null or array_length(p_location_ids, 1) is null then
    return jsonb_build_object('success', true, 'paused', 0);
  end if;

  v_to_pause_count := array_length(p_location_ids, 1);

  select count(*) into v_currently_paused
  from public.locations
  where tenant_id = p_tenant_id
    and is_paused = true;

  if v_currently_paused + v_to_pause_count > 3 then
    raise exception 'MAX_PAUSED_BRANCHES_EXCEEDED: a tenant may have at most 3 paused branches';
  end if;

  -- Ensure at least one active location will remain.
  select count(*) into v_active_count
  from public.locations
  where tenant_id = p_tenant_id
    and is_paused = false
    and id <> all(p_location_ids);

  if v_active_count < 1 then
    raise exception 'CANNOT_PAUSE_LAST_ACTIVE_BRANCH';
  end if;

  update public.locations
  set
    is_paused = true,
    paused_at = now(),
    paused_reason = p_reason
  where tenant_id = p_tenant_id
    and id = any(p_location_ids)
    and is_paused = false;

  return jsonb_build_object('success', true, 'paused', v_to_pause_count);
end;
$$;

grant execute on function public.pause_locations(uuid, uuid[], text) to authenticated;

-- Revive a paused location (unblock it). Caller must be the tenant owner.
create or replace function public.revive_location(
  p_tenant_id uuid,
  p_location_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role;
begin
  if v_actor is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select ur.role into v_role
  from public.user_roles ur
  where ur.user_id = v_actor
    and ur.tenant_id = p_tenant_id
    and coalesce(ur.is_active, true) = true
  limit 1;

  if v_role <> 'owner' then
    raise exception 'ONLY_OWNERS_CAN_REVIVE_BRANCHES';
  end if;

  update public.locations
  set
    is_paused = false,
    paused_at = null,
    paused_reason = null
  where id = p_location_id
    and tenant_id = p_tenant_id
    and is_paused = true;

  if not found then
    return jsonb_build_object('success', false, 'message', 'Location not found or not paused');
  end if;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.revive_location(uuid, uuid) to authenticated;
