-- Theme purchases are an ongoing annual charge. Gating this only in the
-- edge function isn't real enforcement — the RPC is granted to `authenticated`
-- and callable directly via the REST API, bypassing that check entirely.
-- A trialing tenant hasn't committed to paying for the base plan yet, so
-- block starting a second bill before that happens.
create or replace function public.purchase_tenant_theme_addon_and_log_billing(
  p_tenant_id uuid,
  p_theme_key text default 'ecommerce',
  p_source text default 'settings_subscription',
  p_reason text default 'Tenant purchased annual storefront theme.'
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
  v_entitlement_id uuid;
  v_theme_key text := lower(coalesce(nullif(btrim(p_theme_key), ''), 'ecommerce'));
  v_ends_at timestamptz := now() + interval '1 year';
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not (public.is_tenant_owner(v_actor, p_tenant_id) or has_backoffice_role(v_actor, 'super_admin'::public.backoffice_role)) then
    raise exception 'THEME_PURCHASE_FORBIDDEN';
  end if;

  select t.subscription_status::text, t.currency, t.country
  into v_subscription_status, v_currency, v_country
  from public.tenants t
  where t.id = p_tenant_id;

  if v_subscription_status is distinct from 'active' then
    raise exception 'SUBSCRIPTION_NOT_ACTIVE';
  end if;

  if not exists (
    select 1
    from public.theme_catalog tc
    where lower(tc.theme_key) = v_theme_key
      and tc.is_active = true
  ) then
    raise exception 'THEME_NOT_FOUND';
  end if;

  select tap.unit_price
  into v_unit_price
  from public.theme_addon_pricing tap
  where lower(tap.theme_key) = v_theme_key
    and upper(tap.country_code) = upper(coalesce(v_country, 'US'))
    and upper(tap.currency) = upper(coalesce(v_currency, 'USD'))
    and tap.status = 'active'
    and tap.effective_from <= now()
  order by tap.effective_from desc, tap.created_at desc
  limit 1;

  v_unit_price := coalesce(v_unit_price, 0);

  update public.tenant_addon_entitlements
  set status = 'expired', ends_at = now(), updated_at = now()
  where tenant_id = p_tenant_id
    and addon_type = 'theme_ecommerce'
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
    'theme_ecommerce',
    v_theme_key,
    1,
    'annual',
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
    upper(coalesce(v_country, 'US')),
    upper(coalesce(v_currency, 'USD')),
    1,
    1,
    0,
    0,
    v_unit_price,
    jsonb_build_object(
      'reason', p_reason,
      'source', p_source,
      'theme_key', v_theme_key,
      'entitlement_id', v_entitlement_id
    ),
    v_actor,
    now(),
    'theme_ecommerce',
    v_theme_key,
    1,
    'annual',
    v_unit_price,
    v_unit_price,
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
    'tenant_theme_purchased',
    'tenant_addon_entitlement',
    v_entitlement_id,
    jsonb_build_object(
      'theme_key', v_theme_key,
      'unit_price', v_unit_price,
      'billing_interval', 'annual',
      'expires_at', v_ends_at,
      'source', p_source,
      'reason', p_reason
    )
  );

  return jsonb_build_object(
    'success', true,
    'theme_key', v_theme_key,
    'expires_at', v_ends_at,
    'unit_price', v_unit_price
  );
end;
$$;

grant execute on function public.purchase_tenant_theme_addon_and_log_billing(uuid, text, text, text) to authenticated;
