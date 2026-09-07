-- Annual tenants used Paystack's own native Subscription object for their
-- base plan price, paid for separately from the self-managed monthly cron
-- that handled everyone's add-ons. That meant a second, entirely unmonitored
-- billing engine running in parallel — nothing in this codebase ever
-- listened for whether Paystack's own annual renewals succeeded or failed.
-- Annual tenants now go through the exact same self-managed mechanism as
-- monthly ones (saved-card charge_authorization, our own cron, our own
-- webhook), just charged once a year instead of every 30 days — so
-- compute_tenant_recurring_total no longer excludes the base price for
-- annual tenants; the cron (process-recurring-addon-billing) now schedules
-- the next charge 365 days out for them instead of 30.
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
  v_billing_cycle text;
  v_plan_id uuid;
  v_base_price numeric := 0;
  v_addon_total numeric := 0;
  v_addon_currency text;
  v_addon_breakdown jsonb := '{}'::jsonb;
  v_chain_quote record;
  v_pre_discount numeric;
  v_discount numeric := 0;
begin
  select t.plan::text, upper(coalesce(t.currency, 'USD')), coalesce(t.billing_cycle, 'monthly')
  into v_plan, v_currency, v_billing_cycle
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

  -- Both cycles are now fully self-managed for non-chain plans — the base
  -- price is always included here, using plan_pricing.annual_price for
  -- annual tenants instead of the Paystack-native Subscription that used to
  -- cover it. billing_cycle only changes how far apart charges land (see
  -- getNextBillingAt / process-recurring-addon-billing).
  --
  -- Chain is a carve-out: compute_chain_price has no annual-tiered pricing
  -- model at all (additional_location_pricing is monthly-only), so there is
  -- no correct annual chain number to charge yet — chain annual tenants
  -- keep the pre-existing behavior (base price excluded here) until that
  -- pricing model exists. Flagged as a known gap, not silently guessed at.
  if lower(v_plan) = 'chain' then
    if v_billing_cycle = 'monthly' then
      select * into v_chain_quote
      from public.compute_chain_price(v_plan_id, v_currency, 1)
      limit 1;
      v_base_price := coalesce(v_chain_quote.total_price, 0);
    end if;
  else
    select
      case when v_billing_cycle = 'annual' then pp.annual_price else pp.monthly_price end
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
      'billing_cycle', v_billing_cycle,
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
