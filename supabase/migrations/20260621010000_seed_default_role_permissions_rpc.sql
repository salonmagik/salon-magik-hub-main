-- seedDefaultPermissions() inserts directly into role_permissions from the client,
-- but the INSERT policy only allows the tenant's current OWNER. During onboarding,
-- the person setting things up may have picked a non-owner role for themselves
-- (because they're inviting someone else as owner), so the insert is silently
-- denied by RLS and that tenant never gets its default permissions seeded.
--
-- Rather than broadening the standing RLS policy (which would let any tenant
-- creator write to this table indefinitely), this RPC does the seeding itself
-- with two narrow, one-time-only checks: caller must belong to the tenant, and
-- the tenant must not already have any role_permissions rows. Once seeded, this
-- can never run again for that tenant — it's a bootstrap step, not an ongoing
-- write path.

create or replace function public.seed_default_role_permissions(
  p_tenant_id uuid,
  p_permissions jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_inserted integer := 0;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not exists (
    select 1 from public.user_roles
    where user_id = v_actor and tenant_id = p_tenant_id
  ) then
    raise exception 'TENANT_ACCESS_DENIED';
  end if;

  if exists (select 1 from public.role_permissions where tenant_id = p_tenant_id) then
    return 0;
  end if;

  insert into public.role_permissions (tenant_id, role, module, allowed)
  select
    p_tenant_id,
    (value->>'role')::public.app_role,
    value->>'module',
    (value->>'allowed')::boolean
  from jsonb_array_elements(p_permissions) as value
  where coalesce(value->>'role', '') <> ''
    and coalesce(value->>'module', '') <> '';

  select count(*) into v_inserted from public.role_permissions where tenant_id = p_tenant_id;
  return v_inserted;
end;
$$;

grant execute on function public.seed_default_role_permissions(uuid, jsonb) to authenticated;
