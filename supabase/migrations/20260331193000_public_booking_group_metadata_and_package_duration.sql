alter table public.appointments
  add column if not exists booking_reference text,
  add column if not exists booking_metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_appointments_booking_reference
  on public.appointments (booking_reference)
  where booking_reference is not null;

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
        'duration_minutes', coalesce(duration_summary.duration_minutes, 0),
        'service_ids', coalesce(duration_summary.service_ids, '[]'::jsonb),
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
  left join lateral (
    select
      coalesce(sum(s.duration_minutes * pi.quantity), 0) as duration_minutes,
      coalesce(jsonb_agg(distinct s.id) filter (where s.id is not null), '[]'::jsonb) as service_ids
    from public.package_items pi
    join public.services s on s.id = pi.service_id
    where pi.package_id = p.id
  ) duration_summary on true
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
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'name', c.name
      )
      order by c.name asc
    ),
    '[]'::jsonb
  )
  into v_categories
  from public.categories c
  where c.tenant_id = p_tenant_id;

  return jsonb_build_object(
    'services', v_services,
    'packages', v_packages,
    'products', v_products,
    'categories', v_categories
  );
end;
$$;
