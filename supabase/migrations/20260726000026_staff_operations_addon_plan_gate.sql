-- Staff Operations add-on was enable-able by any tenant with an active
-- subscription, regardless of plan tier. Product intent is Studio/Chain
-- only (Solo is just the owner + 1 other person, so per-location staff
-- check-ins/time-off doesn't apply). Gate activation server-side.
create or replace function public.activate_staff_operations_addon(
  p_tenant_id uuid,
  p_reason text default 'Enabled from Staff'
)
returns public.tenant_addon_entitlements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_country text;
  v_currency text;
  v_subscription_status text;
  v_plan text;
  v_pricing_id uuid;
  v_entitlement public.tenant_addon_entitlements;
begin
  if v_actor is null or not public.belongs_to_tenant(v_actor, p_tenant_id) then
    raise exception 'TENANT_ACCESS_DENIED';
  end if;

  if not exists (
    select 1
    from public.user_roles ur
    where ur.tenant_id = p_tenant_id
      and ur.user_id = v_actor
      and ur.role::text = 'owner'
      and coalesce(ur.is_active, true)
  ) then
    raise exception 'OWNER_REQUIRED';
  end if;

  select upper(coalesce(t.country, 'GH')),
         upper(coalesce(t.currency, 'GHS')),
         t.subscription_status::text,
         t.plan::text
  into v_country, v_currency, v_subscription_status, v_plan
  from public.tenants t
  where t.id = p_tenant_id;

  if v_subscription_status is distinct from 'active' then
    raise exception 'ACTIVE_SUBSCRIPTION_REQUIRED';
  end if;

  if lower(coalesce(v_plan, '')) not in ('studio', 'chain') then
    raise exception 'PLAN_NOT_ELIGIBLE';
  end if;

  select pricing.id
  into v_pricing_id
  from public.staff_operations_addon_pricing pricing
  where pricing.country_code = v_country
    and pricing.currency = v_currency
    and pricing.status = 'active'
    and pricing.effective_from <= now()
  order by pricing.effective_from desc
  limit 1;

  if v_pricing_id is null then
    raise exception 'STAFF_OPERATIONS_PRICE_NOT_CONFIGURED';
  end if;

  select *
  into v_entitlement
  from public.tenant_addon_entitlements entitlement
  where entitlement.tenant_id = p_tenant_id
    and entitlement.addon_type = 'staff_operations'
    and entitlement.status = 'active'
  limit 1;

  if v_entitlement.id is not null then
    return v_entitlement;
  end if;

  insert into public.tenant_addon_entitlements (
    tenant_id,
    addon_type,
    addon_key,
    quantity,
    billing_interval,
    status,
    pricing_id,
    source,
    reason,
    created_by
  )
  values (
    p_tenant_id,
    'staff_operations',
    'checkins_time_off',
    1,
    'monthly',
    'active',
    v_pricing_id,
    'salon_admin',
    nullif(trim(p_reason), ''),
    v_actor
  )
  returning * into v_entitlement;

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
    'staff_operations_addon_enabled',
    'tenant_addon_entitlement',
    v_entitlement.id,
    jsonb_build_object('pricing_id', v_pricing_id, 'billing_interval', 'monthly')
  );

  return v_entitlement;
end;
$$;

grant execute on function public.activate_staff_operations_addon(uuid, text) to authenticated;

-- Tenants that somehow already have this active on a Solo plan (e.g. a
-- since-downgraded tenant) keep their entitlement — this gate only blocks
-- new activations. If we later want to auto-revoke on downgrade, that's a
-- separate, explicit decision.
