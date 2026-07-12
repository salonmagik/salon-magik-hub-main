-- The recurring add-on billing cron only ever charges the VARIABLE portion of
-- a tenant's bill (seat overage + chain location overage). The base tier price
-- is still billed by Paystack's own fixed-amount recurring Plan/Subscription
-- (see create-checkout-session) — charging it again here would double-bill.
create or replace function public.compute_current_addon_total(
  p_tenant_id uuid
)
returns table (
  addon_total numeric,
  currency text,
  breakdown jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_slug text;
  v_currency text;
  v_chain_plan_id uuid;
  v_current_allowed_locations integer;
  v_current_extra_seats integer;
  v_seat_unit_price numeric := 0;
  v_country text;
  v_location_addon_price numeric := 0;
  v_chain_quote_current record;
  v_chain_quote_base record;
begin
  select t.plan::text, t.currency, t.country
  into v_plan_slug, v_currency, v_country
  from public.tenants t
  where t.id = p_tenant_id;

  if v_plan_slug is null then
    raise exception 'TENANT_NOT_FOUND';
  end if;

  v_currency := upper(coalesce(v_currency, 'USD'));

  select coalesce(sum(tae.quantity), 0)::integer
  into v_current_extra_seats
  from public.tenant_addon_entitlements tae
  where tae.tenant_id = p_tenant_id
    and tae.addon_type = 'extra_seat'
    and tae.status = 'active'
    and (tae.ends_at is null or tae.ends_at > now());

  select sap.unit_price_per_extra_seat
  into v_seat_unit_price
  from public.staff_addon_pricing sap
  where sap.country_code = upper(coalesce(v_country, 'US'))
    and sap.currency = v_currency
    and sap.status = 'active'
    and sap.effective_from <= now()
  order by sap.effective_from desc
  limit 1;
  v_seat_unit_price := coalesce(v_seat_unit_price, 0);

  if lower(v_plan_slug) = 'chain' then
    select e.allowed_locations into v_current_allowed_locations
    from public.tenant_plan_entitlements e
    where e.tenant_id = p_tenant_id;
    v_current_allowed_locations := coalesce(v_current_allowed_locations, 1);

    select p.id into v_chain_plan_id
    from public.plans p
    where lower(p.slug) = 'chain'
    order by p.is_active desc nulls last, p.created_at desc nulls last
    limit 1;

    select * into v_chain_quote_current
    from public.compute_chain_price(v_chain_plan_id, v_currency, greatest(v_current_allowed_locations, 1))
    limit 1;

    select * into v_chain_quote_base
    from public.compute_chain_price(v_chain_plan_id, v_currency, 1)
    limit 1;

    v_location_addon_price := greatest(coalesce(v_chain_quote_current.total_price, 0) - coalesce(v_chain_quote_base.total_price, 0), 0);
  end if;

  return query
  select
    v_location_addon_price + (v_current_extra_seats * v_seat_unit_price),
    v_currency,
    jsonb_build_object(
      'extra_seats', v_current_extra_seats,
      'seat_unit_price', v_seat_unit_price,
      'seat_addon_total', v_current_extra_seats * v_seat_unit_price,
      'location_addon_total', v_location_addon_price
    );
end;
$$;

grant execute on function public.compute_current_addon_total(uuid) to authenticated;
grant execute on function public.compute_current_addon_total(uuid) to service_role;
