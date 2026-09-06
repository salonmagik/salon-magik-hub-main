-- Lets backoffice enter an annual per-location price alongside the existing
-- monthly one for each Chain location tier (Implementation Order item 17).
-- price_per_location_annual is optional here — a tier saved without it
-- simply leaves annual Chain pricing "not yet configured" for that tier,
-- which compute_chain_price(..., 'annual') already treats as a null total
-- rather than a save-time error (see AD-8: availability is gated on data,
-- not on this form enforcing completeness).
create or replace function public.backoffice_upsert_chain_location_pricing(
  p_plan_id uuid,
  p_tiers jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_plan_slug text;
  v_currency text;
  v_prev_max integer;
  v_row record;
  v_tier_count integer;
begin
  if v_actor_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not has_backoffice_role(v_actor_user_id, 'super_admin'::backoffice_role) then
    raise exception 'BACKOFFICE_SUPER_ADMIN_REQUIRED';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'CHAIN_TIER_REASON_REQUIRED';
  end if;

  select slug into v_plan_slug
  from public.plans
  where id = p_plan_id;

  if v_plan_slug is null then
    raise exception 'PLAN_NOT_FOUND';
  end if;

  if lower(v_plan_slug) <> 'chain' then
    raise exception 'CHAIN_PLAN_REQUIRED';
  end if;

  if p_tiers is null or jsonb_typeof(p_tiers) <> 'array' then
    raise exception 'CHAIN_TIERS_INVALID_PAYLOAD';
  end if;

  create temporary table tmp_chain_tiers (
    currency text not null,
    tier_label text not null,
    tier_min integer not null,
    tier_max integer,
    price_per_location numeric,
    price_per_location_annual numeric,
    is_custom boolean not null
  ) on commit drop;

  insert into tmp_chain_tiers (currency, tier_label, tier_min, tier_max, price_per_location, price_per_location_annual, is_custom)
  select
    upper(btrim(value->>'currency')) as currency,
    coalesce(nullif(btrim(value->>'tier_label'), ''),
      concat((value->>'tier_min')::integer::text, case when nullif(value->>'tier_max', '') is null then '+' else '-' || (value->>'tier_max') end)
    ) as tier_label,
    (value->>'tier_min')::integer as tier_min,
    nullif(value->>'tier_max', '')::integer as tier_max,
    nullif(value->>'price_per_location', '')::numeric as price_per_location,
    nullif(value->>'price_per_location_annual', '')::numeric as price_per_location_annual,
    coalesce((value->>'is_custom')::boolean, false) as is_custom
  from jsonb_array_elements(p_tiers) as value;

  select count(*) into v_tier_count from tmp_chain_tiers;
  if v_tier_count = 0 then
    raise exception 'CHAIN_TIERS_REQUIRED';
  end if;

  if exists (select 1 from tmp_chain_tiers where currency not in ('USD', 'NGN', 'GHS')) then
    raise exception 'CHAIN_TIER_CURRENCY_INVALID';
  end if;

  if exists (select 1 from tmp_chain_tiers where tier_min < 2 or (tier_max is not null and tier_max < tier_min)) then
    raise exception 'CHAIN_TIER_RANGE_INVALID';
  end if;

  if exists (
    select 1
    from tmp_chain_tiers
    where (is_custom and price_per_location is not null)
      or (not is_custom and (price_per_location is null or price_per_location < 0))
  ) then
    raise exception 'CHAIN_TIER_PRICE_INVALID';
  end if;

  if exists (
    select 1
    from tmp_chain_tiers
    where (is_custom and price_per_location_annual is not null)
      or (not is_custom and price_per_location_annual is not null and price_per_location_annual < 0)
  ) then
    raise exception 'CHAIN_TIER_ANNUAL_PRICE_INVALID';
  end if;

  if exists (
    select 1
    from (
      select
        currency,
        tier_min,
        coalesce(tier_max, 2147483647) as tier_max,
        lag(coalesce(tier_max, 2147483647)) over (partition by currency order by tier_min) as prev_tier_max
      from tmp_chain_tiers
    ) ordered
    where prev_tier_max is not null
      and tier_min <= prev_tier_max
  ) then
    raise exception 'CHAIN_TIER_OVERLAP';
  end if;

  for v_currency in select distinct currency from tmp_chain_tiers loop
    v_prev_max := 1;

    for v_row in
      select tier_min, tier_max, is_custom
      from tmp_chain_tiers
      where currency = v_currency
      order by tier_min asc
    loop
      if v_row.tier_min <> v_prev_max + 1 then
        raise exception 'CHAIN_TIER_GAP_OR_OVERLAP_%', v_currency;
      end if;

      if v_row.tier_max is null then
        if not v_row.is_custom then
          raise exception 'CHAIN_TIER_OPEN_ENDED_MUST_BE_CUSTOM_%', v_currency;
        end if;
        v_prev_max := 2147483647;
      else
        v_prev_max := v_row.tier_max;
      end if;
    end loop;

    if exists (
      select 1
      from tmp_chain_tiers
      where currency = v_currency
        and tier_max is null
      group by currency
      having count(*) > 1
    ) then
      raise exception 'CHAIN_TIER_OPEN_ENDED_DUPLICATE_%', v_currency;
    end if;
  end loop;

  delete from public.additional_location_pricing
  where plan_id = p_plan_id;

  insert into public.additional_location_pricing (
    plan_id,
    currency,
    tier_label,
    tier_min,
    tier_max,
    price_per_location,
    price_per_location_annual,
    is_custom
  )
  select
    p_plan_id,
    currency,
    tier_label,
    tier_min,
    tier_max,
    price_per_location,
    price_per_location_annual,
    is_custom
  from tmp_chain_tiers;

  insert into public.audit_logs (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_actor_user_id,
    'chain_pricing_tiers_updated',
    'plan',
    p_plan_id,
    jsonb_build_object(
      'reason', p_reason,
      'tier_count', v_tier_count
    )
  );

  return jsonb_build_object('success', true, 'tier_count', v_tier_count);
end;
$$;

grant execute on function public.backoffice_upsert_chain_location_pricing(uuid, jsonb, text) to authenticated;
