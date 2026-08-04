-- Two real gaps found in prod:
--
-- 1. "Users can create tenants" (with_check: true) on public.tenants made
--    the more restrictive "Authenticated users can create tenants during
--    onboarding" policy meaningless — RLS policies for the same command are
--    OR'd, so literally any authenticated user, including one who already
--    belongs to a tenant, could insert an arbitrary tenant row. Drop it;
--    the remaining policy (no existing user_roles row) is the correct rule
--    for the self-serve onboarding flow.
--
-- 2. "Users can create own user_role" only checked auth.uid() = user_id,
--    with no restriction on the role value — a "staff" or "receptionist"
--    onboarding selection could self-insert as staff/receptionist, creating
--    a tenant with no owner/manager/supervisor able to invite the actual
--    owner (staff-invite permission defaults to owner/manager/supervisor
--    only), silently stranding the business. Every other role-assignment
--    path (staff invitations, backoffice owner-add, role changes) goes
--    through a service-role edge function and bypasses this policy
--    entirely, so restricting it here only affects self-serve onboarding.

drop policy if exists "Users can create tenants" on public.tenants;

drop policy if exists "Users can create own user_role" on public.user_roles;

create policy "Users can create own user_role"
on public.user_roles
for insert
with check (
  auth.uid() = user_id
  and role in ('owner', 'manager', 'supervisor')
);
