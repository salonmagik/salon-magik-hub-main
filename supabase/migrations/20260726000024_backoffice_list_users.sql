-- Read-only cross-platform view of every user and which tenants/roles they
-- hold, for the backoffice Users page. Authorization is deliberately just
-- "caller is any active backoffice member" — page-level visibility (super
-- admin always, others only if granted the "customers_users" page via the
-- existing role-template access-control system) is handled by
-- hasBackofficePageAccess() in the frontend, matching every other backoffice
-- page. No mutations happen anywhere near this — view only.
create or replace function public.backoffice_list_users()
returns table (
  user_id uuid,
  email text,
  phone text,
  full_name text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  tenant_roles jsonb
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1 from public.backoffice_users bu
    where bu.user_id = auth.uid() and coalesce(bu.is_active, true)
  ) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select
    u.id as user_id,
    u.email,
    coalesce(pr.phone, u.phone) as phone,
    coalesce(pr.full_name, u.raw_user_meta_data->>'full_name') as full_name,
    u.created_at,
    u.last_sign_in_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'tenant_id', ur.tenant_id,
            'tenant_name', t.name,
            'role', ur.role,
            'is_active', coalesce(ur.is_active, true)
          )
          order by t.name
        )
        from public.user_roles ur
        join public.tenants t on t.id = ur.tenant_id
        where ur.user_id = u.id
      ),
      '[]'::jsonb
    ) as tenant_roles
  from auth.users u
  left join public.profiles pr on pr.user_id = u.id
  order by u.created_at desc;
end;
$$;

grant execute on function public.backoffice_list_users() to authenticated;
