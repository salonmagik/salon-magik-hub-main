-- Second-owner foundation (co-owner-role). Ownership stays modelled as
-- user_roles rows (AD-1) — this migration adds the RPCs and is_active
-- corrections that make two active owners per tenant a supported state
-- without any schema change. No backfill: every existing salon keeps
-- exactly the owner rows it has (AC-12).

-- 1. is_active-aware ownership (AD-10). Strictly narrowing: a deactivated
-- owner row no longer counts as an owner at the RLS layer. With two
-- owners, deactivating one becomes support's only undo for a mistaken
-- grant — without this fix that undo would do nothing.
create or replace function public.is_tenant_owner(_user_id uuid, _tenant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and tenant_id = _tenant_id
      and role = 'owner' and coalesce(is_active, true)
  )
$$;

-- 2. Tenant-aware owner-email pre-check (AD-7). Drop-and-recreate rather
-- than an overload: a 2-arg-with-default overload sitting beside the
-- 1-arg function would make single-argument calls ambiguous at
-- resolution time. With p_tenant_id null, behaviour is byte-identical to
-- the original (OnboardingPage.tsx, AddTenantOwnerDialog.tsx keep working
-- unchanged). With a tenant supplied, the "already an owner" case splits
-- into same-tenant vs. other-tenant, and a target holding a non-owner
-- role in that same tenant (the realistic co-owner: the salon's own
-- manager) is reported as available rather than rejected outright.
drop function if exists public.check_owner_invite_email(text);
create or replace function public.check_owner_invite_email(
  p_email text, p_tenant_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_uid uuid;
  v_is_owner_here boolean;
  v_is_owner_elsewhere boolean;
  v_is_member_here boolean;
begin
  if v_email is null then
    return jsonb_build_object('available', true);
  end if;

  select u.id into v_uid from auth.users u where lower(u.email) = v_email limit 1;
  if v_uid is null then
    return jsonb_build_object('available', true);
  end if;

  if p_tenant_id is null then
    if exists (
      select 1 from public.user_roles r
      where r.user_id = v_uid
        and r.role = 'owner'
        and coalesce(r.is_active, true)
    ) then
      return jsonb_build_object('available', false, 'reason', 'already_owner');
    end if;

    return jsonb_build_object('available', false, 'reason', 'existing_account');
  end if;

  select exists (
    select 1 from public.user_roles r
    where r.user_id = v_uid
      and r.role = 'owner'
      and coalesce(r.is_active, true)
      and r.tenant_id = p_tenant_id
  ) into v_is_owner_here;

  if v_is_owner_here then
    return jsonb_build_object('available', false, 'reason', 'already_owner_this_tenant');
  end if;

  select exists (
    select 1 from public.user_roles r
    where r.user_id = v_uid
      and r.role = 'owner'
      and coalesce(r.is_active, true)
      and r.tenant_id <> p_tenant_id
  ) into v_is_owner_elsewhere;

  if v_is_owner_elsewhere then
    return jsonb_build_object('available', false, 'reason', 'already_owner_other_tenant');
  end if;

  select exists (
    select 1 from public.user_roles r
    where r.user_id = v_uid
      and r.role <> 'owner'
      and coalesce(r.is_active, true)
      and r.tenant_id = p_tenant_id
  ) into v_is_member_here;

  if v_is_member_here then
    return jsonb_build_object('available', true, 'note', 'existing_member');
  end if;

  return jsonb_build_object('available', false, 'reason', 'existing_account');
end;
$$;
grant execute on function public.check_owner_invite_email(text, uuid) to authenticated, service_role;

-- 3. Owner roster for the confirmation step (FR-6, F-3). Self-gated on
-- has_backoffice_role rather than trusting its `authenticated` grant.
create or replace function public.get_tenant_owners(p_tenant_id uuid)
returns table (user_id uuid, full_name text, email text, granted_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not has_backoffice_role(auth.uid(), 'super_admin'::public.backoffice_role) then
    raise exception 'BACKOFFICE_ACCESS_DENIED' using errcode = 'P0001';
  end if;
  return query
    select ur.user_id, p.full_name, u.email::text, ur.created_at
    from public.user_roles ur
    join auth.users u on u.id = ur.user_id
    left join public.profiles p on p.user_id = ur.user_id
    where ur.tenant_id = p_tenant_id and ur.role = 'owner' and coalesce(ur.is_active, true)
    order by ur.created_at asc;   -- display order only; confers no precedence (FR-3)
end $$;
grant execute on function public.get_tenant_owners(uuid) to authenticated;

-- 4. Transactional grant (AD-3, AD-4). service_role only — never granted
-- to authenticated, since this is a raw ownership grant. An advisory lock
-- on the tenant serializes concurrent grant attempts for the same salon
-- (edge case 5) — simpler than row-locking a set that may be empty.
create or replace function public.grant_tenant_co_owner(p_tenant_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_already_owner boolean;
  v_active_owner_count int;
  v_deactivated_roles text[];
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 0));

  select exists (
    select 1 from public.user_roles
    where user_id = p_user_id and tenant_id = p_tenant_id
      and role = 'owner' and coalesce(is_active, true)
  ) into v_already_owner;

  if v_already_owner then
    return jsonb_build_object('status', 'already_owner');
  end if;

  select count(*) into v_active_owner_count
  from public.user_roles
  where tenant_id = p_tenant_id and role = 'owner' and coalesce(is_active, true);

  if v_active_owner_count = 0 then
    raise exception 'CO_OWNER_NO_EXISTING_OWNER' using errcode = 'P0001';
  end if;

  if v_active_owner_count >= 2 then
    raise exception 'CO_OWNER_CAP_REACHED' using errcode = 'P0001';
  end if;

  -- Promote in place (AD-3): any other active role the target holds on
  -- this tenant is deactivated in the same transaction as the owner grant,
  -- so the app's several one-effective-role-per-tenant assumptions
  -- (normalizeUserRoles, list_tenant_staff_members's canonical_roles, the
  -- .single() role lookups this item also fixes) stay true rather than
  -- quietly violated.
  with deactivated as (
    update public.user_roles
    set is_active = false
    where user_id = p_user_id and tenant_id = p_tenant_id
      and role <> 'owner' and coalesce(is_active, true)
    returning role
  )
  select coalesce(array_agg(role::text), array[]::text[]) into v_deactivated_roles from deactivated;

  -- A previously deactivated owner row for this (user, tenant) is
  -- reactivated rather than duplicated (edge case 7).
  insert into public.user_roles (user_id, tenant_id, role, is_active)
  values (p_user_id, p_tenant_id, 'owner', true)
  on conflict (user_id, tenant_id, role)
  do update set is_active = true;
  -- trg_enforce_single_owner_tenant fires on this insert/update and raises
  -- if the target already actively owns a different tenant (AC-6).

  return jsonb_build_object(
    'status', case when coalesce(array_length(v_deactivated_roles, 1), 0) > 0 then 'promoted_member' else 'granted' end,
    'deactivated_roles', to_jsonb(v_deactivated_roles)
  );
end;
$$;
revoke all on function public.grant_tenant_co_owner(uuid, uuid) from public, authenticated;
grant execute on function public.grant_tenant_co_owner(uuid, uuid) to service_role;
