-- Fix return type mismatch in list_tenant_staff_members(): auth.users.email is varchar.
-- RPC contract expects column 5 (email) as text.

create or replace function public.list_tenant_staff_members(
  p_tenant_id uuid,
  p_context_type text default 'location',
  p_location_id uuid default null
)
returns table (
  user_id uuid,
  role public.app_role,
  is_active boolean,
  role_assigned_at timestamptz,
  email text,
  joined_at timestamptz,
  profile_id uuid,
  full_name text,
  phone text,
  avatar_url text,
  profile_created_at timestamptz,
  profile_updated_at timestamptz,
  assigned_location_ids uuid[],
  assigned_location_names text[],
  assigned_location_count integer,
  is_unassigned boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role public.app_role;
  v_actor_scope_ids uuid[] := '{}'::uuid[];
begin
  if v_actor is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if p_context_type not in ('owner_hub', 'location') then
    raise exception 'INVALID_CONTEXT_TYPE';
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

  if v_actor_role is null then
    raise exception 'TENANT_ACCESS_DENIED';
  end if;

  if v_actor_role <> 'owner' then
    if p_context_type = 'location' and p_location_id is not null then
      select coalesce(array_agg(l.id), '{}'::uuid[])
        into v_actor_scope_ids
      from public.locations l
      where l.tenant_id = p_tenant_id
        and l.id = p_location_id;
    else
      select coalesce(array_agg(distinct sl.location_id), '{}'::uuid[])
        into v_actor_scope_ids
      from public.staff_locations sl
      where sl.tenant_id = p_tenant_id
        and sl.user_id = v_actor;
    end if;
  end if;

  return query
  with canonical_roles as (
    select distinct on (ur.user_id)
      ur.id,
      ur.user_id,
      ur.role,
      coalesce(ur.is_active, true) as is_active,
      ur.created_at
    from public.user_roles ur
    where ur.tenant_id = p_tenant_id
    order by
      ur.user_id,
      coalesce(ur.is_active, true) desc,
      ur.created_at desc,
      ur.id desc
  ),
  all_tenant_locations as (
    select
      coalesce(array_agg(l.id order by l.is_default desc, l.created_at asc), '{}'::uuid[]) as ids,
      coalesce(array_agg(l.name order by l.is_default desc, l.created_at asc), '{}'::text[]) as names
    from public.locations l
    where l.tenant_id = p_tenant_id
  ),
  member_assignments as (
    select
      cr.user_id,
      cr.role,
      case
        when cr.role = 'owner'::public.app_role then atl.ids
        else coalesce(array_agg(distinct sl.location_id) filter (where sl.location_id is not null), '{}'::uuid[])
      end as assigned_location_ids,
      case
        when cr.role = 'owner'::public.app_role then atl.names
        else coalesce(array_agg(distinct l.name) filter (where l.name is not null), '{}'::text[])
      end as assigned_location_names
    from canonical_roles cr
    cross join all_tenant_locations atl
    left join public.staff_locations sl
      on sl.tenant_id = p_tenant_id
     and sl.user_id = cr.user_id
    left join public.locations l
      on l.id = sl.location_id
     and l.tenant_id = p_tenant_id
    group by cr.user_id, cr.role, atl.ids, atl.names
  ),
  invitation_by_user as (
    select distinct on (si.user_id)
      si.user_id,
      lower(si.email) as email,
      si.password_changed_at,
      si.created_at
    from public.staff_invitations si
    where si.tenant_id = p_tenant_id
      and si.user_id is not null
    order by
      si.user_id,
      coalesce(si.password_changed_at, si.accepted_at, si.created_at) desc,
      si.created_at desc
  ),
  invitation_by_email as (
    select distinct on (lower(si.email))
      lower(si.email) as email,
      si.password_changed_at,
      si.created_at
    from public.staff_invitations si
    where si.tenant_id = p_tenant_id
      and si.email is not null
    order by
      lower(si.email),
      coalesce(si.password_changed_at, si.accepted_at, si.created_at) desc,
      si.created_at desc
  ),
  scoped_rows as (
    select
      cr.user_id,
      cr.role,
      cr.is_active,
      cr.created_at as role_assigned_at,
      p.id as profile_id,
      p.full_name,
      p.phone,
      p.avatar_url,
      p.created_at as profile_created_at,
      p.updated_at as profile_updated_at,
      au.email as auth_email,
      au.created_at as auth_created_at,
      ibu.password_changed_at as invited_password_changed_at,
      ibe.password_changed_at as email_password_changed_at,
      ma.assigned_location_ids,
      ma.assigned_location_names
    from canonical_roles cr
    join member_assignments ma
      on ma.user_id = cr.user_id
    left join public.profiles p
      on p.user_id = cr.user_id
    left join auth.users au
      on au.id = cr.user_id
    left join invitation_by_user ibu
      on ibu.user_id = cr.user_id
    left join invitation_by_email ibe
      on ibe.email = lower(au.email)
    where
      v_actor_role = 'owner'::public.app_role
      or (
        coalesce(array_length(v_actor_scope_ids, 1), 0) > 0
        and ma.assigned_location_ids && v_actor_scope_ids
      )
  )
  select
    sr.user_id,
    sr.role,
    sr.is_active,
    sr.role_assigned_at,
    coalesce(sr.auth_email::text, lower(ibu.email)::text) as email,
    coalesce(sr.invited_password_changed_at, sr.email_password_changed_at, sr.auth_created_at) as joined_at,
    sr.profile_id,
    sr.full_name,
    sr.phone,
    sr.avatar_url,
    sr.profile_created_at,
    sr.profile_updated_at,
    sr.assigned_location_ids,
    sr.assigned_location_names,
    coalesce(array_length(sr.assigned_location_ids, 1), 0)::integer as assigned_location_count,
    (sr.role <> 'owner'::public.app_role and coalesce(array_length(sr.assigned_location_ids, 1), 0) = 0) as is_unassigned
  from scoped_rows sr
  left join invitation_by_user ibu on ibu.user_id = sr.user_id
  order by
    sr.is_active desc,
    coalesce(sr.full_name, coalesce(sr.auth_email, lower(ibu.email)), sr.user_id::text) asc;
end;
$$;

grant execute on function public.list_tenant_staff_members(uuid, text, uuid) to authenticated;
