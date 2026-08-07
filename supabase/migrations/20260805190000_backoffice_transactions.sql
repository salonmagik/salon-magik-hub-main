-- Platform-wide transactions view for backoffice — mirrors the
-- subscription ledger / comms credits pages. transactions is already the
-- single source of truth (refunds, offline/cash payments, and the
-- customer-value migration all funnel through it), so this aggregates it
-- directly rather than introducing a new table.
--
-- No index on created_at existed before this — the per-tenant salon-admin
-- view fetches a tenant's whole history unbounded and filters client-side,
-- which doesn't scale once queries span every tenant. Server-side date
-- filtering + pagination + this index are required, not optional, here.
create index if not exists idx_transactions_created_at
  on public.transactions (created_at desc);

create index if not exists idx_transactions_tenant_created_at
  on public.transactions (tenant_id, created_at desc);

-- Paginated, filterable transaction list.
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

-- Per-currency volume for the stat cards — amounts can't be summed across
-- currencies, so this stays broken out rather than one combined total.
create or replace function public.get_backoffice_transaction_summary_by_currency(
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  currency text,
  volume numeric,
  tx_count integer
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
    upper(t.currency),
    sum(t.amount) filter (where t.type <> 'refund'),
    count(*)::integer
  from public.transactions t
  where t.created_at >= p_from
    and t.created_at < p_to
    and t.status = 'completed'
  group by upper(t.currency)
  order by upper(t.currency);
end;
$$;

grant execute on function public.get_backoffice_transaction_summary_by_currency(timestamptz, timestamptz) to authenticated;

-- Cross-currency counts (counts, unlike amounts, are safe to combine).
create or replace function public.get_backoffice_transaction_totals(
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  total_count integer,
  failed_count integer,
  refund_count integer
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
    count(*)::integer,
    count(*) filter (where t.status = 'failed')::integer,
    count(*) filter (where t.type = 'refund')::integer
  from public.transactions t
  where t.created_at >= p_from
    and t.created_at < p_to;
end;
$$;

grant execute on function public.get_backoffice_transaction_totals(timestamptz, timestamptz) to authenticated;
