-- Fix tenant staff visibility in salon-admin staff/team members views.
-- Root cause: RLS only allowed reading own user_roles/profile rows.

drop policy if exists "Users can read tenant roles" on public.user_roles;
create policy "Users can read tenant roles"
  on public.user_roles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_roles actor
      where actor.user_id = auth.uid()
        and actor.tenant_id = user_roles.tenant_id
        and coalesce(actor.is_active, true) = true
    )
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
      from public.user_roles actor
      join public.user_roles target on target.tenant_id = actor.tenant_id
      where actor.user_id = auth.uid()
        and coalesce(actor.is_active, true) = true
        and target.user_id = profiles.user_id
    )
  );
