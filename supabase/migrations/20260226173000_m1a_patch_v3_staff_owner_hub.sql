-- M1A corrective patch v3:
-- - expose owner-hub staff route in route resolver
-- - enforce chain-only location assignment mutations

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
        ('staff', '/salon/overview/staff', 15),
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
    if p_context_type = 'owner_hub' and v_module not in ('salons_overview', 'staff') then
      continue;
    end if;

    if p_context_type = 'location' and v_path in ('/salon/overview', '/salon/overview/staff') then
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

  if array_length(v_routes, 1) is null then
    if p_context_type = 'owner_hub' then
      return array['/salon/overview'];
    end if;
    return array['/salon/access-denied'];
  end if;

  return v_routes;
end;
$$;

grant execute on function public.list_accessible_routes(uuid, text, uuid) to authenticated;

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
  v_plan text;
begin
  if v_actor is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select t.plan
    into v_plan
  from public.tenants t
  where t.id = p_tenant_id;

  if coalesce(v_plan, '') <> 'chain' then
    raise exception 'ASSIGNMENT_CHAIN_ONLY';
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

grant execute on function public.assign_staff_locations(uuid, uuid, uuid[]) to authenticated;
