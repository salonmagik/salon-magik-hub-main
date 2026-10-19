-- Staff shouldn't have the 'customers' module permission (full CRM access,
-- gated by the RLS policies added in 20260228190000_permission_harden_tenant_data_rls.sql),
-- but they DO need to pick an existing customer when booking/recording an
-- appointment -- otherwise that flow is broken for any role without the
-- 'customers' module. Give that one narrow need its own RPC, independent of
-- the customers RLS policy, rather than relaxing it.
create or replace function public.list_bookable_customers(p_tenant_id uuid)
returns table (
  id uuid,
  full_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not exists (
    select 1 from public.user_roles r
    where r.user_id = auth.uid() and r.tenant_id = p_tenant_id and coalesce(r.is_active, true)
  ) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select c.id, c.full_name
  from public.customers c
  where c.tenant_id = p_tenant_id
    and c.status <> 'deleted'
  order by c.full_name asc;
end;
$$;

grant execute on function public.list_bookable_customers(uuid) to authenticated;
