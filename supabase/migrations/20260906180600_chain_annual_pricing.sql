-- Annual pricing model for the Chain plan's per-location add-on. This is
-- the data half of AD-8: annual Chain pricing becomes available for a
-- currency exactly when this column (plus plan_pricing.annual_price for
-- Chain) is fully populated for that currency — nothing here guesses a
-- number, and nothing here goes live on its own.
alter table public.additional_location_pricing
  add column if not exists price_per_location_annual numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'additional_location_pricing_annual_price_check'
  ) then
    alter table public.additional_location_pricing
      add constraint additional_location_pricing_annual_price_check
      check (price_per_location_annual is null or price_per_location_annual >= 0);
  end if;
end $$;

-- Deviation from the Implementation Design's sketched signature
-- (total_price, base_price, location_addon_total, is_custom): this
-- repository's compute_chain_price already returns
-- (total_price, breakdown, requires_custom) and has seven existing call
-- sites (expand_chain_entitlement_and_log_billing,
-- compute_current_addon_total, the plan-configuration quote functions,
-- compute_tenant_recurring_total, staff_operations_addon, etc.) that read
-- those exact field names. Changing the return shape would silently break
-- every one of them (record field access by name; `requires_custom` has no
-- equivalent in the design's proposed shape). Keeping the existing
-- three-column shape and only adding the cycle parameter preserves every
-- caller while still satisfying AD-8: annual pricing is only ever returned
-- once fully configured, otherwise total_price comes back null.
--
-- The old 3-arg overload is dropped first: adding p_billing_cycle as a
-- defaulted 4th parameter would otherwise leave two functions capable of
-- resolving a 3-argument call (the old one, and this one via its default),
-- which Postgres rejects at call time as an ambiguous overload — every
-- existing 3-arg call site would start failing.
drop function if exists public.compute_chain_price(uuid, text, integer);

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

  if v_is_annual then
    select annual_price
    into v_base
    from public.plan_pricing
    where plan_id = p_plan_id
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
    where plan_id = p_plan_id
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
