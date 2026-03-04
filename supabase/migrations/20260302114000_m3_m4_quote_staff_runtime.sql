-- M3/M4 runtime helpers and public-booking view extension

begin;

-- Expose staff selection toggles to public booking app.
create or replace view public.public_booking_tenants
with (security_invoker = off)
as
select
  id,
  name,
  slug,
  logo_url,
  banner_urls,
  brand_color,
  currency,
  timezone,
  country,
  online_booking_enabled,
  auto_confirm_bookings,
  deposits_enabled,
  default_deposit_percentage,
  cancellation_grace_hours,
  booking_status_message,
  slot_capacity_default,
  pay_at_salon_enabled,
  allow_staff_selection,
  require_staff_selection,
  auto_assign_staff
from public.tenants
where online_booking_enabled = true
  and slug is not null;

grant select on public.public_booking_tenants to anon, authenticated;

create or replace function public.create_tenant_addon_quote_snapshot(
  p_tenant_id uuid,
  p_country_code text default null,
  p_currency text default null,
  p_included_locations integer default null,
  p_active_locations integer default null,
  p_extra_locations integer default null,
  p_unit_price_per_extra_location numeric default null,
  p_monthly_addon_total numeric default null,
  p_pricing_id uuid default null,
  p_snapshot jsonb default '{}'::jsonb,
  p_mark_accepted boolean default false
)
returns public.tenant_addon_quotes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_country_code text;
  v_currency text;
  v_included_locations integer;
  v_active_locations integer;
  v_extra_locations integer;
  v_unit_price numeric;
  v_monthly_total numeric;
  v_pricing_id uuid;
  v_quote public.tenant_addon_quotes;
begin
  if v_actor_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not belongs_to_tenant(v_actor_user_id, p_tenant_id)
     and not has_backoffice_role(v_actor_user_id, 'super_admin'::public.backoffice_role) then
    raise exception 'TENANT_QUOTE_FORBIDDEN';
  end if;

  select country, currency
  into v_country_code, v_currency
  from public.tenants
  where id = p_tenant_id;

  if v_country_code is null then
    raise exception 'TENANT_NOT_FOUND';
  end if;

  v_country_code := upper(coalesce(nullif(btrim(p_country_code), ''), v_country_code));
  v_currency := upper(coalesce(nullif(btrim(p_currency), ''), v_currency));

  if p_pricing_id is not null then
    v_pricing_id := p_pricing_id;
  else
    select id
    into v_pricing_id
    from public.chain_addon_pricing
    where upper(country_code) = v_country_code
      and upper(currency) = v_currency
      and status = 'active'
      and effective_from <= now()
    order by effective_from desc, created_at desc
    limit 1;
  end if;

  if v_pricing_id is not null then
    select unit_price_per_extra_location
    into v_unit_price
    from public.chain_addon_pricing
    where id = v_pricing_id;
  end if;

  v_included_locations := greatest(1, coalesce(p_included_locations, 1));

  if p_active_locations is not null then
    v_active_locations := greatest(1, p_active_locations);
  else
    select greatest(1, count(*))
    into v_active_locations
    from public.locations
    where tenant_id = p_tenant_id
      and availability = 'open';
  end if;

  v_extra_locations := coalesce(p_extra_locations, greatest(0, v_active_locations - v_included_locations));
  v_unit_price := coalesce(p_unit_price_per_extra_location, coalesce(v_unit_price, 0));
  v_monthly_total := coalesce(p_monthly_addon_total, v_extra_locations * v_unit_price);

  insert into public.tenant_addon_quotes (
    tenant_id,
    country_code,
    currency,
    included_locations,
    active_locations,
    extra_locations,
    unit_price_per_extra_location,
    monthly_addon_total,
    pricing_id,
    snapshot,
    accepted_by,
    accepted_at
  )
  values (
    p_tenant_id,
    v_country_code,
    v_currency,
    v_included_locations,
    v_active_locations,
    v_extra_locations,
    v_unit_price,
    v_monthly_total,
    v_pricing_id,
    coalesce(p_snapshot, '{}'::jsonb),
    case when p_mark_accepted then v_actor_user_id else null end,
    case when p_mark_accepted then now() else null end
  )
  returning * into v_quote;

  return v_quote;
