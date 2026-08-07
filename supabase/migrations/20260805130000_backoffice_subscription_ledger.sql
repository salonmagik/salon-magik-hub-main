-- Backoffice-only cross-tenant subscription/add-on ledger. Reuses
-- compute_current_addon_total (already the source of truth for a
-- tenant's own recurring add-on billing) instead of re-deriving addon
-- pricing logic here.
create or replace function public.get_backoffice_subscription_ledger()
returns table (
  tenant_id uuid,
  tenant_name text,
  country text,
  plan text,
  subscription_status text,
  next_billing_at timestamptz,
  currency text,
  base_mrr numeric,
  addon_mrr numeric,
  addon_breakdown jsonb,
  comms_balance integer,
  comms_last_purchase_at timestamptz,
  comms_last_purchase_amount numeric,
  comms_last_purchase_currency text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_backoffice_user(auth.uid()) then
    raise exception 'BACKOFFICE_ACCESS_REQUIRED';
  end if;

  return query
  select
    t.id,
    t.name,
    t.country,
    t.plan::text,
    t.subscription_status::text,
    t.next_billing_at,
    upper(coalesce(t.currency, 'USD')),
    coalesce(pp.monthly_price, 0),
    coalesce(addon.addon_total, 0),
    coalesce(addon.breakdown, '{}'::jsonb),
    cc.balance,
    lp.created_at,
    lp.amount,
    lp.currency
  from public.tenants t
  left join public.plans p on lower(p.slug) = lower(t.plan::text)
  left join public.plan_pricing pp
    on pp.plan_id = p.id
    and pp.currency = upper(coalesce(t.currency, 'USD'))
    and pp.valid_until is null
  left join lateral public.compute_current_addon_total(t.id) addon on true
  left join public.communication_credits cc on cc.tenant_id = t.id
  left join lateral (
    select mcp.created_at, mcp.amount, mcp.currency
    from public.messaging_credit_purchases mcp
    where mcp.tenant_id = t.id
    order by mcp.created_at desc
    limit 1
  ) lp on true
  order by t.created_at desc;
end;
$$;

grant execute on function public.get_backoffice_subscription_ledger() to authenticated;

-- Per-tenant billing activity, assembled at query time — there is no
-- single ledger table. Sources: tenant_addon_entitlements (add-on
-- activations), messaging_credit_purchases (comms top-ups), and the
-- audit_logs rows the billing edge functions already write for
-- subscription activation and recurring add-on charges. audit_logs.
-- entity_type is inconsistently "tenant" vs "tenants" across call
-- sites, so this matches on entity_id + action instead.
create or replace function public.get_tenant_billing_activity(p_tenant_id uuid)
returns table (
  event_type text,
  description text,
  amount numeric,
  currency text,
  occurred_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_backoffice_user(auth.uid()) then
    raise exception 'BACKOFFICE_ACCESS_REQUIRED';
  end if;

  return query
  (
    select
      'addon_activated'::text as event_type,
      case tae.addon_type
        when 'extra_seat' then 'Add-on activated: extra seat (x' || tae.quantity || ')'
        when 'theme_ecommerce' then 'Add-on activated: e-commerce theme'
        when 'staff_operations' then 'Add-on activated: Staff Operations'
        else 'Add-on activated: ' || tae.addon_type
      end as description,
      null::numeric as amount,
      null::text as currency,
      tae.started_at as occurred_at
    from public.tenant_addon_entitlements tae
    where tae.tenant_id = p_tenant_id
  )
  union all
  (
    select
      'credit_purchase'::text,
      mcp.credits || ' comms credits purchased',
      mcp.amount,
      mcp.currency,
      mcp.created_at
    from public.messaging_credit_purchases mcp
    where mcp.tenant_id = p_tenant_id
  )
  union all
  (
    select
      'subscription_activated'::text,
      'Subscription payment',
      (al.metadata->>'amount')::numeric,
      al.metadata->>'currency',
      al.created_at
    from public.audit_logs al
    where al.entity_id = p_tenant_id
      and al.action = 'subscription.activated'
  )
  union all
  (
    select
      'plan_configuration_charged'::text,
      'Plan/branch/seat change charged',
      coalesce(al.metadata->>'charged', al.metadata->>'price_delta')::numeric,
      al.metadata->>'currency',
      al.created_at
    from public.audit_logs al
    where al.entity_id = p_tenant_id
      and al.action = 'plan_configuration_charged'
  )
  union all
  (
    select
      'recurring_addon_billed'::text,
      'Recurring add-on charge',
      (al.metadata->>'total')::numeric,
      al.metadata->>'currency',
      al.created_at
    from public.audit_logs al
    where al.entity_id = p_tenant_id
      and al.action = 'recurring_addon_billing_charged'
  )
  union all
  (
    select
      'recurring_addon_billing_failed'::text,
      'Recurring add-on charge failed: ' || coalesce(al.metadata->>'error', 'unknown error'),
      (al.metadata->>'addon_total')::numeric,
      al.metadata->>'currency',
      al.created_at
    from public.audit_logs al
    where al.entity_id = p_tenant_id
      and al.action = 'recurring_addon_billing_failed'
  )
  order by occurred_at desc
  limit 50;
end;
$$;

grant execute on function public.get_tenant_billing_activity(uuid) to authenticated;
