-- Permanent fix for backoffice role-template visibility/access resolution.
-- Root issue: helper functions depended on temp_password_required and blocked active users from RLS-protected reads.

-- Normalize legacy rows.
alter table if exists public.backoffice_users
  alter column temp_password_required set default false;

update public.backoffice_users
set temp_password_required = false
where temp_password_required is null;

-- Helper functions should only depend on active status.
create or replace function public.is_backoffice_user(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.backoffice_users
    where user_id = _user_id
      and coalesce(is_active, true) = true
  );
$$;

create or replace function public.has_backoffice_role(_user_id uuid, _role backoffice_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.backoffice_users
    where user_id = _user_id
      and role = _role
      and coalesce(is_active, true) = true
  );
$$;

-- Permission resolution should not depend on other helper functions.
create or replace function public.backoffice_user_has_permission(
  p_user_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.backoffice_users bu
      where bu.user_id = p_user_id
        and bu.role = 'super_admin'::backoffice_role
        and coalesce(bu.is_active, true) = true
    )
    or exists (
      select 1
      from public.backoffice_users bu
      join public.backoffice_user_role_assignments aura on aura.backoffice_user_id = bu.id
      join public.backoffice_role_templates t on t.id = aura.role_template_id and t.is_active
      join public.backoffice_role_template_permissions tp on tp.template_id = t.id
      where bu.user_id = p_user_id
        and coalesce(bu.is_active, true) = true
        and tp.permission_key = p_permission_key
    );
$$;

grant execute on function public.backoffice_user_has_permission(uuid, text) to authenticated;

-- Resolver RPCs: direct checks against active backoffice user.
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
  v_permissions text[];
begin
  if v_actor is null then
    return '{}'::text[];
  end if;

  select bu.id
  into v_backoffice_id
  from public.backoffice_users bu
  where bu.user_id = v_actor
    and coalesce(bu.is_active, true) = true
  limit 1;

  if v_backoffice_id is null then
    return '{}'::text[];
  end if;

  if exists (
    select 1
    from public.backoffice_users bu
    where bu.user_id = v_actor
      and bu.role = 'super_admin'::backoffice_role
      and coalesce(bu.is_active, true) = true
  ) then
    return array['*'];
  end if;

  select coalesce(array_agg(distinct p.permission_key), '{}'::text[])
  into v_permissions
  from public.backoffice_user_role_assignments a
  join public.backoffice_role_templates t on t.id = a.role_template_id and t.is_active
  left join public.backoffice_role_template_permissions p on p.template_id = t.id
  where a.backoffice_user_id = v_backoffice_id;

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
  v_pages text[];
begin
  if v_actor is null then
    return '{}'::text[];
  end if;

  select bu.id
  into v_backoffice_id
  from public.backoffice_users bu
  where bu.user_id = v_actor
    and coalesce(bu.is_active, true) = true
  limit 1;

  if v_backoffice_id is null then
    return '{}'::text[];
  end if;

  if exists (
    select 1
    from public.backoffice_users bu
    where bu.user_id = v_actor
      and bu.role = 'super_admin'::backoffice_role
      and coalesce(bu.is_active, true) = true
  ) then
    return array['*'];
  end if;

  select coalesce(array_agg(distinct p.page_key), '{}'::text[])
  into v_pages
  from public.backoffice_user_role_assignments a
  join public.backoffice_role_templates t on t.id = a.role_template_id and t.is_active
  left join public.backoffice_role_template_pages p on p.template_id = t.id
  where a.backoffice_user_id = v_backoffice_id;

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
  with actor as (
    select bu.id, bu.role
    from public.backoffice_users bu
    where bu.user_id = auth.uid()
      and coalesce(bu.is_active, true) = true
    limit 1
  )
  select
    t.id,
    t.name,
    t.description,
    t.is_active,
    t.is_system,
    coalesce(array_agg(distinct tp.permission_key) filter (where tp.permission_key is not null), '{}'::text[]) as permissions,
    coalesce(array_agg(distinct pg.page_key) filter (where pg.page_key is not null), '{}'::text[]) as pages
  from actor a
  join public.backoffice_role_templates t on true
  left join public.backoffice_role_template_permissions tp on tp.template_id = t.id
  left join public.backoffice_role_template_pages pg on pg.template_id = t.id
  group by t.id, t.name, t.description, t.is_active, t.is_system
  order by t.is_system desc, t.name asc;
$$;

grant execute on function public.backoffice_list_role_templates() to authenticated;

-- RLS policies for role-template reads should accept any active backoffice user.
drop policy if exists "Backoffice can read role templates" on public.backoffice_role_templates;
create policy "Backoffice can read role templates"
  on public.backoffice_role_templates
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.backoffice_users bu
      where bu.user_id = auth.uid()
        and coalesce(bu.is_active, true) = true
    )
  );

drop policy if exists "Backoffice can read role template permissions" on public.backoffice_role_template_permissions;
create policy "Backoffice can read role template permissions"
  on public.backoffice_role_template_permissions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.backoffice_users bu
      where bu.user_id = auth.uid()
        and coalesce(bu.is_active, true) = true
    )
  );

drop policy if exists "Backoffice can read role template pages" on public.backoffice_role_template_pages;
create policy "Backoffice can read role template pages"
  on public.backoffice_role_template_pages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.backoffice_users bu
      where bu.user_id = auth.uid()
        and coalesce(bu.is_active, true) = true
    )
  );

drop policy if exists "Backoffice can read role assignments" on public.backoffice_user_role_assignments;
create policy "Backoffice can read role assignments"
  on public.backoffice_user_role_assignments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.backoffice_users bu
      where bu.user_id = auth.uid()
        and coalesce(bu.is_active, true) = true
    )
  );
