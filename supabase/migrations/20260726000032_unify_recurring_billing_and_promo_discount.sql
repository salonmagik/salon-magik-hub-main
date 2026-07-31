-- Billing audit found two real gaps:
--
-- 1. Tier upgrades (solo->studio->chain) charge the price difference ONCE at
--    upgrade time, then the tenant's Paystack Subscription keeps auto-charging
--    the OLD tier's price forever — nothing ever updates it, and the recurring
--    self-managed cron (compute_current_addon_total) never included base plan
--    price at all, only seats/locations/staff-ops. Every tier upgrade
--    permanently underbills starting the following cycle.
--
-- 2. A fully-built discount-promo mechanism (consume_tenant_sales_promo_use)
--    has zero call sites across checkout, seat purchases, tier upgrades, or
--    chain locations. A promo can show "applied" while every charge still
--    goes out at full price.
--
-- Fix: introduce a single server-computed recurring total (base plan price +
-- addons - active promo discount) used by the recurring cron, and apply the
-- same discount lookup to the one-time plan-configuration delta charge.
-- create-checkout-session (the very first payment) is updated separately in
-- this same migration set to also honour it and to stop creating a Paystack
-- Subscription object, since that fixed-price engine is exactly what caused
-- gap #1 — new signups will be fully self-managed by the same cron from day
-- one. Existing already-subscribed tenants are NOT touched by this migration;
-- their Paystack Subscription keeps running as-is until a deliberate,
-- separately-reviewed migration moves them over (do not do this silently —
-- disabling a live Paystack subscription without also confirming the new
-- self-managed billing has taken over risks losing revenue entirely).

