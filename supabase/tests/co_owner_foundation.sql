\set ON_ERROR_STOP on

begin;

do $$
declare
  v_tenant_id constant uuid := '30000000-0000-0000-0000-000000000001';
  v_other_tenant_id constant uuid := '30000000-0000-0000-0000-000000000002';
  v_owner_id constant uuid := '30000000-0000-0000-0000-000000000003';
  v_manager_id constant uuid := '30000000-0000-0000-0000-000000000004';
  v_third_id constant uuid := '30000000-0000-0000-0000-000000000005';
  v_other_owner_id constant uuid := '30000000-0000-0000-0000-000000000006';
  v_super_admin_id constant uuid := '30000000-0000-0000-0000-000000000007';
  v_non_admin_id constant uuid := '30000000-0000-0000-0000-000000000008';
  v_result jsonb;
  v_owner_rows uuid[];
  v_owner_count int;
begin
  if to_regprocedure('public.grant_tenant_co_owner(uuid,uuid)') is null
     or to_regprocedure('public.get_tenant_owners(uuid)') is null
     or to_regprocedure('public.check_owner_invite_email(text,uuid)') is null
     or to_regprocedure('public.is_tenant_owner(uuid,uuid)') is null then
    raise exception 'Co-owner foundation schema is incomplete';
  end if;

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  )
  values
    (v_owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'co-owner-first@test.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_manager_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'co-owner-manager@test.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_third_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'co-owner-third@test.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_other_owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'co-owner-other-owner@test.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_super_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'co-owner-super-admin@test.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_non_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'co-owner-non-admin@test.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  insert into public.tenants (id, name, slug, country, currency, timezone, subscription_status)
  values
    (v_tenant_id, 'Co-Owner Test', 'co-owner-test', 'GH', 'GHS', 'Africa/Accra', 'active'),
    (v_other_tenant_id, 'Co-Owner Other Tenant', 'co-owner-other-tenant', 'GH', 'GHS', 'Africa/Accra', 'active');

  insert into public.backoffice_users (user_id, role, email_domain, is_active)
  values (v_super_admin_id, 'super_admin', 'salonmagik.com', true);

  -- ==========================================================
  -- is_tenant_owner: is_active-aware (AD-10 / T-10)
  -- ==========================================================
  insert into public.user_roles (user_id, tenant_id, role, is_active)
  values (v_owner_id, v_tenant_id, 'owner', true);

  if not public.is_tenant_owner(v_owner_id, v_tenant_id) then
    raise exception 'is_tenant_owner should be true for an active owner row';
  end if;

  update public.user_roles set is_active = false where user_id = v_owner_id and tenant_id = v_tenant_id;
  if public.is_tenant_owner(v_owner_id, v_tenant_id) then
    raise exception 'is_tenant_owner should be false for a deactivated owner row (T-10)';
  end if;
  update public.user_roles set is_active = true where user_id = v_owner_id and tenant_id = v_tenant_id;

  -- ==========================================================
  -- get_tenant_owners (T-8)
  -- ==========================================================
  perform set_config('request.jwt.claim.sub', v_non_admin_id::text, true);
  begin
    perform public.get_tenant_owners(v_tenant_id);
    raise exception 'get_tenant_owners unexpectedly succeeded for a non-super-admin caller';
  exception
    when others then
      if sqlerrm = 'get_tenant_owners unexpectedly succeeded for a non-super-admin caller' then raise; end if;
      if sqlerrm <> 'BACKOFFICE_ACCESS_DENIED' then
        raise exception 'Expected BACKOFFICE_ACCESS_DENIED, got: %', sqlerrm;
      end if;
  end;

  perform set_config('request.jwt.claim.sub', v_super_admin_id::text, true);
  select count(*) into v_owner_count from public.get_tenant_owners(v_tenant_id);
  if v_owner_count <> 1 then
    raise exception 'get_tenant_owners should return exactly 1 owner before any grant, got %', v_owner_count;
  end if;

  -- ==========================================================
  -- grant_tenant_co_owner (T-6)
  -- ==========================================================

  -- 0 owners -> CO_OWNER_NO_EXISTING_OWNER
  begin
    perform public.grant_tenant_co_owner(v_other_tenant_id, v_third_id);
    raise exception 'grant_tenant_co_owner unexpectedly succeeded against a tenant with no owner';
  exception
    when others then
      if sqlerrm = 'grant_tenant_co_owner unexpectedly succeeded against a tenant with no owner' then raise; end if;
      if sqlerrm <> 'CO_OWNER_NO_EXISTING_OWNER' then
        raise exception 'Expected CO_OWNER_NO_EXISTING_OWNER, got: %', sqlerrm;
      end if;
  end;

  -- Promoting an existing manager: deactivates the manager row, inserts an
  -- active owner row, and returns 'promoted_member' (edge case 1, AD-3).
  insert into public.user_roles (user_id, tenant_id, role, is_active)
  values (v_manager_id, v_tenant_id, 'manager', true);

  v_result := public.grant_tenant_co_owner(v_tenant_id, v_manager_id);
  if v_result->>'status' <> 'promoted_member' then
    raise exception 'Promoting a manager should return status=promoted_member, got %', v_result;
  end if;
  if not (v_result->'deactivated_roles' @> '["manager"]'::jsonb) then
    raise exception 'grant_tenant_co_owner should report the deactivated manager role, got %', v_result;
  end if;

  if exists (
    select 1 from public.user_roles
    where user_id = v_manager_id and tenant_id = v_tenant_id and role = 'manager' and coalesce(is_active, true)
  ) then
    raise exception 'The manager row should have been deactivated, not left active';
  end if;

  if (
    select count(*) from public.user_roles
    where user_id = v_manager_id and tenant_id = v_tenant_id and coalesce(is_active, true)
  ) <> 1 then
    raise exception 'The promoted user should have exactly one active role row on this tenant (AD-3)';
  end if;

  if not public.is_tenant_owner(v_manager_id, v_tenant_id) then
    raise exception 'The promoted manager should now be an active owner';
  end if;

  -- 2 owners -> CO_OWNER_CAP_REACHED (AC-2)
  begin
    perform public.grant_tenant_co_owner(v_tenant_id, v_third_id);
    raise exception 'grant_tenant_co_owner unexpectedly exceeded the two-owner cap';
  exception
    when others then
      if sqlerrm = 'grant_tenant_co_owner unexpectedly exceeded the two-owner cap' then raise; end if;
      if sqlerrm <> 'CO_OWNER_CAP_REACHED' then
        raise exception 'Expected CO_OWNER_CAP_REACHED, got: %', sqlerrm;
      end if;
  end;

  -- Already an active owner of this tenant -> {status: already_owner}, a no-op
  v_result := public.grant_tenant_co_owner(v_tenant_id, v_owner_id);
  if v_result->>'status' <> 'already_owner' then
    raise exception 'Granting to an existing active owner should be a no-op with status=already_owner, got %', v_result;
  end if;
  if (select count(*) from public.user_roles where tenant_id = v_tenant_id and role = 'owner' and coalesce(is_active, true)) <> 2 then
    raise exception 'The already-owner no-op must not change the active owner count';
  end if;

  -- A previously deactivated owner row on this tenant is reactivated, not
  -- duplicated (edge case 7) — free up a slot first by deactivating one owner.
  update public.user_roles set is_active = false where user_id = v_manager_id and tenant_id = v_tenant_id and role = 'owner';

  v_result := public.grant_tenant_co_owner(v_tenant_id, v_manager_id);
  if v_result->>'status' not in ('granted', 'promoted_member') then
    raise exception 'Reactivating a deactivated owner row should succeed, got %', v_result;
  end if;
  if (
    select count(*) from public.user_roles
    where user_id = v_manager_id and tenant_id = v_tenant_id and role = 'owner'
  ) <> 1 then
    raise exception 'Reactivation should update the existing owner row, not insert a duplicate (edge case 7)';
  end if;
  if not public.is_tenant_owner(v_manager_id, v_tenant_id) then
    raise exception 'The reactivated owner row should be active';
  end if;

  -- Granting to a user who already owns a different tenant raises from
  -- trg_enforce_single_owner_tenant (AC-6) — free a slot on v_tenant_id first.
  update public.user_roles set is_active = false where user_id = v_manager_id and tenant_id = v_tenant_id and role = 'owner';
  insert into public.user_roles (user_id, tenant_id, role, is_active)
  values (v_other_owner_id, v_other_tenant_id, 'owner', true);

  begin
    perform public.grant_tenant_co_owner(v_tenant_id, v_other_owner_id);
    raise exception 'grant_tenant_co_owner unexpectedly granted ownership to a user who owns another tenant';
  exception
    when others then
      if sqlerrm = 'grant_tenant_co_owner unexpectedly granted ownership to a user who owns another tenant' then raise; end if;
      if sqlerrm !~ 'already owns another salon' then
        raise exception 'Expected the single-owner-tenant trigger message, got: %', sqlerrm;
      end if;
  end;

  -- restore v_manager_id as the tenant's second active owner for the
  -- get_tenant_owners ordering assertion below
  update public.user_roles set is_active = true where user_id = v_manager_id and tenant_id = v_tenant_id and role = 'owner';

  -- ==========================================================
  -- get_tenant_owners: ordering + excludes inactive (T-8, continued)
  -- ==========================================================
  perform set_config('request.jwt.claim.sub', v_super_admin_id::text, true);
  select array_agg(user_id order by granted_at asc) into v_owner_rows
  from public.get_tenant_owners(v_tenant_id);
  if v_owner_rows is null then
    raise exception 'get_tenant_owners returned no rows for a two-owner tenant';
  end if;

  if (select count(*) from public.get_tenant_owners(v_tenant_id)) <> 2 then
    raise exception 'get_tenant_owners should return exactly 2 active owners';
  end if;

  -- ==========================================================
  -- check_owner_invite_email (T-7)
  -- ==========================================================
  declare
    v_owner_email constant text := 'co-owner-first@test.local';
    v_manager_email constant text := 'co-owner-manager@test.local';
    v_third_email constant text := 'co-owner-third@test.local';
    v_other_owner_email constant text := 'co-owner-other-owner@test.local';
  begin
    -- One-argument calls behave exactly as before (legacy reason names).
    v_result := public.check_owner_invite_email(v_owner_email);
    if v_result->>'reason' <> 'already_owner' or (v_result->>'available')::boolean <> false then
      raise exception '1-arg check_owner_invite_email should classify an owner as already_owner, got %', v_result;
    end if;

    -- v_third_id has an auth.users row but no owner role anywhere — the
    -- 1-arg legacy path still rejects it as existing_account (unchanged
    -- pre-existing behaviour; send-staff-invitation can't add an existing
    -- account to a tenant at all, see check_owner_invite_email's original
    -- migration).
    v_result := public.check_owner_invite_email(v_third_email);
    if v_result->>'reason' <> 'existing_account' or (v_result->>'available')::boolean <> false then
      raise exception '1-arg check_owner_invite_email should classify a pre-existing non-owner account as existing_account, got %', v_result;
    end if;

    -- No account at all -> available, 1-arg path.
    v_result := public.check_owner_invite_email('nobody-legacy-co-owner-test@test.local');
    if (v_result->>'available')::boolean <> true then
      raise exception '1-arg check_owner_invite_email should classify a nonexistent account as available, got %', v_result;
    end if;

    -- Tenant-aware: already an owner of *this* tenant.
    v_result := public.check_owner_invite_email(v_owner_email, v_tenant_id);
    if v_result->>'reason' <> 'already_owner_this_tenant' then
      raise exception 'Expected already_owner_this_tenant, got %', v_result;
    end if;

    -- Tenant-aware: owns a *different* tenant.
    v_result := public.check_owner_invite_email(v_other_owner_email, v_tenant_id);
    if v_result->>'reason' <> 'already_owner_other_tenant' then
      raise exception 'Expected already_owner_other_tenant, got %', v_result;
    end if;

    -- Tenant-aware: no account at all -> available.
    v_result := public.check_owner_invite_email('nobody-co-owner-test@test.local', v_tenant_id);
    if (v_result->>'available')::boolean <> true then
      raise exception 'An email with no account should be available regardless of tenant, got %', v_result;
    end if;

    -- Tenant-aware: a non-owner role in *this* tenant (the realistic
    -- co-owner case, F-2) -> available, with note 'existing_member'.
    insert into public.user_roles (user_id, tenant_id, role, is_active)
    values (v_third_id, v_tenant_id, 'supervisor', true);

    v_result := public.check_owner_invite_email(v_third_email, v_tenant_id);
    if (v_result->>'available')::boolean <> true or v_result->>'note' <> 'existing_member' then
      raise exception 'Expected available=true, note=existing_member for a same-tenant non-owner role, got %', v_result;
    end if;

    delete from public.user_roles where user_id = v_third_id and tenant_id = v_tenant_id and role = 'supervisor';
  end;

  -- ==========================================================
  -- T-9: grant_tenant_co_owner is not executable by `authenticated`,
  -- and the "Users can create own user_role" policy still blocks a
  -- client-side grant to a different user_id.
  -- ==========================================================
  if has_function_privilege('authenticated', 'public.grant_tenant_co_owner(uuid,uuid)', 'execute') then
    raise exception 'authenticated must not be able to execute grant_tenant_co_owner (T-9)';
  end if;

  perform set_config('request.jwt.claim.sub', v_third_id::text, true);
  set local role authenticated;
  begin
    insert into public.user_roles (user_id, tenant_id, role, is_active)
    values (v_other_owner_id, v_tenant_id, 'owner', true);
    raise exception 'RLS unexpectedly allowed a client to insert an owner row for another user_id (T-9)';
  exception
    when others then
      if sqlerrm = 'RLS unexpectedly allowed a client to insert an owner row for another user_id (T-9)' then raise; end if;
      -- expected: RLS policy violation
  end;
  reset role;

  -- ==========================================================
  -- T-11: list_tenant_staff_members returns both owners with role='owner'
  -- (AC-3, FR-11) — no code change needed for this, asserting it rather
  -- than trusting it.
  -- ==========================================================
  if to_regprocedure('public.list_tenant_staff_members(uuid,text,uuid)') is not null then
    perform set_config('request.jwt.claim.sub', v_owner_id::text, true);
    if (
      select count(*) from public.list_tenant_staff_members(v_tenant_id) s
      where s.role = 'owner'
    ) <> 2 then
      raise exception 'list_tenant_staff_members should list both active owners with role=owner (T-11)';
    end if;
  end if;
end;
$$;

rollback;
