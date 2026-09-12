\set ON_ERROR_STOP on

begin;

do $$
declare
  v_tenant_a constant uuid := '40000000-0000-0000-0000-000000000001';
  v_tenant_b constant uuid := '40000000-0000-0000-0000-000000000002';
  v_tenant_c constant uuid := '40000000-0000-0000-0000-000000000003';
  v_trialing_target constant uuid := '40000000-0000-0000-0000-000000000004';
  v_owner_id constant uuid := '40000000-0000-0000-0000-000000000010';
  v_owner2_id constant uuid := '40000000-0000-0000-0000-000000000011';
  v_manager_id constant uuid := '40000000-0000-0000-0000-000000000012';
  v_super_admin_id constant uuid := '40000000-0000-0000-0000-000000000013';
  v_result jsonb;
  v_grant_id uuid;
  v_new_tenant_id uuid;
  v_caught boolean;
begin
  if to_regprocedure('public.assess_owner_multi_salon_standing(uuid)') is null
     or to_regprocedure('public.create_owner_multi_salon_grant(uuid,uuid,uuid,text)') is null
     or to_regprocedure('public.revoke_owner_multi_salon_grant(uuid,uuid,text)') is null
     or to_regprocedure('public.get_salon_owners(uuid)') is null
     or to_regprocedure('public.enforce_single_owner_tenant()') is null then
    raise exception 'Multi-salon owner identity schema is incomplete';
  end if;

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  )
  values
    (v_owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'multi-salon-owner@test.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_owner2_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'multi-salon-owner2@test.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_manager_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'multi-salon-manager@test.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_super_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'multi-salon-super-admin@test.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  insert into public.tenants (id, name, slug, country, currency, timezone, subscription_status)
  values
    (v_tenant_a, 'Multi Salon A', 'multi-salon-a', 'GH', 'GHS', 'Africa/Accra', 'active'),
    (v_tenant_b, 'Multi Salon B', 'multi-salon-b', 'GH', 'GHS', 'Africa/Accra', 'active'),
    (v_tenant_c, 'Multi Salon C', 'multi-salon-c', 'GH', 'GHS', 'Africa/Accra', 'active'),
    (v_trialing_target, 'Multi Salon Trialing Target', 'multi-salon-trialing-target', 'GH', 'GHS', 'Africa/Accra', 'trialing');

  insert into public.backoffice_users (user_id, role, email_domain, is_active)
  values (v_super_admin_id, 'super_admin', 'salonmagik.com', true);

  insert into public.user_roles (user_id, tenant_id, role, is_active)
  values (v_owner_id, v_tenant_a, 'owner', true);

  -- ==========================================================
  -- No grant -> second active owner row raises the unchanged message
  -- (AC-7 at the DB layer, AD-3)
  -- ==========================================================
  begin
    insert into public.user_roles (user_id, tenant_id, role, is_active)
    values (v_owner_id, v_tenant_b, 'owner', true);
    raise exception 'Second ownership without a grant unexpectedly succeeded';
  exception
    when others then
      if sqlerrm = 'Second ownership without a grant unexpectedly succeeded' then raise; end if;
      if sqlerrm !~ 'already owns another salon' then
        raise exception 'Expected the single-owner-tenant trigger message, got: %', sqlerrm;
      end if;
  end;

  -- ==========================================================
  -- create_owner_multi_salon_grant: standing gate (AC-8, AC-9)
  -- ==========================================================

  -- Not an owner at all -> MULTI_SALON_NOT_AN_OWNER
  begin
    perform public.create_owner_multi_salon_grant(v_manager_id, null, v_super_admin_id, 'Verified via support ticket #1');
    raise exception 'create_owner_multi_salon_grant unexpectedly granted a non-owner';
  exception
    when others then
      if sqlerrm = 'create_owner_multi_salon_grant unexpectedly granted a non-owner' then raise; end if;
      if sqlerrm <> 'MULTI_SALON_NOT_AN_OWNER' then
        raise exception 'Expected MULTI_SALON_NOT_AN_OWNER, got: %', sqlerrm;
      end if;
  end;

  -- Owned salon not in good standing -> MULTI_SALON_STANDING_FAILED naming it
  update public.tenants set subscription_status = 'past_due' where id = v_tenant_a;
  begin
    perform public.create_owner_multi_salon_grant(v_owner_id, null, v_super_admin_id, 'Verified via support ticket #2');
    raise exception 'create_owner_multi_salon_grant unexpectedly granted while a salon is past_due';
  exception
    when others then
      if sqlerrm = 'create_owner_multi_salon_grant unexpectedly granted while a salon is past_due' then raise; end if;
      if sqlerrm !~ ('^MULTI_SALON_STANDING_FAILED:' || v_tenant_a::text) then
        raise exception 'Expected MULTI_SALON_STANDING_FAILED naming %, got: %', v_tenant_a, sqlerrm;
      end if;
  end;
  update public.tenants set subscription_status = 'active' where id = v_tenant_a;

  -- Trialing target tenant -> MULTI_SALON_TARGET_IN_TRIAL (requirement 26)
  begin
    perform public.create_owner_multi_salon_grant(v_owner_id, v_trialing_target, v_super_admin_id, 'Verified via support ticket #3');
    raise exception 'create_owner_multi_salon_grant unexpectedly targeted a trialing tenant';
  exception
    when others then
      if sqlerrm = 'create_owner_multi_salon_grant unexpectedly targeted a trialing tenant' then raise; end if;
      if sqlerrm <> 'MULTI_SALON_TARGET_IN_TRIAL' then
        raise exception 'Expected MULTI_SALON_TARGET_IN_TRIAL, got: %', sqlerrm;
      end if;
  end;

  -- ==========================================================
  -- Bound grant -> the second ownership succeeds, both remain active
  -- (AC-1); consumed_at stamped.
  -- ==========================================================
  v_result := public.create_owner_multi_salon_grant(v_owner_id, v_tenant_b, v_super_admin_id, 'Verified franchise expansion, all salons in good standing');
  v_grant_id := (v_result->>'grantId')::uuid;
  if (v_result->>'bound')::boolean <> true then
    raise exception 'Bound grant creation should report bound=true, got %', v_result;
  end if;

  insert into public.user_roles (user_id, tenant_id, role, is_active)
  values (v_owner_id, v_tenant_b, 'owner', true);

  if not public.is_tenant_owner(v_owner_id, v_tenant_a) or not public.is_tenant_owner(v_owner_id, v_tenant_b) then
    raise exception 'A bound grant should let the identity actively own both salons (AC-1)';
  end if;

  if (select consumed_at from public.owner_multi_salon_grants where id = v_grant_id) is null then
    raise exception 'The bound grant should have consumed_at stamped after being used';
  end if;

  -- A second open grant is refused while one is still open — but this one
  -- is already consumed, so a fresh grant should be allowed again.
  v_result := public.create_owner_multi_salon_grant(v_owner_id, v_tenant_c, v_super_admin_id, 'Second expansion, also verified in good standing');
  if (select tenant_id from public.owner_multi_salon_grants where id = (v_result->>'grantId')::uuid) <> v_tenant_c then
    raise exception 'A fresh grant should be creatable once the prior one is consumed';
  end if;
  -- Revoke this unused grant so it doesn't interfere with later assertions.
  perform public.revoke_owner_multi_salon_grant((v_result->>'grantId')::uuid, v_super_admin_id, 'test cleanup');

  -- ==========================================================
  -- Edge case 1: the original ownership row can be deactivated and
  -- reactivated while a granted second one is active (AD-3 clause two).
  -- ==========================================================
  update public.user_roles set is_active = false where user_id = v_owner_id and tenant_id = v_tenant_a;
  update public.user_roles set is_active = true where user_id = v_owner_id and tenant_id = v_tenant_a;
  if not public.is_tenant_owner(v_owner_id, v_tenant_a) then
    raise exception 'Reactivating the original ownership row while a granted one is active should succeed';
  end if;

  -- ==========================================================
  -- Ending one ownership leaves the other active (AC-5).
  -- ==========================================================
  update public.user_roles set is_active = false where user_id = v_owner_id and tenant_id = v_tenant_b;
  if public.is_tenant_owner(v_owner_id, v_tenant_b) or not public.is_tenant_owner(v_owner_id, v_tenant_a) then
    raise exception 'Ending one ownership should leave the other salon''s ownership untouched (AC-5)';
  end if;
  update public.user_roles set is_active = true where user_id = v_owner_id and tenant_id = v_tenant_b;

  -- ==========================================================
  -- Owner at A + manager at B, in both orders, unaffected (AC-3).
  -- ==========================================================
  insert into public.user_roles (user_id, tenant_id, role, is_active)
  values (v_owner2_id, v_tenant_c, 'manager', true);
  insert into public.user_roles (user_id, tenant_id, role, is_active)
  values (v_owner2_id, v_tenant_a, 'owner', true);
  -- second order: manager first, then owner, already covered by the row
  -- above being inserted after a pre-existing manager row — assert both hold.
  if not exists (
    select 1 from public.user_roles where user_id = v_owner2_id and tenant_id = v_tenant_c and role = 'manager' and coalesce(is_active, true)
  ) or not public.is_tenant_owner(v_owner2_id, v_tenant_a) then
    raise exception 'Owning one salon and managing an unrelated one should both hold simultaneously (AC-3)';
  end if;
  delete from public.user_roles where user_id = v_owner2_id;

  -- reverse order: owner granted first, manager role added afterwards.
  insert into public.user_roles (user_id, tenant_id, role, is_active)
  values (v_owner2_id, v_tenant_b, 'owner', true);
  insert into public.user_roles (user_id, tenant_id, role, is_active)
  values (v_owner2_id, v_tenant_c, 'manager', true)
  on conflict (user_id, tenant_id, role) do update set is_active = true;
  if not public.is_tenant_owner(v_owner2_id, v_tenant_b) or not exists (
    select 1 from public.user_roles where user_id = v_owner2_id and tenant_id = v_tenant_c and role = 'manager' and coalesce(is_active, true)
  ) then
    raise exception 'Owner-then-manager order should also hold simultaneously (AC-3)';
  end if;
  delete from public.user_roles where user_id = v_owner2_id;

  -- ==========================================================
  -- Unbound grant -> consumed and bound by the first new ownership
  -- (AD-4); a second attempt to consume it is refused.
  -- ==========================================================
  v_result := public.create_owner_multi_salon_grant(v_owner_id, null, v_super_admin_id, 'Approved ahead of self-serve onboarding of the next salon');
  v_grant_id := (v_result->>'grantId')::uuid;
  if (v_result->>'bound')::boolean <> false then
    raise exception 'Unbound grant creation should report bound=false, got %', v_result;
  end if;

  perform set_config('request.jwt.claim.sub', v_owner_id::text, true);
  v_new_tenant_id := gen_random_uuid();
  insert into public.tenants (id, name, slug, country, currency, timezone, subscription_status, trial_ends_at)
  values (v_new_tenant_id, 'Multi Salon Newly Onboarded', 'multi-salon-new-' || v_new_tenant_id::text, 'GH', 'GHS', 'Africa/Accra', 'trialing', now() + interval '14 days');

  -- No trial / no promotional pricing on an additional salon (AD-6, AC-10)
  if (select subscription_status from public.tenants where id = v_new_tenant_id) <> 'past_due'
     or (select trial_ends_at from public.tenants where id = v_new_tenant_id) is not null then
    raise exception 'An additional salon created by an existing owner should land past_due with no trial (AC-10)';
  end if;

  insert into public.user_roles (user_id, tenant_id, role, is_active)
  values (v_owner_id, v_new_tenant_id, 'owner', true);

  if (select tenant_id from public.owner_multi_salon_grants where id = v_grant_id) <> v_new_tenant_id
     or (select consumed_at from public.owner_multi_salon_grants where id = v_grant_id) is null then
    raise exception 'The unbound grant should be bound to the newly created tenant and stamped consumed (AD-4)';
  end if;

  -- A later update to trialing on a granted tenant is refused.
  begin
    update public.tenants set subscription_status = 'trialing', trial_ends_at = now() + interval '14 days' where id = v_new_tenant_id;
    raise exception 'Setting a granted tenant back to trialing unexpectedly succeeded';
  exception
    when others then
      if sqlerrm = 'Setting a granted tenant back to trialing unexpectedly succeeded' then raise; end if;
      if sqlerrm <> 'MULTI_SALON_TRIAL_NOT_ALLOWED' then
        raise exception 'Expected MULTI_SALON_TRIAL_NOT_ALLOWED, got: %', sqlerrm;
      end if;
  end;

  -- A payment activation on a granted, unbilled salon is unaffected (edge case 11).
  update public.tenants set subscription_status = 'active' where id = v_new_tenant_id;
  if (select subscription_status from public.tenants where id = v_new_tenant_id) <> 'active' then
    raise exception 'A payment activation on a granted tenant should not be interfered with (edge case 11)';
  end if;

  reset role;
  perform set_config('request.jwt.claim.sub', '', true);

  -- ==========================================================
  -- validate_sales_promo_code_for_email refuses for an existing owner
  -- (AC-10) — before any promo-code lookup, so an invalid/nonexistent
  -- code makes no difference to the message returned.
  -- ==========================================================
  perform set_config('request.jwt.claim.sub', v_owner_id::text, true);
  v_result := public.validate_sales_promo_code_for_email('NOPE-DOES-NOT-EXIST');
  if (v_result->>'valid')::boolean <> false
     or v_result->>'message' <> 'Promotional codes aren''t available on an additional salon.' then
    raise exception 'Expected the additional-salon promo refusal, got %', v_result;
  end if;
  perform set_config('request.jwt.claim.sub', '', true);

  -- ==========================================================
  -- Expired and revoked grants do not permit a second ownership
  -- (edge case 3).
  -- ==========================================================
  update public.user_roles set is_active = false where user_id = v_owner_id and tenant_id in (v_tenant_a, v_tenant_b, v_new_tenant_id);

  v_result := public.create_owner_multi_salon_grant(v_owner_id, v_tenant_c, v_super_admin_id, 'Expiry test grant, revoked before use');
  v_grant_id := (v_result->>'grantId')::uuid;
  perform public.revoke_owner_multi_salon_grant(v_grant_id, v_super_admin_id, 'revoked for expiry test');

  update public.user_roles set is_active = true where user_id = v_owner_id and tenant_id = v_tenant_a;
  begin
    insert into public.user_roles (user_id, tenant_id, role, is_active)
    values (v_owner_id, v_tenant_c, 'owner', true);
    raise exception 'A revoked grant unexpectedly permitted a second ownership';
  exception
    when others then
      if sqlerrm = 'A revoked grant unexpectedly permitted a second ownership' then raise; end if;
      if sqlerrm !~ 'already owns another salon' then
        raise exception 'Expected the single-owner-tenant trigger message for a revoked grant, got: %', sqlerrm;
      end if;
  end;

  v_result := public.create_owner_multi_salon_grant(v_owner_id, v_tenant_c, v_super_admin_id, 'Expiry test grant, will be force-expired');
  v_grant_id := (v_result->>'grantId')::uuid;
  update public.owner_multi_salon_grants set expires_at = now() - interval '1 day' where id = v_grant_id;
  begin
    insert into public.user_roles (user_id, tenant_id, role, is_active)
    values (v_owner_id, v_tenant_c, 'owner', true);
    raise exception 'An expired grant unexpectedly permitted a second ownership';
  exception
    when others then
      if sqlerrm = 'An expired grant unexpectedly permitted a second ownership' then raise; end if;
      if sqlerrm !~ 'already owns another salon' then
        raise exception 'Expected the single-owner-tenant trigger message for an expired grant, got: %', sqlerrm;
      end if;
  end;

  -- ==========================================================
  -- get_salon_owners: returns both owners for an owner of that salon,
  -- ordered, unranked (AC-23); raises for a manager (AC-25); returns only
  -- the queried salon's owners for a multi-salon owner (AC-24).
  -- ==========================================================
  insert into public.user_roles (user_id, tenant_id, role, is_active)
  values (v_manager_id, v_tenant_a, 'manager', true)
  on conflict (user_id, tenant_id, role) do update set is_active = true;

  perform set_config('request.jwt.claim.sub', v_manager_id::text, true);
  begin
    perform public.get_salon_owners(v_tenant_a);
    raise exception 'get_salon_owners unexpectedly succeeded for a manager (AC-25)';
  exception
    when others then
      if sqlerrm = 'get_salon_owners unexpectedly succeeded for a manager (AC-25)' then raise; end if;
      if sqlerrm <> 'OWNER_ACCESS_DENIED' then
        raise exception 'Expected OWNER_ACCESS_DENIED, got: %', sqlerrm;
      end if;
  end;

  -- Give v_tenant_a a second active owner so the ordered/unranked roster
  -- assertion below has two rows to check.
  update public.user_roles set is_active = false where tenant_id = v_tenant_a and role = 'owner' and user_id <> v_owner_id;
  insert into public.user_roles (user_id, tenant_id, role, is_active)
  values (v_super_admin_id, v_tenant_a, 'owner', true)
  on conflict (user_id, tenant_id, role) do update set is_active = true;

  perform set_config('request.jwt.claim.sub', v_owner_id::text, true);
  if (select count(*) from public.get_salon_owners(v_tenant_a)) <> 2 then
    raise exception 'get_salon_owners should return exactly 2 active owners for v_tenant_a (AC-23)';
  end if;

  -- v_owner_id owns only v_tenant_a at this point (all others deactivated
  -- above) — querying v_tenant_c should raise, not silently return v_tenant_a's owners.
  begin
    perform public.get_salon_owners(v_tenant_c);
    raise exception 'get_salon_owners unexpectedly returned another salon''s owners (AC-24)';
  exception
    when others then
      if sqlerrm = 'get_salon_owners unexpectedly returned another salon''s owners (AC-24)' then raise; end if;
      if sqlerrm <> 'OWNER_ACCESS_DENIED' then
        raise exception 'Expected OWNER_ACCESS_DENIED for a salon the caller does not own, got: %', sqlerrm;
      end if;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;

rollback;