-- Read-only discount preview — does NOT consume a promo use. Callers use this
-- to quote a price; the actual consume_tenant_sales_promo_use() call happens
-- only once a charge has actually succeeded, so browsing a quote never burns
-- through a tenant's limited promo uses.
create or replace function public.get_active_subscription_promo_discount(
  p_tenant_id uuid,
  p_amount numeric,
  p_surface text default 'subscription'
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_redemption public.sales_promo_redemptions;
  v_campaign public.sales_promo_campaigns;
  v_discount numeric := 0;
begin
  if p_amount is null or p_amount <= 0 then
    return 0;
  end if;

  select r.*
  into v_redemption
  from public.sales_promo_redemptions r
  join public.sales_promo_codes pc on pc.id = r.promo_code_id
  join public.sales_promo_campaigns c on c.id = pc.campaign_id
  where r.tenant_id = p_tenant_id
    and r.remaining_uses > 0
    and r.status in ('claimed', 'finalized', 'provisional')
    and coalesce(r.invalidated_at, pc.invalidated_at) is null
    and c.ends_at > now()
    and c.is_active is true
    and p_surface = any(r.billing_targets)
  order by r.claimed_at desc nulls last, r.created_at desc
  limit 1;

  if v_redemption.id is null then
    return 0;
  end if;

  select * into v_campaign
  from public.sales_promo_campaigns
  where id = (select pc.campaign_id from public.sales_promo_codes pc where pc.id = v_redemption.promo_code_id);

  if v_campaign.id is null then
    return 0;
  end if;

  if v_campaign.discount_type = 'percentage' then
    v_discount := p_amount * (least(greatest(v_campaign.discount_value, 0), 100) / 100.0);
  else
    v_discount := v_campaign.discount_value;
  end if;

  return least(greatest(v_discount, 0), p_amount);
end;
$$;

grant execute on function public.get_active_subscription_promo_discount(uuid, numeric, text) to authenticated;
grant execute on function public.get_active_subscription_promo_discount(uuid, numeric, text) to service_role;

-- Single source of truth for "what should this tenant be charged this cycle."
-- Chain base price uses compute_chain_price(...,1) — the 1-location price —
-- because compute_current_addon_total's location component already covers
-- (price at current location count) - (price at 1 location); adding the full
-- current-location price here as well would double-count.
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
  v_plan_id uuid;
  v_base_price numeric := 0;
  v_addon_total numeric := 0;
  v_addon_currency text;
  v_addon_breakdown jsonb := '{}'::jsonb;
  v_allowed_locations integer;
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

  select p.id into v_plan_id
  from public.plans p
  where lower(p.slug) = lower(v_plan)
  order by p.is_active desc nulls last, p.created_at desc nulls last
  limit 1;

  if lower(v_plan) = 'chain' then
    select * into v_chain_quote
    from public.compute_chain_price(v_plan_id, v_currency, 1)
    limit 1;
    v_base_price := coalesce(v_chain_quote.total_price, 0);
  else
    select pp.monthly_price
    into v_base_price
    from public.plan_pricing pp
    where pp.plan_id = v_plan_id
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

-- Add the promo discount to the plan-configuration one-time delta quote.
-- Drop first: adding a column changes the return signature.
drop function if exists public.compute_plan_configuration(uuid, integer, integer);

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
  v_current_plan_id uuid;
  v_solo_plan_id uuid;
  v_studio_plan_id uuid;
  v_chain_plan_id uuid;
  v_solo_max_staff integer;
  v_studio_max_staff integer;
  v_chain_max_staff_per_location integer;
  v_used_locations integer;
  v_used_staff integer;
  v_seat_unit_price numeric := 0;
  v_required_plan_slug text;
  v_required_plan_id uuid;
  v_required_base_staff integer;
  v_required_base_price numeric;
  v_required_extra_seats integer;
  v_total_monthly numeric;
  v_requires_custom boolean := false;
  v_current_allowed_locations integer;
  v_current_allowed_staff integer;
  v_current_base_staff integer;
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
  where tenant_id = p_tenant_id;

  if p_branches < greatest(v_used_locations, 1) then
    raise exception 'BRANCHES_BELOW_ACTIVE_LOCATIONS';
  end if;

  select count(distinct ur.user_id)::integer
  into v_used_staff
  from public.user_roles ur
  where ur.tenant_id = p_tenant_id
    and coalesce(ur.is_active, true) = true;

  if p_seats < coalesce(v_used_staff, 0) then
    raise exception 'SEATS_BELOW_ACTIVE_STAFF';
  end if;

  select p.id into v_solo_plan_id from public.plans p where lower(p.slug) = 'solo' order by p.is_active desc nulls last, p.created_at desc nulls last limit 1;
  select p.id into v_studio_plan_id from public.plans p where lower(p.slug) = 'studio' order by p.is_active desc nulls last, p.created_at desc nulls last limit 1;
  select p.id into v_chain_plan_id from public.plans p where lower(p.slug) = 'chain' order by p.is_active desc nulls last, p.created_at desc nulls last limit 1;

  select pl.max_staff into v_solo_max_staff from public.plan_limits pl where pl.plan_id = v_solo_plan_id;
  select pl.max_staff into v_studio_max_staff from public.plan_limits pl where pl.plan_id = v_studio_plan_id;
  select pl.max_staff into v_chain_max_staff_per_location from public.plan_limits pl where pl.plan_id = v_chain_plan_id;

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

  -- Required tier: more than one branch always needs Chain; otherwise Solo is
  -- enough unless the requested seat count exceeds Solo's base (Solo doesn't
  -- support the seat add-on, so any overage forces Studio).
  if p_branches > 1 then
    v_required_plan_slug := 'chain';
  elsif p_seats <= coalesce(v_solo_max_staff, 1) then
    v_required_plan_slug := 'solo';
  else
    v_required_plan_slug := 'studio';
  end if;

  if v_required_plan_slug = 'chain' then
    select * into v_chain_quote
    from public.compute_chain_price(v_chain_plan_id, upper(coalesce(v_currency, 'USD')), p_branches)
    limit 1;

    v_requires_custom := coalesce(v_chain_quote.requires_custom, true);
    v_required_base_staff := greatest(coalesce(v_chain_max_staff_per_location, 12), 1) * greatest(p_branches, 1);
    v_required_extra_seats := greatest(p_seats - v_required_base_staff, 0);

    if v_requires_custom then
      v_total_monthly := null;
    else
      v_total_monthly := coalesce(v_chain_quote.total_price, 0) + (v_required_extra_seats * v_seat_unit_price);
    end if;
  else
    v_required_plan_id := case when v_required_plan_slug = 'solo' then v_solo_plan_id else v_studio_plan_id end;
    v_required_base_staff := case when v_required_plan_slug = 'solo' then coalesce(v_solo_max_staff, 1) else coalesce(v_studio_max_staff, 1) end;
    v_required_extra_seats := greatest(p_seats - v_required_base_staff, 0);

    select pp.monthly_price
    into v_required_base_price
    from public.plan_pricing pp
    where pp.plan_id = v_required_plan_id
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
    v_current_base_staff := greatest(coalesce(v_chain_max_staff_per_location, 12), 1) * greatest(v_current_allowed_locations, 1);
    v_current_base_price := coalesce(v_chain_quote.total_price, 0);
    v_current_total := v_current_base_price + (v_current_extra_seats * v_seat_unit_price);
  else
    v_current_plan_id := case when lower(v_current_plan_slug) = 'solo' then v_solo_plan_id else v_studio_plan_id end;
    v_current_base_staff := case when lower(v_current_plan_slug) = 'solo' then coalesce(v_solo_max_staff, 1) else coalesce(v_studio_max_staff, 1) end;

    select pp.monthly_price
    into v_current_base_price
    from public.plan_pricing pp
    where pp.plan_id = v_current_plan_id
      and pp.currency = upper(coalesce(v_currency, 'USD'))
      and pp.valid_until is null
    order by pp.valid_from desc
    limit 1;

    v_current_total := coalesce(v_current_base_price, 0) + (v_current_extra_seats * v_seat_unit_price);
  end if;

  v_current_allowed_staff := v_current_base_staff + v_current_extra_seats;

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
