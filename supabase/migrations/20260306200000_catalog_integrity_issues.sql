create table if not exists public.catalog_item_integrity_issues (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  item_type text not null check (item_type in ('service', 'product', 'package', 'voucher')),
  item_id uuid not null,
  severity text not null check (severity in ('warning', 'blocking')),
  issue_code text not null,
  issue_message text not null,
  branch_location_ids uuid[] not null default '{}'::uuid[],
  metadata jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz null
);

create index if not exists idx_catalog_integrity_issues_item_active
  on public.catalog_item_integrity_issues (tenant_id, item_type, item_id, resolved_at);

create index if not exists idx_catalog_integrity_issues_severity_active
  on public.catalog_item_integrity_issues (tenant_id, severity, resolved_at);

alter table public.catalog_item_integrity_issues enable row level security;

drop policy if exists "Tenant members can read catalog integrity issues" on public.catalog_item_integrity_issues;
create policy "Tenant members can read catalog integrity issues"
  on public.catalog_item_integrity_issues
  for select
  to authenticated
  using (belongs_to_tenant(auth.uid(), tenant_id));

drop policy if exists "Tenant members can write catalog integrity issues" on public.catalog_item_integrity_issues;
create policy "Tenant members can write catalog integrity issues"
  on public.catalog_item_integrity_issues
  for all
  to authenticated
  using (belongs_to_tenant(auth.uid(), tenant_id))
  with check (belongs_to_tenant(auth.uid(), tenant_id));

drop policy if exists "Anon can read active blocking catalog integrity issues for booking" on public.catalog_item_integrity_issues;
create policy "Anon can read active blocking catalog integrity issues for booking"
  on public.catalog_item_integrity_issues
  for select
  to anon
  using (
    resolved_at is null
    and severity = 'blocking'
    and tenant_id in (
      select id
      from public.tenants
      where online_booking_enabled = true
        and slug is not null
    )
  );

drop function if exists public.validate_catalog_item_integrity(uuid, text, uuid);
create function public.validate_catalog_item_integrity(
  p_tenant_id uuid,
  p_item_type text,
  p_item_id uuid
)
returns setof public.catalog_item_integrity_issues
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_item_type text := lower(trim(coalesce(p_item_type, '')));
  v_plan text;
  v_open_location_count integer := 0;
  v_mapped_location_ids uuid[] := '{}'::uuid[];
  v_mapped_count integer := 0;
  v_distinct_currency_count integer := 0;
  v_unknown_currency_location_ids uuid[] := '{}'::uuid[];
