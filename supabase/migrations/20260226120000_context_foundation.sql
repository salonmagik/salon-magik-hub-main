-- M1A context foundation for salon-admin (owner hub + location context)

alter table if exists public.staff_sessions
  add column if not exists active_context_type text
    check (active_context_type in ('owner_hub', 'location'))
    default 'location';

alter table if exists public.staff_sessions
  add column if not exists active_location_id uuid references public.locations(id) on delete set null;

alter table if exists public.staff_sessions
  add column if not exists last_route text;

alter table if exists public.staff_sessions
  add column if not exists last_page_view_at timestamptz;

create index if not exists idx_staff_sessions_user_tenant_active
  on public.staff_sessions (user_id, tenant_id, ended_at);

create index if not exists idx_staff_sessions_tenant_context
  on public.staff_sessions (tenant_id, active_context_type)
  where ended_at is null;

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

    if array_length(v_available_location_ids, 1) is null then
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

create or replace function public.set_active_context(
  p_tenant_id uuid,
  p_context_type text,
  p_location_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_resolved jsonb;
  v_can_use_owner_hub boolean;
  v_default_location_id uuid;
  v_location_id uuid;
  v_locations uuid[];
  v_context_type text;
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  v_context_type := coalesce(p_context_type, 'location');
  if v_context_type not in ('owner_hub', 'location') then
    raise exception 'INVALID_CONTEXT_TYPE';
  end if;

  v_resolved := public.resolve_user_contexts(p_tenant_id);
  v_can_use_owner_hub := coalesce((v_resolved->>'can_use_owner_hub')::boolean, false);
  v_default_location_id := nullif(v_resolved->>'default_location_id', '')::uuid;

  select coalesce(array_agg((loc->>'id')::uuid), '{}'::uuid[])
    into v_locations
  from jsonb_array_elements(coalesce(v_resolved->'available_locations', '[]'::jsonb)) as loc;

  if v_context_type = 'owner_hub' and not v_can_use_owner_hub then
    raise exception 'OWNER_HUB_NOT_ALLOWED';
  end if;

  if v_context_type = 'location' then
    v_location_id := coalesce(p_location_id, v_default_location_id);
    if v_location_id is null then
      raise exception 'LOCATION_REQUIRED';
    end if;
    if not (v_location_id = any(v_locations)) then
      raise exception 'LOCATION_ACCESS_DENIED';
    end if;
  else
    v_location_id := null;
  end if;

  update public.staff_sessions
  set
    active_context_type = v_context_type,
    active_location_id = v_location_id,
    last_activity_at = now()
  where user_id = v_user
    and tenant_id = p_tenant_id
    and ended_at is null;

  if not found then
    insert into public.staff_sessions (
      user_id,
      tenant_id,
      location_id,
      active_context_type,
      active_location_id,
      last_activity_at
    )
    values (
      v_user,
      p_tenant_id,
      v_location_id,
      v_context_type,
      v_location_id,
      now()
    );
  end if;

  return jsonb_build_object(
    'context_type', v_context_type,
    'location_id', v_location_id
  );
end;
$$;

grant execute on function public.set_active_context(uuid, text, uuid) to authenticated;

create or replace function public.list_accessible_routes(
  p_tenant_id uuid,
  p_context_type text,
  p_location_id uuid default null
)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_role public.app_role;
  v_module text;
  v_path text;
  v_order int;
  v_allowed boolean;
  v_routes text[] := '{}'::text[];
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if coalesce(p_context_type, 'location') not in ('owner_hub', 'location') then
    raise exception 'INVALID_CONTEXT_TYPE';
  end if;

  select ur.role
    into v_role
  from public.user_roles ur
  where ur.user_id = v_user
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

  if v_role is null then
    return array['/salon/access-denied'];
  end if;

  for v_module, v_path, v_order in
    select *
    from (
      values
        ('salons_overview', '/salon/overview', 10),
        ('dashboard', '/salon', 20),
        ('appointments', '/salon/appointments', 30),
        ('calendar', '/salon/calendar', 40),
        ('customers', '/salon/customers', 50),
        ('services', '/salon/services', 60),
        ('payments', '/salon/payments', 70),
        ('reports', '/salon/reports', 80),
        ('messaging', '/salon/messaging', 90),
        ('journal', '/salon/journal', 100),
        ('staff', '/salon/staff', 110),
        ('settings', '/salon/settings', 120),
        ('audit_log', '/salon/audit-log', 130)
    ) as route_map(module_key, route_path, route_order)
    order by route_order
  loop
    if p_context_type = 'owner_hub' and v_module <> 'salons_overview' then
      continue;
    end if;

    if p_context_type = 'location' and v_module = 'salons_overview' then
      continue;
    end if;

    if v_role = 'owner' then
      v_allowed := true;
    else
      select coalesce(
        (
          select uo.allowed
          from public.user_permission_overrides uo
          where uo.tenant_id = p_tenant_id
            and uo.user_id = v_user
            and uo.module = v_module
          limit 1
        ),
        (
          select rp.allowed
          from public.role_permissions rp
          where rp.tenant_id = p_tenant_id
            and rp.role = v_role
            and rp.module = v_module
          limit 1
        ),
        false
      )
      into v_allowed;
    end if;

    if v_allowed then
      v_routes := array_append(v_routes, v_path);
    end if;
  end loop;

  if coalesce(array_length(v_routes, 1), 0) = 0 then
    return array['/salon/access-denied'];
  end if;

  return v_routes;
end;
$$;

grant execute on function public.list_accessible_routes(uuid, text, uuid) to authenticated;
