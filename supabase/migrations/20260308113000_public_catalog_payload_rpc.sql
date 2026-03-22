create or replace function public.normalize_country_code(value text)
returns text
language sql
immutable
as $$
  select case upper(regexp_replace(coalesce(value, ''), '[^A-Za-z]', '', 'g'))
    when 'GH' then 'GH'
    when 'GHANA' then 'GH'
    when 'NG' then 'NG'
    when 'NIGERIA' then 'NG'
    when 'US' then 'US'
    when 'UNITEDSTATES' then 'US'
    when 'UNITEDSTATESOFAMERICA' then 'US'
    when 'GB' then 'GB'
    when 'UNITEDKINGDOM' then 'GB'
    when 'KE' then 'KE'
    when 'KENYA' then 'KE'
    when 'ZA' then 'ZA'
    when 'SOUTHAFRICA' then 'ZA'
    else upper(trim(coalesce(value, '')))
  end;
$$;

create or replace function public.get_public_catalog_payload(
  p_tenant_id uuid,
  p_mode text default 'legacy',
  p_country_code text default null,
  p_location_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_chain_mode boolean := lower(coalesce(p_mode, 'legacy')) = 'chain_country_scoped';
  v_country_code text := public.normalize_country_code(p_country_code);
  v_services jsonb := '[]'::jsonb;
  v_packages jsonb := '[]'::jsonb;
  v_products jsonb := '[]'::jsonb;
  v_categories jsonb := '[]'::jsonb;
begin
  if p_tenant_id is null then
    return jsonb_build_object(
      'services', '[]'::jsonb,
      'packages', '[]'::jsonb,
      'products', '[]'::jsonb,
      'categories', '[]'::jsonb
    );
  end if;

  with open_locations as (
    select
      l.id,
      l.name,
      l.city,
      public.normalize_country_code(l.country) as country_code
    from public.locations l
    where l.tenant_id = p_tenant_id
      and (l.availability is null or l.availability = 'open')
      and (
        not v_is_chain_mode
        or v_country_code is null
        or public.normalize_country_code(l.country) = v_country_code
      )
      and (
        p_location_ids is null
        or cardinality(p_location_ids) = 0
        or l.id = any(p_location_ids)
      )
  ),
  all_open as (
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'id', ol.id,
        'name', ol.name,
        'city', ol.city,
        'country_code', ol.country_code
      )), '[]'::jsonb) as branches,
      coalesce(array_agg(ol.id), '{}'::uuid[]) as location_ids
    from open_locations ol
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'description', s.description,
        'price', s.price,
        'duration_minutes', s.duration_minutes,
        'image_urls', s.image_urls,
        'category_id', s.category_id,
        'deposit_required', s.deposit_required,
        'deposit_amount', s.deposit_amount,
        'deposit_percentage', s.deposit_percentage,
        'location_ids',
          case
            when not v_is_chain_mode and coalesce(mapping.mapped_count, 0) = 0 then ao.location_ids
            else coalesce(mapping.location_ids, '{}'::uuid[])
          end,
        'branches',
          case
            when not v_is_chain_mode and coalesce(mapping.mapped_count, 0) = 0 then ao.branches
            else coalesce(mapping.branches, '[]'::jsonb)
          end
      )
      order by s.name asc
    ),
    '[]'::jsonb
  )
  into v_services
  from public.services s
  cross join all_open ao
  left join lateral (
    select
      count(distinct ol.id) as mapped_count,
      coalesce(array_agg(distinct ol.id), '{}'::uuid[]) as location_ids,
      coalesce(jsonb_agg(distinct jsonb_build_object(
        'id', ol.id,
        'name', ol.name,
        'city', ol.city,
        'country_code', ol.country_code
      )), '[]'::jsonb) as branches
    from public.service_locations sl
    join open_locations ol on ol.id = sl.location_id
    where sl.tenant_id = p_tenant_id
      and sl.service_id = s.id
      and sl.is_enabled = true
  ) mapping on true
  where s.tenant_id = p_tenant_id
    and s.status = 'active'
    and s.deleted_at is null
    and (
      (v_is_chain_mode and coalesce(mapping.mapped_count, 0) > 0)
      or (not v_is_chain_mode and (coalesce(mapping.mapped_count, 0) > 0 or jsonb_array_length(ao.branches) > 0))
    );

  with open_locations as (
    select
      l.id,
      l.name,
      l.city,
      public.normalize_country_code(l.country) as country_code
    from public.locations l
    where l.tenant_id = p_tenant_id
      and (l.availability is null or l.availability = 'open')
      and (
        not v_is_chain_mode
        or v_country_code is null
        or public.normalize_country_code(l.country) = v_country_code
      )
      and (
        p_location_ids is null
        or cardinality(p_location_ids) = 0
        or l.id = any(p_location_ids)
      )
  ),
  all_open as (
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'id', ol.id,
        'name', ol.name,
        'city', ol.city,
        'country_code', ol.country_code
      )), '[]'::jsonb) as branches,
      coalesce(array_agg(ol.id), '{}'::uuid[]) as location_ids
    from open_locations ol
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'description', p.description,
        'price', p.price,
        'original_price', p.original_price,
        'image_urls', p.image_urls,
        'location_ids',
          case
            when not v_is_chain_mode and coalesce(mapping.mapped_count, 0) = 0 then ao.location_ids
            else coalesce(mapping.location_ids, '{}'::uuid[])
          end,
        'branches',
          case
            when not v_is_chain_mode and coalesce(mapping.mapped_count, 0) = 0 then ao.branches
            else coalesce(mapping.branches, '[]'::jsonb)
          end
      )
      order by p.name asc
    ),
    '[]'::jsonb
  )
  into v_packages
  from public.packages p
  cross join all_open ao
  left join lateral (
    select
      count(distinct ol.id) as mapped_count,
      coalesce(array_agg(distinct ol.id), '{}'::uuid[]) as location_ids,
      coalesce(jsonb_agg(distinct jsonb_build_object(
        'id', ol.id,
        'name', ol.name,
        'city', ol.city,
        'country_code', ol.country_code
      )), '[]'::jsonb) as branches
    from public.package_locations pl
    join open_locations ol on ol.id = pl.location_id
    where pl.tenant_id = p_tenant_id
      and pl.package_id = p.id
      and pl.is_enabled = true
  ) mapping on true
  where p.tenant_id = p_tenant_id
    and p.status = 'active'
    and p.deleted_at is null
    and (
      (v_is_chain_mode and coalesce(mapping.mapped_count, 0) > 0)
      or (not v_is_chain_mode and (coalesce(mapping.mapped_count, 0) > 0 or jsonb_array_length(ao.branches) > 0))
    );

  with open_locations as (
    select
      l.id,
      l.name,
      l.city,
      public.normalize_country_code(l.country) as country_code
    from public.locations l
    where l.tenant_id = p_tenant_id
      and (l.availability is null or l.availability = 'open')
      and (
        not v_is_chain_mode
        or v_country_code is null
        or public.normalize_country_code(l.country) = v_country_code
      )
      and (
        p_location_ids is null
        or cardinality(p_location_ids) = 0
        or l.id = any(p_location_ids)
      )
  ),
  all_open as (
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'id', ol.id,
        'name', ol.name,
        'city', ol.city,
        'country_code', ol.country_code
      )), '[]'::jsonb) as branches,
      coalesce(array_agg(ol.id), '{}'::uuid[]) as location_ids
    from open_locations ol
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'description', p.description,
        'price', p.price,
        'image_urls', p.image_urls,
        'stock_quantity', p.stock_quantity,
        'location_ids',
          case
            when not v_is_chain_mode and coalesce(mapping.mapped_count, 0) = 0 then ao.location_ids
            else coalesce(mapping.location_ids, '{}'::uuid[])
          end,
        'branches',
          case
            when not v_is_chain_mode and coalesce(mapping.mapped_count, 0) = 0 then ao.branches
            else coalesce(mapping.branches, '[]'::jsonb)
          end
      )
      order by p.name asc
    ),
    '[]'::jsonb
  )
  into v_products
  from public.products p
  cross join all_open ao
  left join lateral (
    select
      count(distinct ol.id) as mapped_count,
      coalesce(array_agg(distinct ol.id), '{}'::uuid[]) as location_ids,
      coalesce(jsonb_agg(distinct jsonb_build_object(
        'id', ol.id,
        'name', ol.name,
        'city', ol.city,
        'country_code', ol.country_code
      )), '[]'::jsonb) as branches
    from public.product_locations pl
    join open_locations ol on ol.id = pl.location_id
    where pl.tenant_id = p_tenant_id
      and pl.product_id = p.id
      and pl.is_enabled = true
  ) mapping on true
  where p.tenant_id = p_tenant_id
    and p.status = 'active'
    and p.deleted_at is null
    and (
      (v_is_chain_mode and coalesce(mapping.mapped_count, 0) > 0)
      or (not v_is_chain_mode and (coalesce(mapping.mapped_count, 0) > 0 or jsonb_array_length(ao.branches) > 0))
    );

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'description', c.description,
      'sort_order', c.sort_order
    ) order by c.sort_order asc),
    '[]'::jsonb
  )
  into v_categories
  from public.service_categories c
  where c.tenant_id = p_tenant_id;

  return jsonb_build_object(
    'services', coalesce(v_services, '[]'::jsonb),
    'packages', coalesce(v_packages, '[]'::jsonb),
    'products', coalesce(v_products, '[]'::jsonb),
    'categories', coalesce(v_categories, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_public_catalog_payload(uuid, text, text, uuid[]) to anon, authenticated;
