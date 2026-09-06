\set ON_ERROR_STOP on

begin;

do $$
declare
  v_tenant_id constant uuid := '20000000-0000-0000-0000-000000000001';
  v_owner_id constant uuid := '20000000-0000-0000-0000-000000000002';
  v_other_user_id constant uuid := '20000000-0000-0000-0000-000000000003';
  v_result boolean;
  v_cancel_at timestamptz;
  v_next_billing_at timestamptz;
  v_anchor timestamptz;
begin
  if to_regprocedure('public.is_tenant_operational(uuid)') is null
     or to_regprocedure('public.advance_billing_anchor(timestamptz, text)') is null
     or to_regprocedure('public.request_subscription_cancellation(uuid, text, text)') is null
     or to_regprocedure('public.resume_subscription(uuid)') is null then
    raise exception 'Subscription lifecycle schema is incomplete';
  end if;

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  )
  values
    (
      v_owner_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'lifecycle-owner@test.local', '',
      now(), '{}'::jsonb, '{}'::jsonb, now(), now()
    ),
    (
      v_other_user_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'lifecycle-other@test.local', '',
      now(), '{}'::jsonb, '{}'::jsonb, now(), now()
    );

  insert into public.tenants (id, name, slug, country, currency, timezone, subscription_status)
  values (v_tenant_id, 'Lifecycle Test', 'lifecycle-test', 'GH', 'GHS', 'Africa/Accra', 'active');

  insert into public.user_roles (user_id, tenant_id, role, is_active)
  values (v_owner_id, v_tenant_id, 'owner', true);

  -- is_tenant_operational: active
  update public.tenants set subscription_status = 'active' where id = v_tenant_id;
  if not public.is_tenant_operational(v_tenant_id) then
    raise exception 'active tenant should be operational';
  end if;

  -- past_due, future grace deadline -> operational
  update public.tenants
  set subscription_status = 'past_due', billing_grace_ends_at = now() + interval '5 days'
  where id = v_tenant_id;
  if not public.is_tenant_operational(v_tenant_id) then
    raise exception 'past_due tenant within grace should remain operational';
  end if;

  -- past_due, past grace deadline -> not operational
  update public.tenants
  set billing_grace_ends_at = now() - interval '1 minute'
  where id = v_tenant_id;
  if public.is_tenant_operational(v_tenant_id) then
    raise exception 'past_due tenant past grace deadline should not be operational';
  end if;

  -- past_due, no grace deadline stamped -> not operational (preserves pre-lifecycle behaviour)
  update public.tenants set billing_grace_ends_at = null where id = v_tenant_id;
  if public.is_tenant_operational(v_tenant_id) then
    raise exception 'past_due tenant with no grace deadline should not be operational';
  end if;

  -- suspended -> not operational
  update public.tenants set subscription_status = 'suspended' where id = v_tenant_id;
  if public.is_tenant_operational(v_tenant_id) then
    raise exception 'suspended tenant should not be operational';
  end if;

  -- advance_billing_anchor: monthly anchor 3 days in the past -> anchor + 30d (still future)
  v_anchor := public.advance_billing_anchor(now() - interval '3 days', 'monthly');
  if v_anchor <= now() or v_anchor > now() + interval '30 days' then
    raise exception 'advance_billing_anchor(monthly) produced an unexpected date: %', v_anchor;
  end if;

  -- advance_billing_anchor: monthly anchor far in the past -> loops forward to the future
  v_anchor := public.advance_billing_anchor(now() - interval '45 days', 'monthly');
  if v_anchor <= now() then
    raise exception 'advance_billing_anchor did not advance a long-overdue anchor into the future';
  end if;

  -- advance_billing_anchor: null anchor -> now + cycle
  v_anchor := public.advance_billing_anchor(null, 'annual');
  if v_anchor <= now() + interval '360 days' then
    raise exception 'advance_billing_anchor(annual) with a null anchor should fall back to now() + 365d';
  end if;

  -- request_subscription_cancellation / resume_subscription
  update public.tenants
  set subscription_status = 'active',
      next_billing_at = now() + interval '10 days',
      subscription_cancel_at = null
  where id = v_tenant_id;

  perform set_config('request.jwt.claim.sub', v_other_user_id::text, true);
  begin
    perform public.request_subscription_cancellation(v_tenant_id, 'too_expensive', null);
    raise exception 'Non-owner unexpectedly cancelled the subscription';
  exception
    when others then
      if sqlerrm = 'Non-owner unexpectedly cancelled the subscription' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', v_owner_id::text, true);
  select next_billing_at into v_next_billing_at from public.tenants where id = v_tenant_id;
  v_cancel_at := public.request_subscription_cancellation(v_tenant_id, 'too_expensive', '  will miss you  ');
  if v_cancel_at <> v_next_billing_at then
    raise exception 'Cancellation access-end date should equal next_billing_at';
  end if;

  if not exists (
    select 1 from public.tenants
    where id = v_tenant_id
      and subscription_cancel_at = v_cancel_at
      and cancellation_reason = 'too_expensive'
      and cancellation_reason_note = 'will miss you'
      and cancellation_requested_by = v_owner_id
  ) then
    raise exception 'Cancellation did not persist the expected fields';
  end if;

  if not exists (
    select 1 from public.audit_logs
    where tenant_id = v_tenant_id and action = 'subscription_cancellation_requested'
  ) then
    raise exception 'Cancellation did not write an audit log entry';
  end if;

  -- Already-pending cancellation cannot be requested again
  begin
    perform public.request_subscription_cancellation(v_tenant_id, 'other', null);
    raise exception 'Duplicate cancellation request unexpectedly succeeded';
  exception
    when others then
      if sqlerrm = 'Duplicate cancellation request unexpectedly succeeded' then raise; end if;
  end;

  -- Resume clears the pending cancellation and leaves next_billing_at untouched
  perform public.resume_subscription(v_tenant_id);
  if not exists (
    select 1 from public.tenants
    where id = v_tenant_id
      and subscription_cancel_at is null
      and cancellation_reason is null
      and next_billing_at = v_next_billing_at
  ) then
    raise exception 'Resume did not fully clear cancellation state / preserved next_billing_at';
  end if;

  if not exists (
    select 1 from public.audit_logs
    where tenant_id = v_tenant_id and action = 'subscription_cancellation_reversed'
  ) then
    raise exception 'Resume did not write an audit log entry';
  end if;

  -- Nothing to resume once cleared
  begin
    perform public.resume_subscription(v_tenant_id);
    raise exception 'Resume with nothing pending unexpectedly succeeded';
  exception
    when others then
      if sqlerrm = 'Resume with nothing pending unexpectedly succeeded' then raise; end if;
  end;

  -- A trialing tenant cannot be cancelled (nothing paid to end at period end)
  update public.tenants
  set subscription_status = 'trialing', trial_ends_at = now() + interval '5 days'
  where id = v_tenant_id;
  begin
    perform public.request_subscription_cancellation(v_tenant_id, 'other', null);
    raise exception 'Trialing tenant cancellation unexpectedly succeeded';
  exception
    when others then
      if sqlerrm = 'Trialing tenant cancellation unexpectedly succeeded' then raise; end if;
  end;
end;
$$;

rollback;
