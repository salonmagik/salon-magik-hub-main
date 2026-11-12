-- get_backoffice_subscription_ledger has been failing with Postgres error
-- 42804 ("Returned type character varying(255) does not match expected
-- type text in column 18") on every Tenant billing page load, since
-- auth.users.email is varchar(255) but the function's RETURNS TABLE
-- declares cancellation_requested_by_email as text. This made the entire
-- subscription ledger (every tenant's billing row) fail to load. Cast the
-- varchar column to text explicitly.

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
  comms_last_purchase_currency text,
  subscription_cancel_at timestamptz,
  cancellation_reason text,
  cancellation_reason_note text,
  cancellation_requested_by_email text,
  cancellation_requested_at timestamptz,
  billing_grace_ends_at timestamptz,
  suspended_at timestamptz,
  billing_retry_count integer
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
    lp.currency,
    t.subscription_cancel_at,
    t.cancellation_reason,
    t.cancellation_reason_note,
    requester.email::text,
    t.cancellation_requested_at,
    t.billing_grace_ends_at,
    t.suspended_at,
    t.billing_retry_count
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
  left join auth.users requester on requester.id = t.cancellation_requested_by
  order by t.created_at desc;
end;
$$;

grant execute on function public.get_backoffice_subscription_ledger() to authenticated;
