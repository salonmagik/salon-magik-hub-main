-- Keep the standard Chain location bands usable in a fresh or partially
-- configured environment. Backoffice remains the source of truth: this only
-- fills a missing band and never overwrites an existing value.
do $$
declare
  v_chain_id uuid;
begin
  select id
  into v_chain_id
  from public.plans
  where slug = 'chain'
  limit 1;

  if v_chain_id is null then
    raise exception 'CHAIN_PLAN_NOT_FOUND';
  end if;

  -- Standard launch markets. USD is intentionally excluded from the
  -- customer-facing catalog, but the quote engine still supports it for
  -- historical tenants and older records.
  insert into public.additional_location_pricing (
    plan_id,
    currency,
    tier_label,
    tier_min,
    tier_max,
    price_per_location,
    is_custom
  )
  select
    v_chain_id,
    seeded.currency,
    seeded.tier_label,
    seeded.tier_min,
    seeded.tier_max,
    seeded.price_per_location,
    seeded.is_custom
  from (
    values
      ('NGN', '2-3', 2, 3, 25000::numeric, false),
      ('NGN', '4-10', 4, 10, 18000::numeric, false),
      ('NGN', '11+', 11, null::integer, null::numeric, true),
      ('GHS', '2-3', 2, 3, 360::numeric, false),
      ('GHS', '4-10', 4, 10, 240::numeric, false),
      ('GHS', '11+', 11, null::integer, null::numeric, true)
  ) as seeded(currency, tier_label, tier_min, tier_max, price_per_location, is_custom)
  where not exists (
    select 1
    from public.additional_location_pricing existing
    where existing.plan_id = v_chain_id
      and existing.currency = seeded.currency
      and existing.tier_min <= coalesce(seeded.tier_max, existing.tier_min)
      and coalesce(existing.tier_max, 2147483647) >= seeded.tier_min
  );
end $$;
