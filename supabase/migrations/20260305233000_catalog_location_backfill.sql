set check_function_bodies = off;

-- Treat legacy locations (null availability) as open.
update public.locations
set availability = 'open'
where availability is null;

alter table public.locations
  alter column availability set default 'open';

-- Backfill location mappings for legacy catalog rows that currently have no mappings.
with target_locations as (
  select id, tenant_id
  from public.locations
  where availability = 'open'
), unmapped_services as (
  select s.id, s.tenant_id
  from public.services s
  where s.deleted_at is null
    and not exists (
      select 1
      from public.service_locations sl
      where sl.service_id = s.id
    )
)
insert into public.service_locations (tenant_id, service_id, location_id, is_enabled)
select us.tenant_id, us.id, tl.id, true
from unmapped_services us
join target_locations tl on tl.tenant_id = us.tenant_id
on conflict (service_id, location_id) do update
set is_enabled = excluded.is_enabled,
    updated_at = now();

with target_locations as (
  select id, tenant_id
  from public.locations
  where availability = 'open'
), unmapped_products as (
  select p.id, p.tenant_id
  from public.products p
  where p.deleted_at is null
    and not exists (
      select 1
      from public.product_locations pl
      where pl.product_id = p.id
    )
)
insert into public.product_locations (tenant_id, product_id, location_id, is_enabled)
select up.tenant_id, up.id, tl.id, true
from unmapped_products up
join target_locations tl on tl.tenant_id = up.tenant_id
on conflict (product_id, location_id) do update
set is_enabled = excluded.is_enabled,
    updated_at = now();

with target_locations as (
  select id, tenant_id
  from public.locations
  where availability = 'open'
), unmapped_packages as (
  select p.id, p.tenant_id
  from public.packages p
  where p.deleted_at is null
    and not exists (
      select 1
      from public.package_locations pl
      where pl.package_id = p.id
    )
)
insert into public.package_locations (tenant_id, package_id, location_id, is_enabled)
select up.tenant_id, up.id, tl.id, true
from unmapped_packages up
join target_locations tl on tl.tenant_id = up.tenant_id
on conflict (package_id, location_id) do update
set is_enabled = excluded.is_enabled,
    updated_at = now();

with target_locations as (
  select id, tenant_id
  from public.locations
  where availability = 'open'
), unmapped_vouchers as (
  select v.id, v.tenant_id
  from public.vouchers v
  where v.deleted_at is null
    and not exists (
      select 1
      from public.voucher_locations vl
      where vl.voucher_id = v.id
    )
)
insert into public.voucher_locations (tenant_id, voucher_id, location_id, is_enabled)
select uv.tenant_id, uv.id, tl.id, true
from unmapped_vouchers uv
join target_locations tl on tl.tenant_id = uv.tenant_id
on conflict (voucher_id, location_id) do update
set is_enabled = excluded.is_enabled,
    updated_at = now();
