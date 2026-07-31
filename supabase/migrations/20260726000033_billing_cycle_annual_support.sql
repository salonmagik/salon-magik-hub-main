-- No billing_cycle was ever persisted on tenants, so the self-managed
-- recurring cron had no way to tell an annual subscriber from a monthly one
-- — it would either double-charge them for the base plan (once via their
-- annual Paystack Subscription, once via the cron) or, as shipped in the
-- previous migration, skip scheduling them for the cron entirely and lose
-- their monthly-priced add-on billing (seats/locations/staff-ops) altogether.
--
-- Fix: persist billing_cycle, and make compute_tenant_recurring_total exclude
-- the base plan price for annual tenants (their annual Paystack Subscription
-- already covers that) while still charging their add-on portion monthly,
-- same as everyone else.
alter table public.tenants
  add column if not exists billing_cycle text not null default 'monthly';

alter table public.tenants
  drop constraint if exists tenants_billing_cycle_check;
alter table public.tenants
  add constraint tenants_billing_cycle_check check (billing_cycle in ('monthly', 'annual'));

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

  -- Annual tenants already prepaid their base plan price via Paystack's own
  -- Subscription (created at annual checkout) — only add-ons are self-managed
  -- monthly for them. Monthly tenants have no such subscription; their base
  -- price is fully self-managed here.
  if v_billing_cycle = 'monthly' then
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
