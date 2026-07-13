-- Add avatar_url to list_public_booking_eligible_staff so the public booking
-- UI can display staff profile pictures in the staff-selection dropdown.

create or replace function public.list_public_booking_eligible_staff(
  p_tenant_id uuid,
  p_location_id uuid,
  p_service_ids uuid[] default null
)
returns table (
  user_id uuid,
  full_name text,
  role public.app_role,
  avatar_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service_ids uuid[] := coalesce(p_service_ids, '{}'::uuid[]);
  v_mapping_exists boolean := false;
begin
  if p_tenant_id is null or p_location_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.tenants t
    where t.id = p_tenant_id
      and t.online_booking_enabled = true
  ) then
    return;
  end if;

  if array_length(v_service_ids, 1) is not null then
    select exists (
      select 1
      from public.staff_location_services sls
      where sls.tenant_id = p_tenant_id
        and sls.location_id = p_location_id
        and sls.is_enabled = true
        and sls.service_id = any(v_service_ids)
      union all
      select 1
      from public.staff_services ss
      where ss.tenant_id = p_tenant_id
        and (ss.location_id is null or ss.location_id = p_location_id)
        and ss.is_enabled = true
        and ss.service_id = any(v_service_ids)
      union all
      select 1
      from public.staff_service_categories ssc
      join public.services s on s.id = any(v_service_ids) and s.category_id = ssc.category_id
      where ssc.tenant_id = p_tenant_id
        and (ssc.location_id is null or ssc.location_id = p_location_id)
        and ssc.is_enabled = true
    ) into v_mapping_exists;
  end if;

  return query
  with base_staff as (
    select distinct
      ur.user_id,
      coalesce(p.full_name, 'Team Member')::text as full_name,
      ur.role,
      p.avatar_url
    from public.user_roles ur
    join public.staff_locations sl
      on sl.tenant_id = ur.tenant_id
      and sl.user_id = ur.user_id
      and sl.location_id = p_location_id
    left join public.profiles p on p.user_id = ur.user_id
    where ur.tenant_id = p_tenant_id
      and ur.is_active = true
      and ur.role in ('manager'::public.app_role, 'supervisor'::public.app_role, 'staff'::public.app_role)
  ), mapped_staff as (
    select distinct sls.staff_user_id as user_id
    from public.staff_location_services sls
    where sls.tenant_id = p_tenant_id
      and sls.location_id = p_location_id
      and sls.is_enabled = true
      and (array_length(v_service_ids, 1) is null or sls.service_id = any(v_service_ids))

    union

    select distinct ss.staff_user_id as user_id
    from public.staff_services ss
    where ss.tenant_id = p_tenant_id
      and (ss.location_id is null or ss.location_id = p_location_id)
      and ss.is_enabled = true
      and (array_length(v_service_ids, 1) is null or ss.service_id = any(v_service_ids))

    union

    select distinct ssc.staff_user_id as user_id
    from public.staff_service_categories ssc
    join public.services s
      on s.tenant_id = p_tenant_id
      and s.category_id = ssc.category_id
      and (array_length(v_service_ids, 1) is null or s.id = any(v_service_ids))
    where ssc.tenant_id = p_tenant_id
      and (ssc.location_id is null or ssc.location_id = p_location_id)
      and ssc.is_enabled = true
  )
  select
    b.user_id,
    b.full_name,
    b.role,
    b.avatar_url
  from base_staff b
  where (not v_mapping_exists)
     or b.user_id in (select m.user_id from mapped_staff m)
  order by
    case b.role
      when 'manager' then 1
      when 'supervisor' then 2
      when 'staff' then 3
      else 4
    end,
    b.full_name;
end;
$$;

grant execute on function public.list_public_booking_eligible_staff(uuid, uuid, uuid[]) to anon, authenticated;
