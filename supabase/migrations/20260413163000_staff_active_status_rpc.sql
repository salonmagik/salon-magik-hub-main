create or replace function public.set_staff_active_status(
  p_tenant_id uuid,
  p_user_id uuid,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role public.app_role;
  v_target_role_row_id uuid;
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
  end,
  ur.created_at desc,
  ur.id desc
  limit 1;

  if v_actor_role not in ('owner', 'manager') then
    raise exception 'STAFF_STATUS_UPDATE_FORBIDDEN';
  end if;

  if not exists (
    select 1
    from public.user_roles ur
    where ur.tenant_id = p_tenant_id
      and ur.user_id = p_user_id
  ) then
    raise exception 'TARGET_USER_NOT_IN_TENANT';
  end if;

  if exists (
    select 1
    from public.user_roles ur
    where ur.tenant_id = p_tenant_id
      and ur.user_id = p_user_id
      and ur.role = 'owner'::public.app_role
  ) then
    raise exception 'OWNER_ROLE_IMMUTABLE';
  end if;

  if p_is_active then
    select ur.id
      into v_target_role_row_id
    from public.user_roles ur
    where ur.tenant_id = p_tenant_id
      and ur.user_id = p_user_id
    order by ur.created_at desc, ur.id desc
    limit 1;

    if v_target_role_row_id is null then
      raise exception 'TARGET_ROLE_ROW_NOT_FOUND';
    end if;

    update public.user_roles
    set is_active = false
    where tenant_id = p_tenant_id
      and user_id = p_user_id
      and id <> v_target_role_row_id;

    update public.user_roles
    set is_active = true
    where id = v_target_role_row_id;

    return;
  end if;

  update public.user_roles
  set is_active = false
  where tenant_id = p_tenant_id
    and user_id = p_user_id;
end;
$$;

grant execute on function public.set_staff_active_status(uuid, uuid, boolean) to authenticated;
