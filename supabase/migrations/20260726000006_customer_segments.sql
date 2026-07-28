-- Customer segmentation foundation (#4).
--
-- Adds the manual VIP star, and a computed-on-the-fly customer_segments view
-- that derives per-customer tags from existing data:
--   is_vip          manual star (customers.is_starred)
--   is_regular      visit_count >= 5
--   is_lapsed       last_visit_at older than 45 days
--   loves_packages  >= 3 non-cancelled package purchases in the last quarter
--   is_big_spender  top 10% of the salon's paying customers by total paid,
--                   guarded: only when the salon has >= 5 paying customers
--
-- The view uses security_invoker so the caller's RLS on the underlying tables
-- applies (each salon only sees its own customers). If read volume ever makes
-- this slow, it can be swapped for a materialized view on a refresh schedule
-- without changing callers.

alter table public.customers
  add column if not exists is_starred boolean not null default false;

-- Supporting indexes for the aggregations.
create index if not exists appointments_customer_paid_idx
  on public.appointments (customer_id)
  where amount_paid > 0;

create index if not exists cpe_customer_created_idx
  on public.customer_package_entitlements (customer_id, created_at);

drop view if exists public.customer_segments;

create view public.customer_segments
with (security_invoker = true)
as
with spend as (
  select
    a.tenant_id,
    a.customer_id,
    sum(a.amount_paid) as total_paid
  from public.appointments a
  where a.amount_paid > 0
  group by a.tenant_id, a.customer_id
),
tenant_spend_stats as (
  select
    tenant_id,
    count(*) as paying_customers,
    percentile_cont(0.9) within group (order by total_paid) as p90_paid
  from spend
  group by tenant_id
),
pkgs as (
  select
    e.customer_id,
    count(*) as pkgs_last_quarter
  from public.customer_package_entitlements e
  where e.created_at >= now() - interval '3 months'
    and e.status not in ('cancelled', 'refunded')
  group by e.customer_id
)
select
  c.id                                   as customer_id,
  c.tenant_id,
  c.is_starred                           as is_vip,
  (c.visit_count >= 5)                   as is_regular,
  (c.last_visit_at is not null
     and c.last_visit_at < now() - interval '45 days') as is_lapsed,
  (coalesce(pkgs.pkgs_last_quarter, 0) >= 3) as loves_packages,
  (
    s.total_paid is not null
    and tss.paying_customers >= 5
    and s.total_paid >= tss.p90_paid
  )                                      as is_big_spender,
  coalesce(s.total_paid, 0)              as total_paid,
  coalesce(pkgs.pkgs_last_quarter, 0)    as packages_last_quarter
from public.customers c
left join spend s              on s.customer_id = c.id
left join tenant_spend_stats tss on tss.tenant_id = c.tenant_id
left join pkgs                 on pkgs.customer_id = c.id;

grant select on public.customer_segments to authenticated;
