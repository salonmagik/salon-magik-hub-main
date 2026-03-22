-- Partial branch mapping is valid for multi-country chain catalogs.
-- Keep blocking integrity checks but stop emitting PARTIAL_LOCATION_MAPPING warnings.

create or replace function public.validate_catalog_item_integrity(
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

update public.catalog_item_integrity_issues
set resolved_at = now()
where issue_code = 'PARTIAL_LOCATION_MAPPING'
  and resolved_at is null;
