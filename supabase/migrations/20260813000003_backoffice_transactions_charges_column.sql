-- Backoffice-only visibility into the fees embedded in each transaction's
-- true amount: the platform service charge and the separate customer-facing
-- fee, both recorded in payment_intents.metadata by the fee-calculation
-- module (see payment-fee-calculator.ts). Nothing salon- or customer-facing
-- changes — this is purely an additional column for internal auditing.
drop function if exists public.get_backoffice_transactions(
  timestamptz, timestamptz, integer, integer, uuid, text, public.payment_method, text, text, text
);

create or replace function public.get_backoffice_transactions(
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer default 25,
  p_offset integer default 0,
  p_tenant_id uuid default null,
  p_currency text default null,
  p_method public.payment_method default null,
  p_type text default null,
  p_status text default null,
  p_search text default null
)
returns table (
  id uuid,
  tenant_id uuid,
  tenant_name text,
  customer_id uuid,
  customer_name text,
  type text,
  method public.payment_method,
  amount numeric,
  charges numeric,
  currency text,
  provider text,
  provider_reference text,
  status text,
  created_at timestamptz,
  appointment_id uuid,
  service_name text,
  service_count integer,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not is_backoffice_user(auth.uid()) then
    raise exception 'BACKOFFICE_ACCESS_REQUIRED';
  end if;

  return query
  select
    t.id,
    t.tenant_id,
    tn.name,
    t.customer_id,
    c.full_name,
    t.type,
    t.method,
    t.amount,
    fees.charges,
    t.currency,
    t.provider,
    coalesce(t.provider_reference, t.paystack_reference),
    t.status,
    t.created_at,
    t.appointment_id,
    svc.service_name,
    coalesce(svc.service_count, 0),
    count(*) over ()
  from public.transactions t
  join public.tenants tn on tn.id = t.tenant_id
  left join public.customers c on c.id = t.customer_id
  left join lateral (
    select
      (array_agg(aps.service_name order by aps.created_at))[1] as service_name,
      count(*)::integer as service_count
    from public.appointment_services aps
    where aps.appointment_id = t.appointment_id
  ) svc on t.appointment_id is not null
  left join lateral (
    select
      coalesce((pi.metadata->>'platform_service_charge_amount')::numeric, 0)
        + coalesce((pi.metadata->>'customer_facing_fee_amount')::numeric, 0) as charges
    from public.payment_intents pi
    where pi.paystack_reference = coalesce(t.provider_reference, t.paystack_reference)
    limit 1
  ) fees on true
  where t.created_at >= p_from
    and t.created_at < p_to
    and (p_tenant_id is null or t.tenant_id = p_tenant_id)
    and (p_currency is null or upper(t.currency) = upper(p_currency))
    and (p_method is null or t.method = p_method)
    and (p_type is null or t.type = p_type)
    and (p_status is null or t.status = p_status)
    and (
      v_search is null
      or tn.name ilike '%' || v_search || '%'
      or c.full_name ilike '%' || v_search || '%'
      or t.provider_reference ilike '%' || v_search || '%'
      or t.paystack_reference ilike '%' || v_search || '%'
    )
  order by t.created_at desc
  limit p_limit
  offset p_offset;
end;
$$;

grant execute on function public.get_backoffice_transactions(
  timestamptz, timestamptz, integer, integer, uuid, text, public.payment_method, text, text, text
) to authenticated;
