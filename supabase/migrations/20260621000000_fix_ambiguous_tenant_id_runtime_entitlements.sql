-- get_tenant_runtime_entitlements declares `returns table (tenant_id uuid, ...)`.
-- In PL/pgSQL, RETURNS TABLE output columns become implicitly-declared variables
-- scoped across the whole function body. One query never qualified its locations
-- table, so `tenant_id` collided with the output variable of the same name:
--   "column reference \"tenant_id\" is ambiguous ... PL/pgSQL variable or table column"
-- This broke assert_tenant_can_add_staff (called by send-staff-invitation) for
-- every single invite, since it always calls get_tenant_runtime_entitlements first.

create or replace function public.get_tenant_runtime_entitlements(
  p_tenant_id uuid
)
returns table (
  tenant_id uuid,
  plan_slug text,
  used_locations integer,
  allowed_locations integer,
  used_staff integer,
  base_staff_limit integer,
  extra_staff_seats integer,
  allowed_staff integer,
  has_ecommerce_theme boolean,
  ecommerce_theme_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_plan_slug text;
  v_plan_id uuid;
  v_plan_max_locations integer := 1;
  v_plan_max_staff integer := 1;
  v_used_locations integer := 0;
  v_allowed_locations integer := 1;
  v_used_staff integer := 0;
  v_base_staff_limit integer := 1;
  v_extra_staff_seats integer := 0;
  v_allowed_staff integer := 1;
  v_theme_expiry timestamptz;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not (belongs_to_tenant(v_actor, p_tenant_id) or is_backoffice_user(v_actor)) then
    raise exception 'TENANT_ACCESS_DENIED';
  end if;

  select p.id, p.slug
  into v_plan_id, v_plan_slug
  from public.tenants t
  join public.plans p on lower(p.slug) = lower(t.plan::text)
  where t.id = p_tenant_id
  order by p.is_active desc nulls last, p.created_at desc nulls last
  limit 1;

  if v_plan_slug is null then
    raise exception 'TENANT_NOT_FOUND';
  end if;

  select coalesce(pl.max_locations, 1), coalesce(pl.max_staff, 1)
  into v_plan_max_locations, v_plan_max_staff
  from public.plan_limits pl
  where pl.plan_id = v_plan_id;

  select count(*)::integer
  into v_used_locations
  from public.locations l
  where l.tenant_id = p_tenant_id;

  if lower(v_plan_slug) = 'chain' then
    select coalesce(e.allowed_locations, greatest(v_plan_max_locations, 1))
    into v_allowed_locations
    from public.tenant_plan_entitlements e
    where e.tenant_id = p_tenant_id;

    v_allowed_locations := coalesce(v_allowed_locations, greatest(v_plan_max_locations, 1));
    v_base_staff_limit := greatest(coalesce(v_plan_max_staff, 12), 1) * greatest(v_used_locations, 1);
  else
    v_allowed_locations := greatest(v_plan_max_locations, 1);
    v_base_staff_limit := greatest(v_plan_max_staff, 1);
  end if;

  select count(distinct ur.user_id)::integer
  into v_used_staff
  from public.user_roles ur
  where ur.tenant_id = p_tenant_id
    and coalesce(ur.is_active, true) = true;

  select coalesce(sum(tae.quantity), 0)::integer
  into v_extra_staff_seats
  from public.tenant_addon_entitlements tae
  where tae.tenant_id = p_tenant_id
    and tae.addon_type = 'extra_seat'
    and tae.status = 'active'
    and (tae.ends_at is null or tae.ends_at > now());

  select max(tae.ends_at)
  into v_theme_expiry
  from public.tenant_addon_entitlements tae
  where tae.tenant_id = p_tenant_id
    and tae.addon_type = 'theme_ecommerce'
    and tae.status = 'active'
    and (tae.ends_at is null or tae.ends_at > now());

  v_allowed_staff := v_base_staff_limit + v_extra_staff_seats;

  return query
  select
    p_tenant_id,
    v_plan_slug,
    v_used_locations,
    v_allowed_locations,
    v_used_staff,
    v_base_staff_limit,
    v_extra_staff_seats,
    v_allowed_staff,
    v_theme_expiry is not null,
    v_theme_expiry;
end;
$$;
