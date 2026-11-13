-- Cleanup following the base-plan-pricing unification (20261113120000).
--
-- tenant_plan_entitlements.allowed_staff and .base_staff_per_location were
-- only ever written by upgrade_tenant_plan_and_log_billing, seeding a
-- "12 free seats per location" baseline that no function has read since the
-- previous migration (get_tenant_runtime_entitlements and
-- compute_plan_configuration both now compute the flat 3-seat baseline
-- fresh from the Solo plan's plan_limits row). Confirmed via grep: no
-- function, edge function, or frontend query selects either column from
-- this table (the frontend's own `allowed_staff` field comes from
-- get_tenant_runtime_entitlements's computed RPC output, a different thing
-- that happens to share a name). Dropping them outright rather than leaving
-- dead columns that look load-bearing.

begin;

alter table public.tenant_plan_entitlements
  drop column if exists allowed_staff,
  drop column if exists base_staff_per_location;

-- upgrade_tenant_plan_and_log_billing: stop writing the two dropped columns.
create or replace function public.upgrade_tenant_plan_and_log_billing(
  p_tenant_id uuid,
  p_target_plan text,
  p_source text,
  p_reason text,
  p_seed_allowed_locations integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_current_plan text;
  v_target_plan text := lower(btrim(p_target_plan));
  v_target_plan_id uuid;
  v_currency text;
  v_country text;
  v_used_locations integer := 0;
  v_allowed_locations integer := 1;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not (public.is_tenant_owner(v_actor, p_tenant_id) or has_backoffice_role(v_actor, 'super_admin'::public.backoffice_role)) then
    raise exception 'PLAN_UPGRADE_FORBIDDEN';
  end if;

  if v_target_plan not in ('solo', 'studio', 'chain') then
    raise exception 'TARGET_PLAN_INVALID';
  end if;

  select t.plan::text, t.currency, t.country
  into v_current_plan, v_currency, v_country
  from public.tenants t
  where t.id = p_tenant_id;

  if v_current_plan is null then
    raise exception 'TENANT_NOT_FOUND';
  end if;

  select p.id
  into v_target_plan_id
  from public.plans p
  where lower(p.slug) = v_target_plan
  order by p.is_active desc nulls last, p.created_at desc nulls last
  limit 1;

  if v_target_plan_id is null then
    raise exception 'TARGET_PLAN_NOT_FOUND';
  end if;

  select count(*)::integer into v_used_locations
  from public.locations
  where tenant_id = p_tenant_id;

  update public.tenants
  set plan = v_target_plan::public.subscription_plan,
      updated_at = now()
  where id = p_tenant_id;

  if v_target_plan = 'chain' then
    v_allowed_locations := greatest(coalesce(p_seed_allowed_locations, v_used_locations, 2), v_used_locations, 2);

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
      v_target_plan_id,
      v_allowed_locations,
      p_source,
      p_reason,
      v_actor
    )
    on conflict (tenant_id)
    do update set
      plan_id = excluded.plan_id,
      allowed_locations = excluded.allowed_locations,
      source = excluded.source,
      reason = excluded.reason,
      updated_by = excluded.updated_by,
      updated_at = now();
  elsif v_current_plan = 'chain' and v_target_plan in ('solo', 'studio') then
    -- Moving off chain: a single-location plan has no use for the chain
    -- location entitlement row, so drop it rather than leaving a stale
    -- allowed_locations value lying around.
    delete from public.tenant_plan_entitlements where tenant_id = p_tenant_id;
  end if;

  insert into public.tenant_addon_quotes (
    tenant_id,
    country_code,
    currency,
    included_locations,
    active_locations,
    extra_locations,
    unit_price_per_extra_location,
    monthly_addon_total,
    snapshot,
    accepted_by,
    accepted_at,
    addon_type,
    addon_key,
    quantity,
    billing_interval,
    unit_price,
    total_price,
    status
  )
  values (
    p_tenant_id,
    upper(coalesce(v_country, 'US')),
    upper(coalesce(v_currency, 'USD')),
    1,
    greatest(v_used_locations, 1),
    greatest(greatest(coalesce(p_seed_allowed_locations, v_used_locations, 1), 1) - 1, 0),
    0,
    0,
    jsonb_build_object(
      'from_plan', v_current_plan,
      'to_plan', v_target_plan,
      'source', p_source,
      'reason', p_reason
    ),
    v_actor,
    now(),
    'plan_upgrade',
    v_target_plan,
    1,
    'monthly',
    0,
    0,
    'accepted'
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
    v_actor,
    'tenant_plan_upgraded',
    'tenant',
    p_tenant_id,
    jsonb_build_object(
      'from_plan', v_current_plan,
      'to_plan', v_target_plan,
      'seed_allowed_locations', case when v_target_plan = 'chain' then v_allowed_locations else null end,
      'source', p_source,
      'reason', p_reason
    )
  );

  return jsonb_build_object(
    'success', true,
    'from_plan', v_current_plan,
    'to_plan', v_target_plan,
    'allowed_locations', case when v_target_plan = 'chain' then v_allowed_locations else null end
  );
end;
$$;

-- compute_tenant_recurring_total: drop the unused v_addon_currency local
-- (captured from compute_current_addon_total's result but never read --
-- pre-existing, not something the pricing-unification migration added,
-- cleaning it up while already touching this function).
create or replace function public.compute_tenant_recurring_total(
  p_tenant_id uuid
)
returns table (
  total_amount numeric,
  currency text,
  breakdown jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_currency text;
  v_base_plan_id uuid;
  v_chain_plan_id uuid;
  v_base_price numeric := 0;
  v_addon_total numeric := 0;
  v_addon_breakdown jsonb := '{}'::jsonb;
  v_chain_quote record;
  v_pre_discount numeric;
  v_discount numeric := 0;
begin
  select t.plan::text, upper(coalesce(t.currency, 'USD'))
  into v_plan, v_currency
  from public.tenants t
  where t.id = p_tenant_id;

  if v_plan is null then
    raise exception 'TENANT_NOT_FOUND';
  end if;

  select p.id into v_base_plan_id
  from public.plans p
  where lower(p.slug) = 'solo'
  order by p.is_active desc nulls last, p.created_at desc nulls last
  limit 1;

  if lower(v_plan) = 'chain' then
    select p.id into v_chain_plan_id
    from public.plans p
    where lower(p.slug) = 'chain'
    order by p.is_active desc nulls last, p.created_at desc nulls last
    limit 1;

    select * into v_chain_quote
    from public.compute_chain_price(v_chain_plan_id, v_currency, 1)
    limit 1;
    v_base_price := coalesce(v_chain_quote.total_price, 0);
  else
    select pp.monthly_price
    into v_base_price
    from public.plan_pricing pp
    where pp.plan_id = v_base_plan_id
      and pp.currency = v_currency
      and pp.valid_until is null
    order by pp.valid_from desc
    limit 1;
    v_base_price := coalesce(v_base_price, 0);
  end if;

  select addon.addon_total, addon.breakdown
  into v_addon_total, v_addon_breakdown
  from public.compute_current_addon_total(p_tenant_id) addon;
  v_addon_total := coalesce(v_addon_total, 0);

  v_pre_discount := v_base_price + v_addon_total;
  v_discount := public.get_active_subscription_promo_discount(p_tenant_id, v_pre_discount);

  return query
  select
    greatest(v_pre_discount - v_discount, 0),
    v_currency,
    jsonb_build_object(
      'base_price', v_base_price,
      'addon_total', v_addon_total,
      'addon_breakdown', v_addon_breakdown,
      'discount', v_discount,
      'pre_discount_total', v_pre_discount
    );
end;
$$;

grant execute on function public.compute_tenant_recurring_total(uuid) to authenticated;
grant execute on function public.compute_tenant_recurring_total(uuid) to service_role;

commit;
