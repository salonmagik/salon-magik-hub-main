-- Staff Operations was billed by folding its price into the tenant's
-- recurring subscription total (compute_current_addon_total /
-- compute_tenant_recurring_total), and activate_staff_operations_addon
-- granted the entitlement immediately with no charge at all — the RPC just
-- flips the entitlement on and trusts the next subscription renewal to
-- collect payment. Two problems with that: enabling it gives up to a full
-- billing cycle of free access, and an owner who cancels the subscription
-- before that renewal never pays for the period they used.
--
-- This makes it a standalone, fixed-term purchase instead (same pattern as
-- purchase_tenant_theme_addon_and_log_billing / theme_ecommerce): pay for a
-- location-priced 30-day term up front, renew manually as it approaches
-- expiry. It no longer contributes to compute_current_addon_total, so it's
-- no longer charged via process-recurring-addon-billing.

alter table public.tenant_addon_quotes
  drop constraint if exists tenant_addon_quotes_addon_type_check;

alter table public.tenant_addon_quotes
  add constraint tenant_addon_quotes_addon_type_check
  check (addon_type in ('extra_location', 'extra_seat', 'theme_ecommerce', 'plan_upgrade', 'staff_operations'));

create or replace function public.purchase_tenant_staff_operations_addon_and_log_billing(
  p_tenant_id uuid,
  p_source text default 'settings_addons',
  p_reason text default 'Tenant purchased a 30-day Staff Operations term.'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_currency text;
  v_country text;
  v_subscription_status text;
  v_unit_price numeric := 0;
  v_location_count integer := 0;
  v_total_price numeric := 0;
  v_entitlement_id uuid;
  v_ends_at timestamptz := now() + interval '30 days';
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not (public.is_tenant_owner(v_actor, p_tenant_id) or has_backoffice_role(v_actor, 'super_admin'::public.backoffice_role)) then
    raise exception 'STAFF_OPERATIONS_PURCHASE_FORBIDDEN';
  end if;

  select t.subscription_status::text, upper(coalesce(t.currency, 'GHS')), upper(coalesce(t.country, 'GH'))
  into v_subscription_status, v_currency, v_country
  from public.tenants t
  where t.id = p_tenant_id;

  if v_subscription_status is distinct from 'active' then
    raise exception 'SUBSCRIPTION_NOT_ACTIVE';
  end if;

  select count(*)::integer
  into v_location_count
  from public.locations
  where tenant_id = p_tenant_id
    and coalesce(is_paused, false) = false;
  v_location_count := greatest(v_location_count, 1);

  select pricing.unit_price_per_location
  into v_unit_price
  from public.staff_operations_addon_pricing pricing
  where pricing.country_code = v_country
    and pricing.currency = v_currency
    and pricing.status = 'active'
    and pricing.effective_from <= now()
  order by pricing.effective_from desc
  limit 1;

  if v_unit_price is null then
    raise exception 'STAFF_OPERATIONS_PRICE_NOT_CONFIGURED';
  end if;

  v_total_price := v_unit_price * v_location_count;
  if v_total_price <= 0 then
    raise exception 'INVALID_STAFF_OPERATIONS_PRICE';
  end if;

  update public.tenant_addon_entitlements
  set status = 'expired', ends_at = now(), updated_at = now()
  where tenant_id = p_tenant_id
    and addon_type = 'staff_operations'
    and status = 'active';

  insert into public.tenant_addon_entitlements (
    tenant_id,
    addon_type,
    addon_key,
    quantity,
    billing_interval,
    status,
    source,
    reason,
    started_at,
    ends_at,
    created_by
  )
  values (
    p_tenant_id,
    'staff_operations',
    'checkins_time_off',
    v_location_count,
    'monthly',
    'active',
    p_source,
    p_reason,
    now(),
    v_ends_at,
    v_actor
  )
  returning id into v_entitlement_id;

  insert into public.tenant_addon_quotes (
    tenant_id,
    country_code,
    currency,
    included_locations,
    active_locations,
    extra_locations,
    unit_price_per_extra_location,
    monthly_addon_total,
    snapshot,
    accepted_by,
    accepted_at,
    addon_type,
    addon_key,
    quantity,
    billing_interval,
    unit_price,
    total_price,
    status
  )
  values (
    p_tenant_id,
    v_country,
    v_currency,
    v_location_count,
    v_location_count,
    0,
    0,
    v_total_price,
    jsonb_build_object(
      'reason', p_reason,
      'source', p_source,
      'entitlement_id', v_entitlement_id,
      'location_count', v_location_count
    ),
    v_actor,
    now(),
    'staff_operations',
    'checkins_time_off',
    v_location_count,
    'monthly',
    v_unit_price,
    v_total_price,
    'active'
  );

  insert into public.audit_logs (
    tenant_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_tenant_id,
    v_actor,
    'staff_operations_addon_purchased',
    'tenant_addon_entitlement',
    v_entitlement_id,
    jsonb_build_object(
      'unit_price', v_unit_price,
      'location_count', v_location_count,
      'total_price', v_total_price,
      'billing_interval', 'monthly',
      'expires_at', v_ends_at,
      'source', p_source,
      'reason', p_reason
    )
  );

  return jsonb_build_object(
    'success', true,
    'expires_at', v_ends_at,
    'unit_price', v_unit_price,
    'location_count', v_location_count,
    'total_price', v_total_price,
    'currency', v_currency
  );
end;
$$;

grant execute on function public.purchase_tenant_staff_operations_addon_and_log_billing(uuid, text, text) to authenticated;

-- No longer folded into the subscription's recurring total (see comment
-- above) — still computed and reported in the breakdown for transparency,
-- just not added into the summed addon_total that gets charged.
create or replace function public.compute_current_addon_total(
  p_tenant_id uuid
)
returns table (
  addon_total numeric,
  currency text,
  breakdown jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_slug text;
  v_currency text;
  v_chain_plan_id uuid;
  v_current_allowed_locations integer;
  v_current_extra_seats integer;
  v_seat_unit_price numeric := 0;
  v_country text;
  v_location_count integer := 0;
  v_location_addon_price numeric := 0;
  v_staff_operations_unit_price numeric := 0;
  v_staff_operations_total numeric := 0;
  v_has_staff_operations boolean := false;
  v_staff_operations_ends_at timestamptz;
  v_chain_quote_current record;
  v_chain_quote_base record;
begin
  select t.plan::text, upper(coalesce(t.currency, 'USD')), upper(coalesce(t.country, 'US'))
  into v_plan_slug, v_currency, v_country
  from public.tenants t
  where t.id = p_tenant_id;

  if v_plan_slug is null then
    raise exception 'TENANT_NOT_FOUND';
  end if;

  select count(*)::integer
  into v_location_count
  from public.locations
  where tenant_id = p_tenant_id
    and coalesce(is_paused, false) = false;

  select coalesce(sum(tae.quantity), 0)::integer
  into v_current_extra_seats
  from public.tenant_addon_entitlements tae
  where tae.tenant_id = p_tenant_id
    and tae.addon_type = 'extra_seat'
    and tae.status = 'active'
    and (tae.ends_at is null or tae.ends_at > now());

  select sap.unit_price_per_extra_seat
  into v_seat_unit_price
  from public.staff_addon_pricing sap
  where sap.country_code = v_country
    and sap.currency = v_currency
    and sap.status = 'active'
    and sap.effective_from <= now()
  order by sap.effective_from desc
  limit 1;
  v_seat_unit_price := coalesce(v_seat_unit_price, 0);

  select tae.ends_at
  into v_staff_operations_ends_at
  from public.tenant_addon_entitlements tae
  where tae.tenant_id = p_tenant_id
    and tae.addon_type = 'staff_operations'
    and tae.status = 'active'
    and (tae.ends_at is null or tae.ends_at > now())
  limit 1;
  v_has_staff_operations := v_staff_operations_ends_at is not null;

  if v_has_staff_operations then
    select pricing.unit_price_per_location
    into v_staff_operations_unit_price
    from public.staff_operations_addon_pricing pricing
    where pricing.country_code = v_country
      and pricing.currency = v_currency
      and pricing.status = 'active'
      and pricing.effective_from <= now()
    order by pricing.effective_from desc
    limit 1;
    v_staff_operations_unit_price := coalesce(v_staff_operations_unit_price, 0);
    v_staff_operations_total :=
      greatest(v_location_count, 1) * v_staff_operations_unit_price;
  end if;

  if lower(v_plan_slug) = 'chain' then
    select e.allowed_locations into v_current_allowed_locations
    from public.tenant_plan_entitlements e
    where e.tenant_id = p_tenant_id;
    v_current_allowed_locations := coalesce(v_current_allowed_locations, 1);

    select p.id into v_chain_plan_id
    from public.plans p
    where lower(p.slug) = 'chain'
    order by p.is_active desc nulls last, p.created_at desc nulls last
    limit 1;

    select * into v_chain_quote_current
    from public.compute_chain_price(v_chain_plan_id, v_currency, greatest(v_current_allowed_locations, 1))
    limit 1;

    select * into v_chain_quote_base
    from public.compute_chain_price(v_chain_plan_id, v_currency, 1)
    limit 1;

    v_location_addon_price :=
      greatest(coalesce(v_chain_quote_current.total_price, 0) - coalesce(v_chain_quote_base.total_price, 0), 0);
  end if;

  return query
  select
    v_location_addon_price
      + (v_current_extra_seats * v_seat_unit_price),
    v_currency,
    jsonb_build_object(
      'extra_seats', v_current_extra_seats,
      'seat_unit_price', v_seat_unit_price,
      'seat_addon_total', v_current_extra_seats * v_seat_unit_price,
      'location_addon_total', v_location_addon_price,
      'staff_operations_enabled', v_has_staff_operations,
      'staff_operations_locations', greatest(v_location_count, 1),
      'staff_operations_unit_price', v_staff_operations_unit_price,
      'staff_operations_total', v_staff_operations_total,
      'staff_operations_ends_at', v_staff_operations_ends_at,
      'staff_operations_billed_standalone', true
    );
end;
$$;

grant execute on function public.compute_current_addon_total(uuid) to authenticated;
grant execute on function public.compute_current_addon_total(uuid) to service_role;