end;
$$;

grant execute on function public.create_tenant_addon_quote_snapshot(
  uuid,
  text,
  text,
  integer,
  integer,
  integer,
  numeric,
  numeric,
  uuid,
  jsonb,
  boolean
) to authenticated;

create or replace function public.list_public_booking_eligible_staff(
  p_tenant_id uuid,
  p_location_id uuid,
  p_service_ids uuid[] default null
)
returns table (
  user_id uuid,
  full_name text,
  role public.app_role
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service_ids uuid[] := coalesce(p_service_ids, '{}'::uuid[]);
  v_mapping_exists boolean := false;
begin
  if p_tenant_id is null or p_location_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.tenants t
    where t.id = p_tenant_id
      and t.online_booking_enabled = true
  ) then
    return;
  end if;

  if array_length(v_service_ids, 1) is not null then
    select exists (
      select 1
      from public.staff_location_services sls
      where sls.tenant_id = p_tenant_id
        and sls.location_id = p_location_id
        and sls.is_enabled = true
        and sls.service_id = any(v_service_ids)
      union all
      select 1
      from public.staff_services ss
      where ss.tenant_id = p_tenant_id
        and (ss.location_id is null or ss.location_id = p_location_id)
        and ss.is_enabled = true
        and ss.service_id = any(v_service_ids)
      union all
      select 1
      from public.staff_service_categories ssc
      join public.services s on s.id = any(v_service_ids) and s.category_id = ssc.category_id
      where ssc.tenant_id = p_tenant_id
        and (ssc.location_id is null or ssc.location_id = p_location_id)
        and ssc.is_enabled = true
    ) into v_mapping_exists;
  end if;

  return query
  with base_staff as (
    select distinct
      ur.user_id,
      coalesce(p.full_name, 'Team Member')::text as full_name,
      ur.role
    from public.user_roles ur
    join public.staff_locations sl
      on sl.tenant_id = ur.tenant_id
      and sl.user_id = ur.user_id
      and sl.location_id = p_location_id
    left join public.profiles p on p.user_id = ur.user_id
    where ur.tenant_id = p_tenant_id
      and ur.is_active = true
      and ur.role in ('manager'::public.app_role, 'supervisor'::public.app_role, 'staff'::public.app_role)
  ), mapped_staff as (
    select distinct sls.staff_user_id as user_id
    from public.staff_location_services sls
    where sls.tenant_id = p_tenant_id
      and sls.location_id = p_location_id
      and sls.is_enabled = true
      and (array_length(v_service_ids, 1) is null or sls.service_id = any(v_service_ids))

    union

    select distinct ss.staff_user_id as user_id
    from public.staff_services ss
    where ss.tenant_id = p_tenant_id
      and (ss.location_id is null or ss.location_id = p_location_id)
      and ss.is_enabled = true
      and (array_length(v_service_ids, 1) is null or ss.service_id = any(v_service_ids))

    union

    select distinct ssc.staff_user_id as user_id
    from public.staff_service_categories ssc
    join public.services s
      on s.tenant_id = p_tenant_id
      and s.category_id = ssc.category_id
      and (array_length(v_service_ids, 1) is null or s.id = any(v_service_ids))
    where ssc.tenant_id = p_tenant_id
      and (ssc.location_id is null or ssc.location_id = p_location_id)
      and ssc.is_enabled = true
  )
  select
    b.user_id,
    b.full_name,
    b.role
  from base_staff b
  where (not v_mapping_exists)
     or b.user_id in (select m.user_id from mapped_staff m)
  order by
    case b.role
      when 'manager' then 1
      when 'supervisor' then 2
      when 'staff' then 3
      else 4
    end,
    b.full_name;
end;
$$;

grant execute on function public.list_public_booking_eligible_staff(uuid, uuid, uuid[]) to anon, authenticated;

commit;
