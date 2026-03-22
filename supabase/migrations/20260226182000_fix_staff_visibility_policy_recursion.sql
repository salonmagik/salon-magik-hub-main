-- Hotfix for login stall introduced by recursive tenant-read policies.
-- Use SECURITY DEFINER helper for tenant membership to avoid user_roles self-recursion.

drop policy if exists "Users can read tenant roles" on public.user_roles;
create policy "Users can read tenant roles"
  on public.user_roles
  for select
  to authenticated
  using (
    tenant_id in (select public.get_user_tenant_ids(auth.uid()))
  );

drop policy if exists "Users can read tenant member profiles" on public.profiles;
create policy "Users can read tenant member profiles"
  on public.profiles
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.user_roles ur
      where ur.user_id = profiles.user_id
        and ur.tenant_id in (select public.get_user_tenant_ids(auth.uid()))
    )
  );