begin
  if p_tenant_id is null or p_item_id is null then
    raise exception 'INVALID_CATALOG_INTEGRITY_INPUT';
  end if;

  if v_item_type not in ('service', 'product', 'package', 'voucher') then
    raise exception 'INVALID_CATALOG_ITEM_TYPE';
  end if;

  if v_actor is not null and not belongs_to_tenant(v_actor, p_tenant_id) then
    raise exception 'TENANT_ACCESS_DENIED';
  end if;

  select lower(coalesce(t.plan::text, ''))
    into v_plan
  from public.tenants t
  where t.id = p_tenant_id;

  if v_plan is null then
    raise exception 'TENANT_NOT_FOUND';
  end if;

  update public.catalog_item_integrity_issues
  set resolved_at = now()
  where tenant_id = p_tenant_id
    and item_type = v_item_type
    and item_id = p_item_id
    and resolved_at is null;

  if v_plan <> 'chain' then
    return query
    select *
    from public.catalog_item_integrity_issues
    where false;
    return;
  end if;

  select count(*)
    into v_open_location_count
  from public.locations l
  where l.tenant_id = p_tenant_id
    and (l.availability is null or l.availability = 'open');

  if v_item_type = 'service' then
    select coalesce(array_agg(distinct sl.location_id), '{}'::uuid[])
      into v_mapped_location_ids
    from public.service_locations sl
    where sl.tenant_id = p_tenant_id
      and sl.service_id = p_item_id
      and sl.is_enabled = true;
  elsif v_item_type = 'product' then
    select coalesce(array_agg(distinct pl.location_id), '{}'::uuid[])
      into v_mapped_location_ids
    from public.product_locations pl
    where pl.tenant_id = p_tenant_id
      and pl.product_id = p_item_id
      and pl.is_enabled = true;
  elsif v_item_type = 'package' then
    select coalesce(array_agg(distinct pl.location_id), '{}'::uuid[])
      into v_mapped_location_ids
    from public.package_locations pl
    where pl.tenant_id = p_tenant_id
      and pl.package_id = p_item_id
      and pl.is_enabled = true;
  else
    select coalesce(array_agg(distinct vl.location_id), '{}'::uuid[])
      into v_mapped_location_ids
    from public.voucher_locations vl
    where vl.tenant_id = p_tenant_id
      and vl.voucher_id = p_item_id
      and vl.is_enabled = true;
  end if;

  v_mapped_count := coalesce(array_length(v_mapped_location_ids, 1), 0);

  if v_mapped_count = 0 then
    insert into public.catalog_item_integrity_issues (
      tenant_id,
      item_type,
      item_id,
      severity,
      issue_code,
      issue_message,
      branch_location_ids,
      metadata
    )
    values (
      p_tenant_id,
      v_item_type,
      p_item_id,
      'blocking',
      'MISSING_LOCATION_MAPPING',
      'This item has no branch mapping. Assign at least one branch.',
      '{}'::uuid[],
      jsonb_build_object('item_type', v_item_type)
    );
  else
    with location_currency as (
      select
        l.id as location_id,
        case upper(coalesce(trim(l.country), ''))
          when 'GH' then 'GHS'
          when 'GHANA' then 'GHS'
          when 'NG' then 'NGN'
          when 'NIGERIA' then 'NGN'
          when 'US' then 'USD'
          when 'UNITEDSTATES' then 'USD'
          when 'UNITEDSTATESOFAMERICA' then 'USD'
          when 'GB' then 'GBP'
          when 'UNITEDKINGDOM' then 'GBP'
          when 'KE' then 'KES'
          when 'KENYA' then 'KES'
          when 'ZA' then 'ZAR'
          when 'SOUTHAFRICA' then 'ZAR'
          else null
        end as currency
      from public.locations l
      where l.tenant_id = p_tenant_id
        and l.id = any(v_mapped_location_ids)
    )
    select
      count(distinct lc.currency) filter (where lc.currency is not null),
      coalesce(array_agg(lc.location_id) filter (where lc.currency is null), '{}'::uuid[])
    into v_distinct_currency_count, v_unknown_currency_location_ids
    from location_currency lc;

    if coalesce(array_length(v_unknown_currency_location_ids, 1), 0) > 0 then
      insert into public.catalog_item_integrity_issues (
        tenant_id,
        item_type,
        item_id,
        severity,
        issue_code,
        issue_message,
        branch_location_ids,
        metadata
      )
      values (
        p_tenant_id,
        v_item_type,
        p_item_id,
        'blocking',
        'UNKNOWN_COUNTRY_CURRENCY',
        'One or more mapped branches have unknown/invalid country for currency resolution.',
        v_unknown_currency_location_ids,
        jsonb_build_object('invalid_location_ids', v_unknown_currency_location_ids)
      );
    end if;

    if v_distinct_currency_count > 1 then
      insert into public.catalog_item_integrity_issues (
        tenant_id,
        item_type,
        item_id,
        severity,
        issue_code,
        issue_message,
        branch_location_ids,
        metadata
      )
      values (
        p_tenant_id,
        v_item_type,
        p_item_id,
        'blocking',
        'MIXED_CURRENCY_MAPPING',
        'Mapped branches span multiple currencies. Split this item by currency group.',
        v_mapped_location_ids,
        jsonb_build_object('location_ids', v_mapped_location_ids)
      );
    end if;

    if v_open_location_count > 0 and v_mapped_count < v_open_location_count then
      insert into public.catalog_item_integrity_issues (
        tenant_id,
        item_type,
        item_id,
        severity,
        issue_code,
        issue_message,
        branch_location_ids,
        metadata
      )
      values (
        p_tenant_id,
        v_item_type,
        p_item_id,
        'warning',
        'PARTIAL_LOCATION_MAPPING',
        'This item is mapped to only some active branches.',
        v_mapped_location_ids,
        jsonb_build_object(
          'mapped_count', v_mapped_count,
          'active_branch_count', v_open_location_count,
          'location_ids', v_mapped_location_ids
        )
      );
    end if;
  end if;

  return query
  select *
  from public.catalog_item_integrity_issues
  where tenant_id = p_tenant_id
    and item_type = v_item_type
    and item_id = p_item_id
    and resolved_at is null
  order by
    case severity when 'blocking' then 1 else 2 end,
    detected_at desc;
