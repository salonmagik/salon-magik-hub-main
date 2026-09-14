-- Co-owner invite (AD-1, AD-6, AD-7, AD-11). Reuses staff_invitations with
-- role='owner' (AD-1) — no new table, no new column. This migration adds:
--   1. A partial unique index enforcing one pending owner invitation per
--      tenant (FR-14).
--   2. Role-aware replacements of the three staff_invitations RLS policies
--      (AD-7) — strictly narrowing, a no-op against current data since no
--      row has role='owner' yet.
--   3. get_my_pending_co_owner_invitation() (AD-6) — self-scoped read for an
--      invitee who isn't yet a tenant member.
--   4. list_tenant_owners_service(uuid) (AD-11) — service-role-only owner
--      roster for the edge functions.

-- 1. One pending owner invitation per tenant (FR-14). A partial unique
-- index, not just an application check, so the guarantee holds under
-- concurrent sends (Database Changes).
create unique index if not exists staff_invitations_one_pending_owner_per_tenant
  on public.staff_invitations (tenant_id)
  where role = 'owner' and status = 'pending';

-- staff_invitations.user_id is already queried by complete-password-change;
-- confirm/add an index for accept-co-owner-invitation's (user_id, role,
-- status) lookup (Database Changes / Performance Considerations).
create index if not exists staff_invitations_user_id_idx
  on public.staff_invitations (user_id);

-- 2. Role-aware RLS on staff_invitations (AD-7). Drop and recreate the three
-- policies from 20260202235626_...sql, each keeping its existing predicate
-- and adding an owner-row clause. Rows with role <> 'owner' behave
-- byte-identically to today; role='owner' rows additionally require the
-- caller to be an active owner of that tenant.
drop policy if exists "Users can read tenant invitations" on public.staff_invitations;
drop policy if exists "Users can create invitations" on public.staff_invitations;
drop policy if exists "Users can update invitations" on public.staff_invitations;

create policy "Users can read tenant invitations" on public.staff_invitations
  for select using (
    tenant_id in (select get_user_tenant_ids(auth.uid()))
    and (role <> 'owner' or is_tenant_owner(auth.uid(), tenant_id))
  );

create policy "Users can create invitations" on public.staff_invitations
  for insert with check (
    tenant_id in (select get_user_tenant_ids(auth.uid()))
    and (role <> 'owner' or is_tenant_owner(auth.uid(), tenant_id))
  );

create policy "Users can update invitations" on public.staff_invitations
  for update using (
    tenant_id in (select get_user_tenant_ids(auth.uid()))
    and (role <> 'owner' or is_tenant_owner(auth.uid(), tenant_id))
  );

-- 3. Self-scoped invitation read for the invitee (AD-6). A brand-new
-- invitee is not yet a tenant member, so the policies above return nothing
-- for them. Taking auth.uid() internally rather than an id parameter means
-- a caller can only ever retrieve their own row.
create or replace function public.get_my_pending_co_owner_invitation()
returns table (
  invitation_id uuid,
  tenant_id uuid,
  tenant_name text,
  email text,
  expires_at timestamptz,
  invited_by_name text,
  requires_password_change boolean
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  return query
    select
      si.id,
      si.tenant_id,
      t.name,
      si.email,
      si.expires_at,
      coalesce(inviter.full_name, inviter_user.email::text),
      coalesce((invitee_user.raw_user_meta_data->>'requires_password_change')::boolean, false)
    from public.staff_invitations si
    join public.tenants t on t.id = si.tenant_id
    join auth.users invitee_user on invitee_user.id = si.user_id
    left join auth.users inviter_user on inviter_user.id = si.invited_by_id
    left join public.profiles inviter on inviter.user_id = si.invited_by_id
    where si.user_id = auth.uid()
      and si.role = 'owner'
      and si.status = 'pending'
    limit 1;
end;
$$;
grant execute on function public.get_my_pending_co_owner_invitation() to authenticated;

-- 4. Service-role-safe owner roster (AD-11). Neither get_salon_owners
-- (self-gates on is_tenant_owner(auth.uid(), ...)) nor get_tenant_owners
-- (self-gates on has_backoffice_role(auth.uid(), ...)) works from a
-- service-role client — a service-role JWT carries no sub, so auth.uid()
-- is null and both raise. service_role is itself the authorization
-- boundary here; callers each do their own owner check first.
create or replace function public.list_tenant_owners_service(p_tenant_id uuid)
returns table (user_id uuid, full_name text, email text, granted_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select ur.user_id, p.full_name, u.email::text, ur.created_at
  from public.user_roles ur
  join auth.users u on u.id = ur.user_id
  left join public.profiles p on p.user_id = ur.user_id
  where ur.tenant_id = p_tenant_id and ur.role = 'owner' and coalesce(ur.is_active, true)
  order by ur.created_at asc;
$$;
revoke all on function public.list_tenant_owners_service(uuid) from public, authenticated;
grant execute on function public.list_tenant_owners_service(uuid) to service_role;
