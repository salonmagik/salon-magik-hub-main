-- Admins & Roles revamp foundation.
-- Keeps super_admin as the only fixed base role and makes custom roles canonical for non-super admins.

alter table if exists public.backoffice_users
  add column if not exists email text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists phone text,
  add column if not exists is_sales_agent boolean not null default false;

update public.backoffice_users bu
set
  email = coalesce(bu.email, lower(au.email)),
  first_name = coalesce(
    nullif(trim(bu.first_name), ''),
    nullif(trim(split_part(coalesce(au.raw_user_meta_data ->> 'full_name', ''), ' ', 1)), ''),
    nullif(trim(split_part(coalesce(au.email, ''), '@', 1)), '')
  ),
  last_name = coalesce(
    nullif(trim(bu.last_name), ''),
    nullif(trim(regexp_replace(coalesce(au.raw_user_meta_data ->> 'full_name', ''), '^\S+\s*', '')), '')
  )
from auth.users au
where bu.user_id = au.id;

create or replace function public.backoffice_member_status(
  p_is_active boolean,
  p_temp_password_required boolean
)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_is_active, true) = false then 'deactivated'
    when coalesce(p_temp_password_required, false) = true then 'invited'
    else 'active'
  end;
$$;

create or replace function public.backoffice_list_team_members()
returns table (
  id uuid,
  user_id uuid,
  full_name text,
  first_name text,
  last_name text,
  email text,
  phone text,
  email_domain text,
  base_role text,
  role_template_id uuid,
  role_name text,
  status text,
  is_active boolean,
  totp_enabled boolean,
  is_logged_in boolean,
  is_sales_agent boolean,
  last_login_at timestamptz,
  last_activity_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not is_backoffice_user(v_actor) then
    raise exception 'BACKOFFICE_ACCESS_REQUIRED';
  end if;

  return query
    with session_stats as (
      select
        bs.user_id,
        bool_or(bs.ended_at is null) as is_logged_in,
        max(bs.last_activity_at) as last_activity_at
      from public.backoffice_sessions bs
      group by bs.user_id
    ),
    assignments as (
      select
        a.backoffice_user_id,
        a.role_template_id,
        t.name as role_name
      from public.backoffice_user_role_assignments a
      join public.backoffice_role_templates t on t.id = a.role_template_id
    )
    select
      bu.id,
      bu.user_id,
      trim(concat_ws(' ', nullif(trim(bu.first_name), ''), nullif(trim(bu.last_name), ''))) as full_name,
      bu.first_name,
      bu.last_name,
      coalesce(nullif(trim(bu.email), ''), lower(au.email)) as email,
      bu.phone,
      bu.email_domain,
      bu.role::text as base_role,
      asn.role_template_id,
      case
        when bu.role = 'super_admin'::public.backoffice_role then 'Super Admin'
        else coalesce(asn.role_name, 'Unassigned')
      end as role_name,
      public.backoffice_member_status(coalesce(bu.is_active, true), coalesce(bu.temp_password_required, false)) as status,
      coalesce(bu.is_active, true) as is_active,
      coalesce(bu.totp_enabled, false) as totp_enabled,
      coalesce(ss.is_logged_in, false) as is_logged_in,
      coalesce(bu.is_sales_agent, false) as is_sales_agent,
      bu.last_login_at,
      ss.last_activity_at,
      bu.created_at
    from public.backoffice_users bu
    left join auth.users au on au.id = bu.user_id
    left join assignments asn on asn.backoffice_user_id = bu.id
    left join session_stats ss on ss.user_id = bu.user_id
    order by bu.created_at desc;
end;
$$;

grant execute on function public.backoffice_list_team_members() to authenticated;

create or replace function public.backoffice_list_roles_with_stats()
returns table (
  id uuid,
  name text,
  description text,
  is_active boolean,
  is_system boolean,
  admins_count bigint,
  access_pages_count text,
  access_subpages_count text,
  permissions_count text,
  permissions text[],
  pages text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_total_permissions integer;
  v_total_pages integer;
  v_total_subpages integer;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not is_backoffice_user(v_actor) then
    raise exception 'BACKOFFICE_ACCESS_REQUIRED';
  end if;

  select count(*) into v_total_permissions from public.backoffice_permission_keys;

  select
    count(*) filter (where coalesce(array_length(string_to_array(trim(both '/' from route_path), '/'), 1), 0) <= 1),
    count(*) filter (where coalesce(array_length(string_to_array(trim(both '/' from route_path), '/'), 1), 0) > 1)
  into v_total_pages, v_total_subpages
  from public.backoffice_page_keys;

  return query
    with role_pages as (
      select
        p.template_id,
        count(*) filter (where coalesce(array_length(string_to_array(trim(both '/' from k.route_path), '/'), 1), 0) <= 1) as pages_count,
        count(*) filter (where coalesce(array_length(string_to_array(trim(both '/' from k.route_path), '/'), 1), 0) > 1) as subpages_count,
        coalesce(array_agg(distinct p.page_key), '{}'::text[]) as pages
      from public.backoffice_role_template_pages p
      join public.backoffice_page_keys k on k.key = p.page_key
      group by p.template_id
    ),
    role_permissions as (
      select
        p.template_id,
        count(*) as permissions_count,
        coalesce(array_agg(distinct p.permission_key), '{}'::text[]) as permissions
      from public.backoffice_role_template_permissions p
      group by p.template_id
    ),
    role_admins as (
      select
        a.role_template_id,
        count(*) as admins_count
      from public.backoffice_user_role_assignments a
      group by a.role_template_id
    )
    select
      t.id,
      t.name,
      t.description,
      t.is_active,
      t.is_system,
      coalesce(ra.admins_count, 0),
      case
        when coalesce(rp.pages_count, 0) >= coalesce(v_total_pages, 0) and v_total_pages > 0 then 'ALL'
        else coalesce(rp.pages_count, 0)::text
      end as access_pages_count,
      case
        when coalesce(rp.subpages_count, 0) >= coalesce(v_total_subpages, 0) and v_total_subpages > 0 then 'ALL'
        else coalesce(rp.subpages_count, 0)::text
      end as access_subpages_count,
      case
        when coalesce(rperm.permissions_count, 0) >= coalesce(v_total_permissions, 0) and v_total_permissions > 0 then 'ALL'
        else coalesce(rperm.permissions_count, 0)::text
      end as permissions_count,
      coalesce(rperm.permissions, '{}'::text[]),
      coalesce(rp.pages, '{}'::text[])
    from public.backoffice_role_templates t
    left join role_pages rp on rp.template_id = t.id
    left join role_permissions rperm on rperm.template_id = t.id
    left join role_admins ra on ra.role_template_id = t.id
    order by t.is_system desc, t.name asc;
end;
$$;

grant execute on function public.backoffice_list_roles_with_stats() to authenticated;

create or replace function public.backoffice_create_role(
  p_name text,
  p_description text,
  p_permission_keys text[] default '{}'::text[],
  p_page_keys text[] default '{}'::text[]
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.backoffice_create_role_template(p_name, p_description, p_permission_keys, p_page_keys);
$$;

grant execute on function public.backoffice_create_role(text, text, text[], text[]) to authenticated;

create or replace function public.backoffice_update_role(
  p_role_id uuid,
  p_name text,
  p_description text,
  p_permission_keys text[] default '{}'::text[],
  p_page_keys text[] default '{}'::text[],
  p_is_active boolean default true
)
returns public.backoffice_role_templates
language sql
security definer
set search_path = public
as $$
  select public.backoffice_update_role_template(p_role_id, p_name, p_description, p_permission_keys, p_page_keys, p_is_active);
$$;

grant execute on function public.backoffice_update_role(uuid, text, text, text[], text[], boolean) to authenticated;

create or replace function public.backoffice_assign_user_role(
  p_backoffice_user_id uuid,
  p_role_id uuid
)
returns public.backoffice_user_role_assignments
language sql
security definer
set search_path = public
as $$
  select public.backoffice_assign_user_template(p_backoffice_user_id, p_role_id);
$$;

grant execute on function public.backoffice_assign_user_role(uuid, uuid) to authenticated;
