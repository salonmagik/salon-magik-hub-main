-- compute_plan_configuration's BRANCHES_BELOW_ACTIVE_LOCATIONS guardrail
-- counted every location row for the tenant, paused or not. That makes
-- pausing a branch pointless as a way to unblock a branch-count downgrade —
-- the whole reason pause_locations exists (see 20260720000003_branch_pausing
-- and 20260806230000_paused_location_enforcement) — since the paused branch
-- still counted against the minimum. Excluding paused locations here is what
-- lets the Settings branch-pause picker actually unblock a downgrade quote.

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
  where tenant_id = p_tenant_id
    and not coalesce(is_paused, false);

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
