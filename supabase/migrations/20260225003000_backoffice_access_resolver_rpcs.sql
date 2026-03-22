-- Resolve effective role-template access via security-definer RPCs
-- and expose role templates as a stable payload for Backoffice UI.

create or replace function public.backoffice_get_effective_permissions()
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_backoffice_id uuid;
  v_template_id uuid;
  v_permissions text[];
begin
  if v_actor is null then
    return '{}'::text[];
  end if;

  if has_backoffice_role(v_actor, 'super_admin'::backoffice_role) then
    return array['*'];
  end if;

  select bu.id into v_backoffice_id
  from public.backoffice_users bu
  where bu.user_id = v_actor
    and coalesce(bu.is_active, true) = true
  limit 1;

  if v_backoffice_id is null then
    return '{}'::text[];
  end if;

  select aura.role_template_id into v_template_id
  from public.backoffice_user_role_assignments aura
  where aura.backoffice_user_id = v_backoffice_id
  limit 1;

  if v_template_id is null then
    return '{}'::text[];
  end if;

  select coalesce(array_agg(distinct permission_key), '{}'::text[])
  into v_permissions
  from public.backoffice_role_template_permissions
  where template_id = v_template_id;

  return coalesce(v_permissions, '{}'::text[]);
end;
$$;

grant execute on function public.backoffice_get_effective_permissions() to authenticated;

create or replace function public.backoffice_get_effective_pages()
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_backoffice_id uuid;
  v_template_id uuid;
  v_pages text[];
begin
  if v_actor is null then
    return '{}'::text[];
  end if;

  if has_backoffice_role(v_actor, 'super_admin'::backoffice_role) then
    return array['*'];
  end if;

  select bu.id into v_backoffice_id
  from public.backoffice_users bu
  where bu.user_id = v_actor
    and coalesce(bu.is_active, true) = true
  limit 1;

  if v_backoffice_id is null then
    return '{}'::text[];
  end if;

  select aura.role_template_id into v_template_id
  from public.backoffice_user_role_assignments aura
  where aura.backoffice_user_id = v_backoffice_id
  limit 1;

  if v_template_id is null then
    return '{}'::text[];
  end if;

  select coalesce(array_agg(distinct page_key), '{}'::text[])
  into v_pages
  from public.backoffice_role_template_pages
  where template_id = v_template_id;

  return coalesce(v_pages, '{}'::text[]);
end;
$$;

grant execute on function public.backoffice_get_effective_pages() to authenticated;

create or replace function public.backoffice_list_role_templates()
returns table (
  id uuid,
  name text,
  description text,
  is_active boolean,
  is_system boolean,
  permissions text[],
  pages text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    t.name,
    t.description,
    t.is_active,
    t.is_system,
    coalesce(array_agg(distinct tp.permission_key) filter (where tp.permission_key is not null), '{}'::text[]) as permissions,
    coalesce(array_agg(distinct pg.page_key) filter (where pg.page_key is not null), '{}'::text[]) as pages
  from public.backoffice_role_templates t
  left join public.backoffice_role_template_permissions tp on tp.template_id = t.id
  left join public.backoffice_role_template_pages pg on pg.template_id = t.id
  where is_backoffice_user(auth.uid()) or has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role)
  group by t.id, t.name, t.description, t.is_active, t.is_system
  order by t.is_system desc, t.name asc;
$$;

grant execute on function public.backoffice_list_role_templates() to authenticated;

create or replace function public.ensure_sales_agent_profile(
  p_backoffice_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_target_backoffice_user_id uuid;
  v_sales_agent_id uuid;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_backoffice_user_id is null then
    if not (
      has_backoffice_role(v_actor, 'super_admin'::backoffice_role)
      or backoffice_user_has_permission(v_actor, 'sales.capture_client')
      or backoffice_user_has_permission(v_actor, 'sales.manage_agents_kyc')
    ) then
      raise exception 'ACCESS_DENIED';
    end if;

    select bu.id into v_target_backoffice_user_id
    from public.backoffice_users bu
    where bu.user_id = v_actor
      and coalesce(bu.is_active, true) = true
    limit 1;
  else
    if not (
      has_backoffice_role(v_actor, 'super_admin'::backoffice_role)
      or backoffice_user_has_permission(v_actor, 'sales.manage_agents_kyc')
    ) then
      raise exception 'ACCESS_DENIED';
    end if;

    v_target_backoffice_user_id := p_backoffice_user_id;
  end if;

  if v_target_backoffice_user_id is null then
    raise exception 'BACKOFFICE_USER_NOT_FOUND';
  end if;

  insert into public.sales_agents (
    backoffice_user_id,
    country_code,
    monthly_base_salary,
    employment_status
  )
  values (
    v_target_backoffice_user_id,
    'NG',
    0,
    'active'
  )
  on conflict (backoffice_user_id)
  do update
  set updated_at = now()
  returning id into v_sales_agent_id;

  return v_sales_agent_id;
end;
$$;

grant execute on function public.ensure_sales_agent_profile(uuid) to authenticated;
