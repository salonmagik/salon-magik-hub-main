-- Collapse Solo/Studio/Chain from three independently-priced plans into one
-- base price, with location and seat counts as the only add-ons. Solo/
-- Studio/Chain remain as labels only (derived from location/seat counts for
-- display and feature-gating, e.g. ModuleProtectedRoute's audit_log check) --
-- they stop being separate priced products.
--
-- Root cause this fixes: Base plan pricing was updated (e.g. NGN 8,000) but
-- Chain and Studio each carried their own, independently-editable
-- plan_pricing/plan_limits rows that were never updated alongside it, so a
-- multi-location signup quoted Chain's stale price (NGN 3,000) instead of
-- Base's current one. Every function below that resolved a tenant's base
-- price via ITS OWN labeled plan (solo/studio/chain) now always resolves it
-- via the single Solo/Base plan, regardless of which label the tenant
-- carries. The per-location (additional_location_pricing) and per-seat
-- (staff_addon_pricing) add-on tables are unaffected -- only which row
-- supplies the FIRST location's base price changes.
--
-- New flat seat baseline: every tenant gets 3 free seats (owner + 2) before
-- the per-seat add-on applies, regardless of location count. This replaces
-- Chain's old "12 free seats per location" and Studio's old "6 free seats"
-- baselines. No existing tenants are affected (none exist yet).

begin;

-- 1. One flat included-seat baseline for everyone: 3 (owner + 2). Solo's
--    plan_limits row is the single source every function below reads this
--    from, so tuning it later needs no code change.
update public.plan_limits pl
set max_staff = 3
from public.plans p
where p.id = pl.plan_id
  and lower(p.slug) = 'solo';

-- 2. Studio and Chain no longer carry their own base price -- delete their
--    plan_pricing rows so nothing can accidentally read a stale number.
--    (additional_location_pricing, which Chain's plan_id still keys the
--    per-location tiers under, is untouched.)
delete from public.plan_pricing pp
using public.plans p
where pp.plan_id = p.id
  and lower(p.slug) in ('studio', 'chain');

-- 3. compute_chain_price: the first-location base price now always comes
--    from the Solo/Base plan, regardless of which plan_id is passed in.
--    p_plan_id (still Chain's id, from every caller) continues to key the
--    additional_location_pricing tier lookup below -- unchanged.
create or replace function public.compute_chain_price(
  p_plan_id uuid,
  p_currency text,
  p_total_locations integer,
  p_billing_cycle text default 'monthly'
)
returns table (
  total_price numeric,
  breakdown jsonb,
  requires_custom boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_currency text := upper(btrim(p_currency));
  v_is_annual boolean := p_billing_cycle = 'annual';
  v_base_plan_id uuid;
  v_base numeric;
  v_total numeric;
  v_breakdown jsonb := '[]'::jsonb;
  v_ptr integer := 2;
  v_tier record;
  v_count integer;
  v_unit_price numeric;
  v_annual_incomplete boolean := false;
begin
  if p_total_locations < 1 then
    raise exception 'TOTAL_LOCATIONS_INVALID';
  end if;

  select p.id into v_base_plan_id
  from public.plans p
  where lower(p.slug) = 'solo'
  order by p.is_active desc nulls last, p.created_at desc nulls last
  limit 1;

  if v_base_plan_id is null then
    raise exception 'BASE_PLAN_NOT_FOUND';
  end if;

  if v_is_annual then
    select annual_price
    into v_base
    from public.plan_pricing
    where plan_id = v_base_plan_id
      and currency = v_currency
      and valid_until is null
    order by valid_from desc
    limit 1;

    if v_base is null then
      v_annual_incomplete := true;
      v_base := 0;
    end if;
  else
    select monthly_price
    into v_base
    from public.plan_pricing
    where plan_id = v_base_plan_id
      and currency = v_currency
      and valid_until is null
    order by valid_from desc
    limit 1;

    if v_base is null then
      raise exception 'CHAIN_BASE_PRICE_NOT_FOUND';
    end if;
  end if;

  v_total := v_base;
  v_breakdown := v_breakdown || jsonb_build_object(
    'tier_label', 'Base (1 location)',
    'locations', 1,
    'price_per_location', v_base,
    'subtotal', v_base,
    'is_custom', false
  );

  if p_total_locations = 1 then
    return query select (case when v_annual_incomplete then null else v_total end), v_breakdown, false;
    return;
  end if;

  for v_tier in
    select *
    from public.additional_location_pricing
    where plan_id = p_plan_id
      and currency = v_currency
    order by tier_min asc
  loop
    exit when v_ptr > p_total_locations;

    if v_tier.tier_min > v_ptr then
      return query select (case when v_annual_incomplete then null else v_total end), v_breakdown, true;
      return;
    end if;

    v_count := greatest(
      0,
      least(p_total_locations, coalesce(v_tier.tier_max, p_total_locations))
      - greatest(v_ptr, v_tier.tier_min)
      + 1
    );

    if v_count <= 0 then
      continue;
    end if;

    if v_tier.is_custom then
      v_breakdown := v_breakdown || jsonb_build_object(
        'tier_label', v_tier.tier_label,
        'locations', v_count,
        'price_per_location', null,
        'subtotal', null,
        'is_custom', true
      );
      return query select (case when v_annual_incomplete then null else v_total end), v_breakdown, true;
      return;
    end if;

    v_unit_price := case when v_is_annual then v_tier.price_per_location_annual else v_tier.price_per_location end;
    if v_is_annual and v_unit_price is null then
      v_annual_incomplete := true;
      v_unit_price := 0;
    end if;

    v_total := v_total + (v_count * v_unit_price);
    v_breakdown := v_breakdown || jsonb_build_object(
      'tier_label', v_tier.tier_label,
      'locations', v_count,
      'price_per_location', v_unit_price,
      'subtotal', v_count * v_unit_price,
      'is_custom', false
    );

    v_ptr := least(p_total_locations, coalesce(v_tier.tier_max, p_total_locations)) + 1;
  end loop;

  if v_ptr <= p_total_locations then
    return query select (case when v_annual_incomplete then null else v_total end), v_breakdown, true;
  else
    return query select (case when v_annual_incomplete then null else v_total end), v_breakdown, false;
  end if;
end;
$$;

grant execute on function public.compute_chain_price(uuid, text, integer, text) to authenticated;
grant execute on function public.compute_chain_price(uuid, text, integer, text) to service_role;

-- 4. get_tenant_runtime_entitlements: flat 3-seat baseline for everyone,
--    no more "x12 per location" multiplier for Chain-labeled tenants.
--    allowed_locations is unchanged (still 1 for a non-chain tenant, still
--    read from tenant_plan_entitlements for a chain-labeled one).
create or replace function public.get_tenant_runtime_entitlements(
  p_tenant_id uuid
)
returns table (
  tenant_id uuid,
  plan_slug text,
  used_locations integer,
  allowed_locations integer,
  used_staff integer,
  base_staff_limit integer,
  extra_staff_seats integer,
  allowed_staff integer,
  has_ecommerce_theme boolean,
  ecommerce_theme_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_plan_slug text;
  v_plan_id uuid;
  v_plan_max_locations integer := 1;
  v_used_locations integer := 0;
  v_allowed_locations integer := 1;
  v_used_staff integer := 0;
  v_base_staff_limit integer := 3;
  v_extra_staff_seats integer := 0;
  v_allowed_staff integer := 1;
  v_theme_expiry timestamptz;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not (belongs_to_tenant(v_actor, p_tenant_id) or is_backoffice_user(v_actor)) then
    raise exception 'TENANT_ACCESS_DENIED';
  end if;

  select p.id, p.slug
  into v_plan_id, v_plan_slug
  from public.tenants t
  join public.plans p on lower(p.slug) = lower(t.plan::text)
  where t.id = p_tenant_id
  order by p.is_active desc nulls last, p.created_at desc nulls last
  limit 1;

  if v_plan_slug is null then
    raise exception 'TENANT_NOT_FOUND';
  end if;

  select coalesce(pl.max_locations, 1)
  into v_plan_max_locations
  from public.plan_limits pl
  where pl.plan_id = v_plan_id;

  select count(*)::integer
  into v_used_locations
  from public.locations l
  where l.tenant_id = p_tenant_id;

  if lower(v_plan_slug) = 'chain' then
    select coalesce(e.allowed_locations, greatest(v_plan_max_locations, 1))
    into v_allowed_locations
    from public.tenant_plan_entitlements e
    where e.tenant_id = p_tenant_id;

    v_allowed_locations := coalesce(v_allowed_locations, greatest(v_plan_max_locations, 1));
  else
    v_allowed_locations := greatest(v_plan_max_locations, 1);
  end if;

  -- Flat baseline regardless of label or location count: 3 (owner + 2).
  select coalesce(bpl.max_staff, 3)
  into v_base_staff_limit
  from public.plans bp
  join public.plan_limits bpl on bpl.plan_id = bp.id
  where lower(bp.slug) = 'solo'
  limit 1;
  v_base_staff_limit := coalesce(v_base_staff_limit, 3);

  select count(distinct ur.user_id)::integer
  into v_used_staff
  from public.user_roles ur
  where ur.tenant_id = p_tenant_id
    and coalesce(ur.is_active, true) = true;

  select coalesce(sum(tae.quantity), 0)::integer
  into v_extra_staff_seats
  from public.tenant_addon_entitlements tae
  where tae.tenant_id = p_tenant_id
    and tae.addon_type = 'extra_seat'
    and tae.status = 'active'
    and (tae.ends_at is null or tae.ends_at > now());

  v_allowed_staff := v_base_staff_limit + v_extra_staff_seats;

  select tae.ends_at
  into v_theme_expiry
  from public.tenant_addon_entitlements tae
  where tae.tenant_id = p_tenant_id
    and tae.addon_type = 'theme_ecommerce'
    and tae.status = 'active'
    and (tae.ends_at is null or tae.ends_at > now())
  order by tae.ends_at desc nulls last
  limit 1;

  return query
  select
    p_tenant_id,
    v_plan_slug,
    v_used_locations,
    v_allowed_locations,
    v_used_staff,
    v_base_staff_limit,
    v_extra_staff_seats,
    v_allowed_staff,
    (v_theme_expiry is not null and (v_theme_expiry is null or v_theme_expiry > now())) or exists (
      select 1 from public.tenant_addon_entitlements tae2
      where tae2.tenant_id = p_tenant_id
        and tae2.addon_type = 'theme_ecommerce'
        and tae2.status = 'active'
        and tae2.ends_at is null
    ),
    v_theme_expiry;
end;
$$;

grant execute on function public.get_tenant_runtime_entitlements(uuid) to authenticated;
grant execute on function public.get_tenant_runtime_entitlements(uuid) to service_role;

-- 5. compute_plan_configuration: base price always resolves to Solo/Base's
--    plan_pricing row; seat baseline is the same flat 3 for every label.
--    Label derivation (chain if >1 branch, else studio if >3 seats, else
--    solo) is unchanged -- it's a pure display/feature label now, decoupled
--    from which row supplies the price.
create or replace function public.compute_plan_configuration(
  p_tenant_id uuid,
  p_branches integer,
  p_seats integer
)
returns table (
  current_plan_slug text,
  current_allowed_locations integer,
  current_allowed_staff integer,
  current_monthly_price numeric,
  required_plan_slug text,
  total_monthly_price numeric,
  price_delta numeric,
  discount_amount numeric,
  requires_custom_locations boolean,
  currency text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_currency text;
  v_country text;
  v_current_plan_slug text;
  v_base_plan_id uuid;
  v_chain_plan_id uuid;
  v_base_staff_limit integer := 3;
  v_used_locations integer;
  v_used_staff integer;
  v_seat_unit_price numeric := 0;
  v_required_plan_slug text;
  v_required_base_price numeric;
  v_required_extra_seats integer;
  v_total_monthly numeric;
  v_requires_custom boolean := false;
  v_current_allowed_locations integer;
  v_current_allowed_staff integer;
  v_current_extra_seats integer;
  v_current_base_price numeric;
  v_current_total numeric;
  v_chain_quote record;
  v_raw_delta numeric;
  v_discount numeric := 0;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not (public.belongs_to_tenant(v_actor, p_tenant_id) or has_backoffice_role(v_actor, 'super_admin'::public.backoffice_role)) then
    raise exception 'TENANT_ACCESS_DENIED';
  end if;

  if p_branches < 1 or p_seats < 0 then
    raise exception 'PLAN_CONFIGURATION_INPUT_INVALID';
  end if;

  select t.plan::text, t.currency, t.country
  into v_current_plan_slug, v_currency, v_country
  from public.tenants t
  where t.id = p_tenant_id;

  if v_current_plan_slug is null then
    raise exception 'TENANT_NOT_FOUND';
  end if;

  select count(*)::integer into v_used_locations
  from public.locations
  where tenant_id = p_tenant_id
    and not coalesce(is_paused, false);

  if p_branches < greatest(v_used_locations, 1) then
    raise exception 'BRANCHES_BELOW_ACTIVE_LOCATIONS';
  end if;

  select count(distinct ur.user_id)::integer
  into v_used_staff
  from public.user_roles ur
  where ur.tenant_id = p_tenant_id
    and coalesce(ur.is_active, true) = true
    and not exists (
      select 1
      from public.staff_invitations si
      where si.user_id = ur.user_id
        and si.tenant_id = ur.tenant_id
        and si.status = 'pending'
    );

  if p_seats < coalesce(v_used_staff, 0) then
    raise exception 'SEATS_BELOW_ACTIVE_STAFF';
  end if;

  select p.id into v_base_plan_id from public.plans p where lower(p.slug) = 'solo' order by p.is_active desc nulls last, p.created_at desc nulls last limit 1;
  select p.id into v_chain_plan_id from public.plans p where lower(p.slug) = 'chain' order by p.is_active desc nulls last, p.created_at desc nulls last limit 1;

  select coalesce(pl.max_staff, 3) into v_base_staff_limit from public.plan_limits pl where pl.plan_id = v_base_plan_id;
  v_base_staff_limit := coalesce(v_base_staff_limit, 3);

  select sap.unit_price_per_extra_seat
  into v_seat_unit_price
  from public.staff_addon_pricing sap
  where sap.country_code = upper(coalesce(v_country, 'US'))
    and sap.currency = upper(coalesce(v_currency, 'USD'))
    and sap.status = 'active'
    and sap.effective_from <= now()
  order by sap.effective_from desc
  limit 1;
  v_seat_unit_price := coalesce(v_seat_unit_price, 0);

  -- Label only, from here on: more than one branch is "chain"; one branch
  -- with more than the flat baseline's seats is "studio"; otherwise "solo".
  -- None of these change which row the price comes from any more.
  if p_branches > 1 then
    v_required_plan_slug := 'chain';
  elsif p_seats <= v_base_staff_limit then
    v_required_plan_slug := 'solo';
  else
    v_required_plan_slug := 'studio';
  end if;

  v_required_extra_seats := greatest(p_seats - v_base_staff_limit, 0);

  if v_required_plan_slug = 'chain' then
    select * into v_chain_quote
    from public.compute_chain_price(v_chain_plan_id, upper(coalesce(v_currency, 'USD')), p_branches)
    limit 1;

    v_requires_custom := coalesce(v_chain_quote.requires_custom, true);

    if v_requires_custom then
      v_total_monthly := null;
    else
      v_total_monthly := coalesce(v_chain_quote.total_price, 0) + (v_required_extra_seats * v_seat_unit_price);
    end if;
  else
    select pp.monthly_price
    into v_required_base_price
    from public.plan_pricing pp
    where pp.plan_id = v_base_plan_id
      and pp.currency = upper(coalesce(v_currency, 'USD'))
      and pp.valid_until is null
    order by pp.valid_from desc
    limit 1;

    if v_required_base_price is null then
      raise exception 'PLAN_PRICE_NOT_FOUND';
    end if;

    v_total_monthly := v_required_base_price + (v_required_extra_seats * v_seat_unit_price);
  end if;

  -- Current monthly total, derived the same way, for an apples-to-apples delta.
  select e.allowed_locations into v_current_allowed_locations
  from public.tenant_plan_entitlements e
  where e.tenant_id = p_tenant_id;
  v_current_allowed_locations := coalesce(v_current_allowed_locations, greatest(v_used_locations, 1));

  select coalesce(sum(tae.quantity), 0)::integer
  into v_current_extra_seats
  from public.tenant_addon_entitlements tae
  where tae.tenant_id = p_tenant_id
    and tae.addon_type = 'extra_seat'
    and tae.status = 'active'
    and (tae.ends_at is null or tae.ends_at > now());

  if lower(v_current_plan_slug) = 'chain' then
    select * into v_chain_quote
    from public.compute_chain_price(v_chain_plan_id, upper(coalesce(v_currency, 'USD')), greatest(v_current_allowed_locations, 1))
    limit 1;
    v_current_base_price := coalesce(v_chain_quote.total_price, 0);
  else
    select pp.monthly_price
    into v_current_base_price
    from public.plan_pricing pp
    where pp.plan_id = v_base_plan_id
      and pp.currency = upper(coalesce(v_currency, 'USD'))
      and pp.valid_until is null
    order by pp.valid_from desc
    limit 1;
  end if;

  v_current_total := coalesce(v_current_base_price, 0) + (v_current_extra_seats * v_seat_unit_price);
  v_current_allowed_staff := v_base_staff_limit + v_current_extra_seats;

  v_raw_delta := case when v_total_monthly is null then null else v_total_monthly - v_current_total end;

  if v_raw_delta is not null and v_raw_delta > 0 then
    v_discount := public.get_active_subscription_promo_discount(p_tenant_id, v_raw_delta);
  end if;

  return query
  select
    v_current_plan_slug,
    v_current_allowed_locations,
    v_current_allowed_staff,
    v_current_total,
    v_required_plan_slug,
    v_total_monthly,
    v_raw_delta,
    v_discount,
    v_requires_custom,
    upper(coalesce(v_currency, 'USD'));
end;
$$;

grant execute on function public.compute_plan_configuration(uuid, integer, integer) to authenticated;

-- 6. compute_tenant_recurring_total: the non-chain base price branch used
--    to look up plan_pricing for the tenant's OWN labeled plan (e.g. Studio),
--    which is exactly the same bug class on the recurring-billing path --
--    fixed the same way, always resolving to Solo/Base's price.
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
  v_addon_currency text;
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

  select addon.addon_total, addon.currency, addon.breakdown
  into v_addon_total, v_addon_currency, v_addon_breakdown
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

-- 7. upgrade_tenant_plan_and_log_billing: stop seeding the entitlement row
--    with Chain's old "12 free seats per location" baseline. allowed_staff/
--    base_staff_per_location are otherwise unread (checked: no function
--    selects them) -- kept populated at the new flat value for anyone
--    inspecting the row directly, rather than dropped outright.
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
      allowed_staff,
      base_staff_per_location,
      source,
      reason,
      updated_by
    )
    values (
      p_tenant_id,
      v_target_plan_id,
      v_allowed_locations,
      3,
      3,
      p_source,
      p_reason,
      v_actor
    )
    on conflict (tenant_id)
    do update set
      plan_id = excluded.plan_id,
      allowed_locations = excluded.allowed_locations,
      allowed_staff = excluded.allowed_staff,
      base_staff_per_location = excluded.base_staff_per_location,
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

commit;