end;
$$;

grant execute on function public.validate_catalog_item_integrity(uuid, text, uuid) to authenticated;

drop function if exists public.list_catalog_item_integrity_issues(uuid, text, uuid, text);
create function public.list_catalog_item_integrity_issues(
  p_tenant_id uuid,
  p_item_type text default null,
  p_item_id uuid default null,
  p_severity text default null
)
returns table (
  id uuid,
  tenant_id uuid,
  item_type text,
  item_id uuid,
  severity text,
  issue_code text,
  issue_message text,
  branch_location_ids uuid[],
  branch_location_names text[],
  metadata jsonb,
  detected_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    i.id,
    i.tenant_id,
    i.item_type,
    i.item_id,
    i.severity,
    i.issue_code,
    i.issue_message,
    i.branch_location_ids,
    coalesce(
      (
        select array_agg(distinct coalesce(l.city, l.name) order by coalesce(l.city, l.name))
        from public.locations l
        where l.id = any(i.branch_location_ids)
      ),
      '{}'::text[]
    ) as branch_location_names,
    i.metadata,
    i.detected_at
  from public.catalog_item_integrity_issues i
  where i.tenant_id = p_tenant_id
    and i.resolved_at is null
    and (
      auth.uid() is null
      or belongs_to_tenant(auth.uid(), p_tenant_id)
    )
    and (p_item_type is null or i.item_type = lower(trim(p_item_type)))
    and (p_item_id is null or i.item_id = p_item_id)
    and (p_severity is null or i.severity = lower(trim(p_severity)))
  order by
    case i.severity when 'blocking' then 1 else 2 end,
    i.detected_at desc;
$$;

grant execute on function public.list_catalog_item_integrity_issues(uuid, text, uuid, text) to authenticated;

drop function if exists public.trg_validate_catalog_integrity_item();
create function public.trg_validate_catalog_integrity_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_type text;
  v_item_id uuid;
  v_tenant_id uuid;
begin
  if tg_table_name = 'services' then
    v_item_type := 'service';
  elsif tg_table_name = 'products' then
    v_item_type := 'product';
  elsif tg_table_name = 'packages' then
    v_item_type := 'package';
  elsif tg_table_name = 'vouchers' then
    v_item_type := 'voucher';
  else
    return coalesce(new, old);
  end if;

  v_item_id := coalesce(new.id, old.id);
  v_tenant_id := coalesce(new.tenant_id, old.tenant_id);

  if v_item_id is not null and v_tenant_id is not null then
    perform public.validate_catalog_item_integrity(v_tenant_id, v_item_type, v_item_id);
  end if;

  return coalesce(new, old);
end;
$$;

drop function if exists public.trg_validate_catalog_integrity_mapping();
create function public.trg_validate_catalog_integrity_mapping()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_type text;
  v_item_id uuid;
  v_tenant_id uuid;
begin
  if tg_table_name = 'service_locations' then
    v_item_type := 'service';
    v_item_id := coalesce(new.service_id, old.service_id);
  elsif tg_table_name = 'product_locations' then
    v_item_type := 'product';
    v_item_id := coalesce(new.product_id, old.product_id);
  elsif tg_table_name = 'package_locations' then
    v_item_type := 'package';
    v_item_id := coalesce(new.package_id, old.package_id);
  elsif tg_table_name = 'voucher_locations' then
    v_item_type := 'voucher';
    v_item_id := coalesce(new.voucher_id, old.voucher_id);
  else
    return coalesce(new, old);
  end if;

  v_tenant_id := coalesce(new.tenant_id, old.tenant_id);

  if v_item_id is not null and v_tenant_id is not null then
    perform public.validate_catalog_item_integrity(v_tenant_id, v_item_type, v_item_id);
  end if;

  return coalesce(new, old);
end;
$$;

drop function if exists public.trg_validate_catalog_integrity_location_change();
create function public.trg_validate_catalog_integrity_location_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_id uuid;
begin
  if (coalesce(new.country, '') = coalesce(old.country, ''))
     and (coalesce(new.availability::text, '') = coalesce(old.availability::text, '')) then
    return new;
  end if;

  for v_item_id in
    select distinct sl.service_id
    from public.service_locations sl
    where sl.tenant_id = new.tenant_id
      and sl.location_id = new.id
      and sl.is_enabled = true
  loop
    perform public.validate_catalog_item_integrity(new.tenant_id, 'service', v_item_id);
  end loop;

  for v_item_id in
    select distinct pl.product_id
    from public.product_locations pl
    where pl.tenant_id = new.tenant_id
      and pl.location_id = new.id
      and pl.is_enabled = true
  loop
    perform public.validate_catalog_item_integrity(new.tenant_id, 'product', v_item_id);
  end loop;

  for v_item_id in
    select distinct pl.package_id
    from public.package_locations pl
    where pl.tenant_id = new.tenant_id
      and pl.location_id = new.id
      and pl.is_enabled = true
  loop
    perform public.validate_catalog_item_integrity(new.tenant_id, 'package', v_item_id);
  end loop;

  for v_item_id in
    select distinct vl.voucher_id
    from public.voucher_locations vl
    where vl.tenant_id = new.tenant_id
      and vl.location_id = new.id
      and vl.is_enabled = true
  loop
    perform public.validate_catalog_item_integrity(new.tenant_id, 'voucher', v_item_id);
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_validate_catalog_integrity_services on public.services;
create trigger trg_validate_catalog_integrity_services
after insert or update of price, status, deleted_at
on public.services
for each row
execute function public.trg_validate_catalog_integrity_item();

drop trigger if exists trg_validate_catalog_integrity_products on public.products;
create trigger trg_validate_catalog_integrity_products
after insert or update of price, status, deleted_at
on public.products
for each row
execute function public.trg_validate_catalog_integrity_item();

drop trigger if exists trg_validate_catalog_integrity_packages on public.packages;
create trigger trg_validate_catalog_integrity_packages
after insert or update of price, status, deleted_at
on public.packages
for each row
execute function public.trg_validate_catalog_integrity_item();

drop trigger if exists trg_validate_catalog_integrity_vouchers on public.vouchers;
create trigger trg_validate_catalog_integrity_vouchers
after insert or update of amount, status, deleted_at
on public.vouchers
for each row
execute function public.trg_validate_catalog_integrity_item();

drop trigger if exists trg_validate_catalog_integrity_service_locations on public.service_locations;
create trigger trg_validate_catalog_integrity_service_locations
after insert or update or delete
on public.service_locations
for each row
execute function public.trg_validate_catalog_integrity_mapping();

drop trigger if exists trg_validate_catalog_integrity_product_locations on public.product_locations;
create trigger trg_validate_catalog_integrity_product_locations
after insert or update or delete
on public.product_locations
for each row
execute function public.trg_validate_catalog_integrity_mapping();

drop trigger if exists trg_validate_catalog_integrity_package_locations on public.package_locations;
create trigger trg_validate_catalog_integrity_package_locations
after insert or update or delete
on public.package_locations
for each row
execute function public.trg_validate_catalog_integrity_mapping();

drop trigger if exists trg_validate_catalog_integrity_voucher_locations on public.voucher_locations;
create trigger trg_validate_catalog_integrity_voucher_locations
after insert or update or delete
on public.voucher_locations
for each row
execute function public.trg_validate_catalog_integrity_mapping();

drop trigger if exists trg_validate_catalog_integrity_location_change on public.locations;
create trigger trg_validate_catalog_integrity_location_change
after update of country, availability
on public.locations
for each row
execute function public.trg_validate_catalog_integrity_location_change();

