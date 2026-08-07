-- backoffice_list_users declared its return column as `email text`, but
-- auth.users.email is `character varying(255)` — every call errored with
-- "structure of query does not match function result type" (PGRST/PL⁠pgSQL
-- 42804). The frontend's useQuery only ever read `data`/`isLoading`, never
-- surfaced `error`, so this silently rendered as an empty Users table
-- instead of an actual error — indistinguishable from "no users" even
-- though tenants (and their user_roles) existed.

begin;

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
    u.email::text,
    coalesce(pr.phone, u.phone)::text as phone,
    coalesce(pr.full_name, u.raw_user_meta_data->>'full_name')::text as full_name,
    u.created_at,
    u.last_sign_in_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'tenant_id', ur.tenant_id,
            'tenant_name', t.name,
            'role', ur.role,
            'is_active', coalesce(ur.is_active, true),
            'plan', t.plan,
            'subscription_status', t.subscription_status,
            'trial_ends_at', t.trial_ends_at
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

commit;
