-- Removes the chain+annual carve-out now that compute_chain_price can
-- price an annual cycle. If annual Chain pricing is not yet configured for
-- the tenant's currency, compute_chain_price(..., 'annual') returns a null
-- total_price — this raises rather than silently omitting the base price
-- (a platform misconfiguration must never look like a smaller bill). The
-- charge pass in process-recurring-addon-billing treats this as a
-- non-retryable error, not a payment failure.
--
-- Must not run before any existing Chain-annual tenant has been migrated
-- off its Paystack-native Subscription (see the migrate-chain-annual-billing
-- edge function and AD-9) — otherwise that tenant's base price would be
-- charged twice: once here, once by their still-active native Subscription.
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

  if lower(v_plan) = 'chain' then
    select * into v_chain_quote
    from public.compute_chain_price(v_plan_id, v_currency, 1, v_billing_cycle)
    limit 1;

    if v_billing_cycle = 'annual' and v_chain_quote.total_price is null then
      raise exception 'CHAIN_ANNUAL_PRICING_NOT_CONFIGURED';
    end if;

    v_base_price := coalesce(v_chain_quote.total_price, 0);
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
