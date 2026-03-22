-- Allow onboarding to assign the signed-in non-owner user to their default branch.
-- This preserves RLS boundaries by limiting inserts to:
-- - the authenticated user as user_id
-- - tenants the user already belongs to via user_roles

drop policy if exists "Users can insert own staff_locations during onboarding" on public.staff_locations;

create policy "Users can insert own staff_locations during onboarding"
on public.staff_locations
for insert
to authenticated
with check (
  user_id = auth.uid()
  and tenant_id in (select public.get_user_tenant_ids(auth.uid()))
);

