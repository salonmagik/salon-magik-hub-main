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

-- Chain-annual pricing gating (AD-8) and billing_dunning_notices idempotency (AD-7).
-- Uses the real 'chain' plan row (tenants.plan is a strict enum limited to
-- solo/studio/chain, so a throwaway plan slug can't be attached to a
-- tenant) — but everything it inserts is rolled back with the rest of this
-- file's transaction, so it's safe to run against an environment that
-- already has real Chain pricing data.
do $$
declare
  v_plan_id uuid;
  v_chain_tenant_id constant uuid := '20000000-0000-0000-0000-000000000011';
  v_row record;
  v_total_rows record;
  v_grace_started_at constant timestamptz := now() - interval '3 days';
begin
  if to_regprocedure('public.compute_chain_price(uuid,text,integer,text)') is null
     or to_regprocedure('public.compute_tenant_recurring_total(uuid)') is null
     or to_regclass('public.billing_dunning_notices') is null then
    raise exception 'Chain-annual / dunning-notice schema is incomplete';
  end if;

  select id into v_plan_id from public.plans where lower(slug) = 'chain' limit 1;
  if v_plan_id is null then
    raise exception 'No chain plan found — cannot test Chain-annual pricing';
  end if;

  insert into public.plan_pricing (plan_id, currency, monthly_price, annual_price, effective_monthly)
  values (v_plan_id, 'GHS', 100, 1000, 100);

  -- Tier covering locations 2-3 has both monthly and annual prices — complete.
  insert into public.additional_location_pricing
    (plan_id, currency, tier_label, tier_min, tier_max, price_per_location, price_per_location_annual, is_custom)
  values
    (v_plan_id, 'GHS', '2-3', 2, 3, 20, 200, false);

  -- Base + one complete tier: annual total should be computable (1 location, base only).
  select * into v_row from public.compute_chain_price(v_plan_id, 'GHS', 1, 'annual');
  if v_row.total_price is distinct from 1000 then
    raise exception 'compute_chain_price(annual) should return the annual base price when configured, got %', v_row.total_price;
  end if;

  -- 3 locations: base + fully-priced tier -> a real annual total, not null.
  select * into v_row from public.compute_chain_price(v_plan_id, 'GHS', 3, 'annual');
  if v_row.total_price is null then
    raise exception 'compute_chain_price(annual) should return a total when every tier in range has an annual price';
  end if;
  if v_row.total_price <> 1000 + 2 * 200 then
    raise exception 'compute_chain_price(annual) computed an unexpected total: %', v_row.total_price;
  end if;

  -- Add a second, incomplete tier (locations 4-5, no annual price) and confirm
  -- reaching into it makes the annual total null while monthly is unaffected.
  insert into public.additional_location_pricing
    (plan_id, currency, tier_label, tier_min, tier_max, price_per_location, price_per_location_annual, is_custom)
  values
    (v_plan_id, 'GHS', '4-5', 4, 5, 25, null, false);

  select * into v_row from public.compute_chain_price(v_plan_id, 'GHS', 5, 'annual');
  if v_row.total_price is not null then
    raise exception 'compute_chain_price(annual) should return null once any reached tier lacks an annual price, got %', v_row.total_price;
  end if;

  select * into v_row from public.compute_chain_price(v_plan_id, 'GHS', 5, 'monthly');
  if v_row.total_price is null then
    raise exception 'compute_chain_price(monthly) must be unaffected by missing annual tier prices';
  end if;

  -- A currency with no plan_pricing row at all -> annual total is null (not
  -- an error). 'ZZZ' rather than a real currency code, so this holds
  -- regardless of what real Chain pricing an environment already has.
  select * into v_row from public.compute_chain_price(v_plan_id, 'ZZZ', 1, 'annual');
  if v_row.total_price is not null then
    raise exception 'compute_chain_price(annual) should return null for a currency with no pricing configured at all';
  end if;

  -- compute_tenant_recurring_total: chain+annual tenant, pricing configured -> a real total.
  insert into public.tenants (id, name, slug, country, currency, timezone, billing_cycle, plan, subscription_status)
  values (v_chain_tenant_id, 'Chain Annual Test', 'chain-annual-test', 'GH', 'GHS', 'Africa/Accra', 'annual', 'chain', 'active');

  select * into v_total_rows from public.compute_tenant_recurring_total(v_chain_tenant_id);
  if v_total_rows.total_amount is null or v_total_rows.total_amount < 1000 then
    raise exception 'compute_tenant_recurring_total should include the annual chain base price when configured, got %', v_total_rows.total_amount;
  end if;

  -- Same tenant, currency with no annual pricing configured -> raises rather
  -- than silently under-billing (a platform misconfiguration must never dun
  -- a customer, and must never quietly charge them less than the real price).
  update public.tenants set currency = 'ZZZ' where id = v_chain_tenant_id;
  begin
    perform public.compute_tenant_recurring_total(v_chain_tenant_id);
    raise exception 'compute_tenant_recurring_total unexpectedly succeeded for an unpriced chain-annual currency';
  exception
    when others then
      if sqlerrm = 'compute_tenant_recurring_total unexpectedly succeeded for an unpriced chain-annual currency' then raise; end if;
      if sqlerrm <> 'CHAIN_ANNUAL_PRICING_NOT_CONFIGURED' then
        raise exception 'Expected CHAIN_ANNUAL_PRICING_NOT_CONFIGURED, got: %', sqlerrm;
      end if;
  end;

  -- billing_dunning_notices: unique index rejects a duplicate
  -- (tenant_id, grace_started_at, notice_key) — this, not application code,
  -- is the idempotency guarantee behind AC 14 for dunning email.
  insert into public.billing_dunning_notices (tenant_id, grace_started_at, notice_key)
  values (v_chain_tenant_id, v_grace_started_at, 'grace_halfway');

  begin
    insert into public.billing_dunning_notices (tenant_id, grace_started_at, notice_key)
    values (v_chain_tenant_id, v_grace_started_at, 'grace_halfway');
    raise exception 'Duplicate dunning notice unexpectedly inserted';
  exception
    when unique_violation then
      null; -- expected
    when others then
      if sqlerrm = 'Duplicate dunning notice unexpectedly inserted' then raise; end if;
      raise;
  end;

  -- A different notice_key for the same episode, or the same notice_key for
  -- a new grace episode, are both legitimately distinct rows.
  insert into public.billing_dunning_notices (tenant_id, grace_started_at, notice_key)
  values (v_chain_tenant_id, v_grace_started_at, 'grace_final_day');
  insert into public.billing_dunning_notices (tenant_id, grace_started_at, notice_key)
  values (v_chain_tenant_id, now(), 'grace_halfway');

  if (select count(*) from public.billing_dunning_notices where tenant_id = v_chain_tenant_id) <> 3 then
    raise exception 'Expected exactly 3 distinct dunning notice rows for the test tenant';
  end if;
end;
$$;

rollback;
