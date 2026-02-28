-- Harden tenant-data access so app-role permissions are enforced at DB layer.
-- This closes the gap where tenant membership alone granted read/write access.

-- 1) Active-membership only tenant helper.
create or replace function public.get_user_tenant_ids(_user_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct tenant_id
  from public.user_roles
  where user_id = _user_id
    and coalesce(is_active, true) = true
$$;

-- 2) Canonical module-permission resolver for RLS checks.
create or replace function public.user_has_module_access(
  p_user_id uuid,
  p_tenant_id uuid,
  p_module text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.app_role;
  v_allowed boolean;
begin
  if p_user_id is null or p_tenant_id is null or p_module is null then
    return false;
  end if;

  select ur.role
  into v_role
  from public.user_roles ur
  where ur.user_id = p_user_id
    and ur.tenant_id = p_tenant_id
    and coalesce(ur.is_active, true) = true
  order by case ur.role
    when 'owner' then 1
    when 'manager' then 2
    when 'supervisor' then 3
    when 'receptionist' then 4
    else 5
  end
  limit 1;

  if v_role is null then
    return false;
  end if;

  if v_role = 'owner' then
    return true;
  end if;

  select uo.allowed
  into v_allowed
  from public.user_permission_overrides uo
  where uo.tenant_id = p_tenant_id
    and uo.user_id = p_user_id
    and uo.module = p_module
  limit 1;

  if found then
    return coalesce(v_allowed, false);
  end if;

  select rp.allowed
  into v_allowed
  from public.role_permissions rp
  where rp.tenant_id = p_tenant_id
    and rp.role = v_role
    and rp.module = p_module
  limit 1;

  if found then
    return coalesce(v_allowed, false);
  end if;

  -- Fallback for tenants that may not yet have seeded role_permissions rows.
  return case v_role
    when 'manager' then p_module in ('dashboard', 'salons_overview', 'appointments', 'customers', 'payments', 'reports', 'staff')
    when 'supervisor' then p_module in ('appointments', 'customers')
    when 'receptionist' then p_module in ('appointments', 'customers')
    else false
  end;
end;
$$;

grant execute on function public.user_has_module_access(uuid, uuid, text) to authenticated;

-- 3) Replace membership-only policies with permissioned policies.

-- customers
drop policy if exists "Users can read tenant customers" on public.customers;
drop policy if exists "Users can create customers for their tenants" on public.customers;
drop policy if exists "Users can update tenant customers" on public.customers;

create policy "Users can read tenant customers (permissioned)"
  on public.customers
  for select
  to authenticated
  using (
    tenant_id in (select public.get_user_tenant_ids(auth.uid()))
    and public.user_has_module_access(auth.uid(), tenant_id, 'customers')
  );

create policy "Users can create tenant customers (permissioned)"
  on public.customers
  for insert
  to authenticated
  with check (
    tenant_id in (select public.get_user_tenant_ids(auth.uid()))
    and public.user_has_module_access(auth.uid(), tenant_id, 'customers')
  );

create policy "Users can update tenant customers (permissioned)"
  on public.customers
  for update
  to authenticated
  using (
    tenant_id in (select public.get_user_tenant_ids(auth.uid()))
    and public.user_has_module_access(auth.uid(), tenant_id, 'customers')
  )
  with check (
    tenant_id in (select public.get_user_tenant_ids(auth.uid()))
    and public.user_has_module_access(auth.uid(), tenant_id, 'customers')
  );

-- customer_purses
drop policy if exists "Users can read tenant customer_purses" on public.customer_purses;

create policy "Users can read tenant customer_purses (permissioned)"
  on public.customer_purses
  for select
  to authenticated
  using (
    tenant_id in (select public.get_user_tenant_ids(auth.uid()))
    and public.user_has_module_access(auth.uid(), tenant_id, 'payments')
  );

-- transactions
drop policy if exists "Users can read tenant transactions" on public.transactions;
drop policy if exists "Users can create transactions for their tenants" on public.transactions;
drop policy if exists "Users can update tenant transactions" on public.transactions;

create policy "Users can read tenant transactions (permissioned)"
  on public.transactions
  for select
  to authenticated
  using (
    tenant_id in (select public.get_user_tenant_ids(auth.uid()))
    and public.user_has_module_access(auth.uid(), tenant_id, 'payments')
  );

create policy "Users can create tenant transactions (permissioned)"
  on public.transactions
  for insert
  to authenticated
  with check (
    tenant_id in (select public.get_user_tenant_ids(auth.uid()))
    and public.user_has_module_access(auth.uid(), tenant_id, 'payments')
  );

create policy "Users can update tenant transactions (permissioned)"
  on public.transactions
  for update
  to authenticated
  using (
    tenant_id in (select public.get_user_tenant_ids(auth.uid()))
    and public.user_has_module_access(auth.uid(), tenant_id, 'payments')
  )
  with check (
    tenant_id in (select public.get_user_tenant_ids(auth.uid()))
    and public.user_has_module_access(auth.uid(), tenant_id, 'payments')
  );

-- refund_requests
drop policy if exists "Users can read tenant refund_requests" on public.refund_requests;
drop policy if exists "Users can create refund requests for their tenants" on public.refund_requests;
drop policy if exists "Users can update refund requests for their tenants" on public.refund_requests;

create policy "Users can read tenant refund_requests (permissioned)"
  on public.refund_requests
  for select
  to authenticated
  using (
    tenant_id in (select public.get_user_tenant_ids(auth.uid()))
    and public.user_has_module_access(auth.uid(), tenant_id, 'payments')
  );

create policy "Users can create tenant refund_requests (permissioned)"
  on public.refund_requests
  for insert
  to authenticated
  with check (
    tenant_id in (select public.get_user_tenant_ids(auth.uid()))
    and public.user_has_module_access(auth.uid(), tenant_id, 'payments')
  );

create policy "Users can update tenant refund_requests (permissioned)"
  on public.refund_requests
  for update
  to authenticated
  using (
    tenant_id in (select public.get_user_tenant_ids(auth.uid()))
    and public.user_has_module_access(auth.uid(), tenant_id, 'payments')
  )
  with check (
    tenant_id in (select public.get_user_tenant_ids(auth.uid()))
    and public.user_has_module_access(auth.uid(), tenant_id, 'payments')
  );
