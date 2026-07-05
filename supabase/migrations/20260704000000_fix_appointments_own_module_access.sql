-- Fix: user_has_module_access('appointments') now also grants access when the
-- user has 'appointments:own' allowed. This mirrors the ModuleProtectedRoute
-- client-side mapping (lines 39-40) so list_accessible_routes correctly
-- includes /salon/appointments for staff whose role only grants appointments:own.

create or replace function public.user_has_module_access(
  p_user_id uuid,
  p_tenant_id uuid,
  p_module text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.app_role;
  v_allowed boolean;
begin
  if p_user_id is null or p_tenant_id is null or p_module is null then
    return false;
  end if;

  select ur.role
  into v_role
  from public.user_roles ur
  where ur.user_id = p_user_id
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
    return false;
  end if;

  if v_role = 'owner' then
    return true;
  end if;

  -- Check user-level overrides first
  select uo.allowed
  into v_allowed
  from public.user_permission_overrides uo
  where uo.tenant_id = p_tenant_id
    and uo.user_id = p_user_id
    and uo.module = p_module
  limit 1;

  if found then
    return coalesce(v_allowed, false);
  end if;

  -- For 'appointments' module, also accept 'appointments:own' as a match.
  -- This mirrors the client-side ModuleProtectedRoute mapping so that
  -- list_accessible_routes returns /salon/appointments for staff-role users
  -- whose role only has appointments:own allowed.
  if p_module = 'appointments' then
    select uo.allowed
    into v_allowed
    from public.user_permission_overrides uo
    where uo.tenant_id = p_tenant_id
      and uo.user_id = p_user_id
      and uo.module = 'appointments:own'
    limit 1;

    if found and coalesce(v_allowed, false) then
      return true;
    end if;
  end if;

  -- Check role-level permissions
  select rp.allowed
  into v_allowed
  from public.role_permissions rp
  where rp.tenant_id = p_tenant_id
    and rp.role = v_role
    and rp.module = p_module
  limit 1;

  if found then
    return coalesce(v_allowed, false);
  end if;

  -- For 'appointments' module, also check role-level 'appointments:own'
  if p_module = 'appointments' then
    select rp.allowed
    into v_allowed
    from public.role_permissions rp
    where rp.tenant_id = p_tenant_id
      and rp.role = v_role
      and rp.module = 'appointments:own'
    limit 1;

    if found then
      return coalesce(v_allowed, false);
    end if;
  end if;

  -- Fallback for tenants that may not yet have seeded role_permissions rows.
  return case v_role
    when 'manager' then p_module in ('dashboard', 'salons_overview', 'appointments', 'customers', 'payments', 'reports', 'staff')
    when 'supervisor' then p_module in ('appointments', 'customers')
    when 'receptionist' then p_module in ('appointments', 'customers')
    else false
  end;
end;
$$;

grant execute on function public.user_has_module_access(uuid, uuid, text) to authenticated;
