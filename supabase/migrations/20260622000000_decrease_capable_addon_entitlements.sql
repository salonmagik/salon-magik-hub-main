-- Part of the Subscription page redesign: tenants now need to DECREASE branches
-- and team seats, not just increase them. Two existing entitlement RPCs only ever
-- supported growth:
--   - expand_chain_entitlement_and_log_billing silently no-ops on a decrease
--     (returns fake "success", changes nothing).
--   - purchase_tenant_extra_seats_and_log_billing only ever adds a new
--     tenant_addon_entitlements row (sum-based accumulation) — no "set total to X".
-- This migration extends the former and adds a sibling for the latter.

create or replace function public.expand_chain_entitlement_and_log_billing(
  p_tenant_id uuid,
  p_new_allowed_locations integer,
  p_source text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_plan_id uuid;
  v_plan_slug text;
  v_currency text;
  v_trial_ends_at timestamptz;
  v_subscription_status text;
  v_period_end timestamptz;
  v_effective_at timestamptz;
  v_current_allowed integer;
  v_added_count integer;
  v_is_super_admin boolean;
  v_is_tenant_member boolean;
  v_quote_before record;
  v_quote_after record;
  v_requires_custom boolean;
  v_unit_price numeric;
  v_subtotal numeric;
  v_is_decrease boolean;
begin
  if v_actor_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_new_allowed_locations < 1 then
    raise exception 'ALLOWED_LOCATIONS_INVALID';
  end if;

  v_is_super_admin := has_backoffice_role(v_actor_user_id, 'super_admin'::backoffice_role);
  v_is_tenant_member := belongs_to_tenant(v_actor_user_id, p_tenant_id);

  if not v_is_super_admin and not v_is_tenant_member then
    raise exception 'ENTITLEMENT_WRITE_FORBIDDEN';
  end if;

  select p.id, p.slug, t.currency, t.trial_ends_at, t.subscription_status::text
  into v_plan_id, v_plan_slug, v_currency, v_trial_ends_at, v_subscription_status
  from public.tenants t
  left join public.plans p on lower(p.slug) = lower(t.plan::text)
  where t.id = p_tenant_id
  order by p.is_active desc nulls last, p.created_at desc nulls last
  limit 1;

  if v_plan_id is null or v_plan_slug is null then
    raise exception 'PLAN_NOT_FOUND';
  end if;

  if lower(v_plan_slug) <> 'chain' then
    raise exception 'CHAIN_PLAN_REQUIRED';
  end if;

  select coalesce(e.allowed_locations, 1)
  into v_current_allowed
  from public.tenant_plan_entitlements e
  where e.tenant_id = p_tenant_id;

  if v_current_allowed is null then
    v_current_allowed := 1;
  end if;

  if p_new_allowed_locations = v_current_allowed then
    return jsonb_build_object(
      'success', true,
      'tenant_id', p_tenant_id,
      'allowed_locations', v_current_allowed,
      'added_count', 0
    );
  end if;

  v_is_decrease := p_new_allowed_locations < v_current_allowed;

  select * into v_quote_before
  from public.compute_chain_price(v_plan_id, v_currency, v_current_allowed)
  limit 1;

  select * into v_quote_after
  from public.compute_chain_price(v_plan_id, v_currency, p_new_allowed_locations)
  limit 1;

  -- Custom-tier approval is only relevant when growing past the self-serve
  -- ceiling; shrinking can never land you there.
  if not v_is_decrease then
    v_requires_custom := coalesce(v_quote_after.requires_custom, true);
    if v_requires_custom then
      raise exception 'CHAIN_TIER_CUSTOM_REQUIRED';
    end if;
  end if;

  v_added_count := p_new_allowed_locations - v_current_allowed;
  v_subtotal := coalesce(v_quote_after.total_price, 0) - coalesce(v_quote_before.total_price, 0);
  if not v_is_decrease and v_subtotal < 0 then
    v_subtotal := 0;
  end if;
  v_unit_price := case when v_added_count <> 0 then round(v_subtotal / v_added_count, 2) else 0 end;

  select s.current_period_end
  into v_period_end
  from public.subscriptions s
  where s.tenant_id = p_tenant_id
  order by s.created_at desc
  limit 1;

  if v_subscription_status = 'trialing' and v_trial_ends_at is not null then
    v_effective_at := v_trial_ends_at;
  else
    v_effective_at := coalesce(v_period_end, now());
  end if;

  insert into public.tenant_plan_entitlements (
    tenant_id,
    plan_id,
    allowed_locations,
    source,
    reason,
    updated_by
  )
  values (
    p_tenant_id,
    v_plan_id,
    p_new_allowed_locations,
    p_source,
    p_reason,
    v_actor_user_id
  )
  on conflict (tenant_id)
  do update
  set
    plan_id = excluded.plan_id,
    allowed_locations = excluded.allowed_locations,
    source = excluded.source,
    reason = excluded.reason,
    updated_by = excluded.updated_by,
    updated_at = now();

  insert into public.tenant_location_overage_events (
    tenant_id,
    plan_id,
    locations_before,
    locations_after,
    added_count,
    currency,
    unit_price,
    subtotal,
    billing_effective_at,
    source,
    metadata
  )
  values (
    p_tenant_id,
    v_plan_id,
    v_current_allowed,
    p_new_allowed_locations,
    v_added_count,
    v_currency,
    v_unit_price,
    v_subtotal,
    v_effective_at,
    p_source,
    jsonb_build_object(
      'reason', p_reason,
      'before_total_price', v_quote_before.total_price,
      'after_total_price', v_quote_after.total_price,
      'is_decrease', v_is_decrease
    )
  );

  insert into public.audit_logs (
    tenant_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_tenant_id,
    v_actor_user_id,
    'tenant_chain_entitlement_updated',
    'tenant_plan_entitlement',
    p_tenant_id,
    jsonb_build_object(
      'allowed_locations', p_new_allowed_locations,
      'source', p_source,
      'reason', p_reason,
      'added_count', v_added_count,
      'billing_effective_at', v_effective_at,
      'is_decrease', v_is_decrease
    )
  );

  return jsonb_build_object(
    'success', true,
    'tenant_id', p_tenant_id,
    'allowed_locations', p_new_allowed_locations,
    'added_count', v_added_count,
    'billing_effective_at', v_effective_at,
    'unit_price', v_unit_price,
    'subtotal', v_subtotal,
    'currency', v_currency
  );
end;
$$;

-- Seat add-ons today are "add N more" (sum of active rows). This adds a
-- "set total to exactly N" operation, needed for the new configure-and-pay UI
-- where the user types a target seat count, not an increment.
create or replace function public.set_tenant_extra_seats(
  p_tenant_id uuid,
  p_target_quantity integer,
  p_source text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_current_total integer;
  v_delta integer;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_target_quantity is null or p_target_quantity < 0 then
    raise exception 'EXTRA_SEAT_TARGET_INVALID';
  end if;

  if not (public.is_tenant_owner(v_actor, p_tenant_id) or has_backoffice_role(v_actor, 'super_admin'::public.backoffice_role)) then
    raise exception 'EXTRA_SEAT_PURCHASE_FORBIDDEN';
  end if;

  select coalesce(sum(tae.quantity), 0)::integer
  into v_current_total
  from public.tenant_addon_entitlements tae
  where tae.tenant_id = p_tenant_id
    and tae.addon_type = 'extra_seat'
    and tae.status = 'active'
    and (tae.ends_at is null or tae.ends_at > now());

  v_delta := p_target_quantity - v_current_total;

  if v_delta = 0 then
    return jsonb_build_object('success', true, 'tenant_id', p_tenant_id, 'extra_seats', v_current_total, 'delta', 0);
  end if;

  if v_delta > 0 then
    -- Reuse the existing, already-tested purchase path for the positive delta
    -- so pricing/logging logic isn't duplicated.
    return public.purchase_tenant_extra_seats_and_log_billing(p_tenant_id, v_delta, p_source, p_reason);
  end if;

  -- Decrease: end all currently-active extra_seat rows and insert one fresh
  -- row at the exact new target, rather than retrofitting a negative delta
  -- into a sum-based model. Skips entirely if the target is 0 (nothing to add).
  update public.tenant_addon_entitlements
  set status = 'expired',
      ends_at = now(),
      updated_at = now()
  where tenant_id = p_tenant_id
    and addon_type = 'extra_seat'
    and status = 'active'
    and (ends_at is null or ends_at > now());

  if p_target_quantity > 0 then
    insert into public.tenant_addon_entitlements (
      tenant_id,
      addon_type,
      quantity,
      billing_interval,
      status,
      source,
      reason,
      created_by,
      started_at
    )
    values (
      p_tenant_id,
      'extra_seat',
      p_target_quantity,
      'monthly',
      'active',
      p_source,
      p_reason,
      v_actor,
      now()
    );
  end if;

  insert into public.audit_logs (
    tenant_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_tenant_id,
    v_actor,
    'tenant_extra_seats_decreased',
    'tenant_addon_entitlements',
    p_tenant_id,
    jsonb_build_object(
      'previous_total', v_current_total,
      'new_total', p_target_quantity,
      'source', p_source,
      'reason', p_reason
    )
  );

  return jsonb_build_object('success', true, 'tenant_id', p_tenant_id, 'extra_seats', p_target_quantity, 'delta', v_delta);
end;
$$;

grant execute on function public.set_tenant_extra_seats(uuid, integer, text, text) to authenticated;
