-- Chain entitlement expansion and dynamic 11+ custom handling.

create table if not exists public.tenant_location_overage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  locations_before integer not null,
  locations_after integer not null,
  added_count integer not null,
  currency text not null,
  unit_price numeric,
  subtotal numeric,
  billing_effective_at timestamptz not null,
  status text not null default 'pending',
  source text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint tenant_location_overage_events_counts_check check (
    locations_before >= 0
    and locations_after >= locations_before
    and added_count = locations_after - locations_before
    and added_count >= 1
  ),
  constraint tenant_location_overage_events_status_check check (
    status in ('pending', 'invoiced', 'waived')
  )
);

create index if not exists idx_tenant_location_overage_events_tenant_created_at
  on public.tenant_location_overage_events (tenant_id, created_at desc);

alter table public.tenant_location_overage_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tenant_location_overage_events'
      and policyname = 'Tenant members can read own overage events'
  ) then
    create policy "Tenant members can read own overage events"
      on public.tenant_location_overage_events
      for select
      to authenticated
      using (belongs_to_tenant(auth.uid(), tenant_id));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tenant_location_overage_events'
      and policyname = 'BackOffice users can read all overage events'
  ) then
    create policy "BackOffice users can read all overage events"
      on public.tenant_location_overage_events
      for select
      to authenticated
      using (is_backoffice_user(auth.uid()));
  end if;
end $$;

create or replace function public.expand_chain_entitlement_and_log_billing(
  p_tenant_id uuid,
  p_new_allowed_locations integer,
  p_source text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_plan_id uuid;
  v_plan_slug text;
  v_currency text;
  v_trial_ends_at timestamptz;
  v_subscription_status text;
  v_period_end timestamptz;
  v_effective_at timestamptz;
  v_current_allowed integer;
  v_added_count integer;
  v_is_super_admin boolean;
  v_is_tenant_member boolean;
  v_quote_before record;
  v_quote_after record;
  v_requires_custom boolean;
  v_unit_price numeric;
  v_subtotal numeric;
begin
  if v_actor_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_new_allowed_locations < 1 then
    raise exception 'ALLOWED_LOCATIONS_INVALID';
  end if;

  v_is_super_admin := has_backoffice_role(v_actor_user_id, 'super_admin'::backoffice_role);
  v_is_tenant_member := belongs_to_tenant(v_actor_user_id, p_tenant_id);

  if not v_is_super_admin and not v_is_tenant_member then
    raise exception 'ENTITLEMENT_WRITE_FORBIDDEN';
  end if;

  select p.id, p.slug, t.currency, t.trial_ends_at, t.subscription_status::text
  into v_plan_id, v_plan_slug, v_currency, v_trial_ends_at, v_subscription_status
  from public.tenants t
  left join public.plans p on lower(p.slug) = lower(t.plan::text)
  where t.id = p_tenant_id
  order by p.is_active desc nulls last, p.created_at desc nulls last
  limit 1;

  if v_plan_id is null or v_plan_slug is null then
    raise exception 'PLAN_NOT_FOUND';
  end if;

  if lower(v_plan_slug) <> 'chain' then
    raise exception 'CHAIN_PLAN_REQUIRED';
  end if;

  select coalesce(e.allowed_locations, 1)
  into v_current_allowed
  from public.tenant_plan_entitlements e
  where e.tenant_id = p_tenant_id;

  if v_current_allowed is null then
    v_current_allowed := 1;
  end if;

  if p_new_allowed_locations <= v_current_allowed then
    return jsonb_build_object(
      'success', true,
      'tenant_id', p_tenant_id,
      'allowed_locations', v_current_allowed,
      'added_count', 0
    );
  end if;

  select * into v_quote_before
  from public.compute_chain_price(v_plan_id, v_currency, v_current_allowed)
  limit 1;

  select * into v_quote_after
  from public.compute_chain_price(v_plan_id, v_currency, p_new_allowed_locations)
  limit 1;

  v_requires_custom := coalesce(v_quote_after.requires_custom, true);
  if v_requires_custom then
    raise exception 'CHAIN_TIER_CUSTOM_REQUIRED';
  end if;

  v_added_count := p_new_allowed_locations - v_current_allowed;
  v_subtotal := coalesce(v_quote_after.total_price, 0) - coalesce(v_quote_before.total_price, 0);
  if v_subtotal < 0 then
    v_subtotal := 0;
  end if;
  v_unit_price := case when v_added_count > 0 then round(v_subtotal / v_added_count, 2) else 0 end;

  select s.current_period_end
  into v_period_end
  from public.subscriptions s
  where s.tenant_id = p_tenant_id
  order by s.created_at desc
  limit 1;

  if v_subscription_status = 'trialing' and v_trial_ends_at is not null then
    v_effective_at := v_trial_ends_at;
  else
    v_effective_at := coalesce(v_period_end, now());
  end if;

  insert into public.tenant_plan_entitlements (
    tenant_id,
    plan_id,
    allowed_locations,
    source,
    reason,
    updated_by
  )
  values (
    p_tenant_id,
    v_plan_id,
    p_new_allowed_locations,
    p_source,
    p_reason,
    v_actor_user_id
  )
  on conflict (tenant_id)
  do update
  set
    plan_id = excluded.plan_id,
    allowed_locations = excluded.allowed_locations,
    source = excluded.source,
    reason = excluded.reason,
    updated_by = excluded.updated_by,
    updated_at = now();

  insert into public.tenant_location_overage_events (
    tenant_id,
    plan_id,
    locations_before,
    locations_after,
    added_count,
    currency,
    unit_price,
    subtotal,
    billing_effective_at,
    source,
    metadata
  )
  values (
    p_tenant_id,
    v_plan_id,
    v_current_allowed,
    p_new_allowed_locations,
    v_added_count,
    v_currency,
    v_unit_price,
    v_subtotal,
    v_effective_at,
    p_source,
    jsonb_build_object(
      'reason', p_reason,
      'before_total_price', v_quote_before.total_price,
      'after_total_price', v_quote_after.total_price
    )
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
    v_actor_user_id,
    'tenant_chain_entitlement_updated',
    'tenant_plan_entitlement',
    p_tenant_id,
    jsonb_build_object(
      'allowed_locations', p_new_allowed_locations,
      'source', p_source,
      'reason', p_reason,
      'added_count', v_added_count,
      'billing_effective_at', v_effective_at
    )
  );

  return jsonb_build_object(
    'success', true,
    'tenant_id', p_tenant_id,
    'allowed_locations', p_new_allowed_locations,
    'added_count', v_added_count,
    'billing_effective_at', v_effective_at,
    'unit_price', v_unit_price,
    'subtotal', v_subtotal,
    'currency', v_currency
  );
end;
$$;

grant execute on function public.expand_chain_entitlement_and_log_billing(uuid, integer, text, text) to authenticated;

create or replace function public.assert_tenant_can_add_location(
  p_tenant_id uuid
)
returns table (
  allowed integer,
  used integer,
  can_add boolean,
  requires_custom boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_plan_slug text;
  v_plan_id uuid;
  v_plan_limit integer := 1;
  v_allowed integer := 1;
  v_used integer := 0;
  v_currency text := 'USD';
  v_quote record;
begin
  if v_actor_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not (belongs_to_tenant(v_actor_user_id, p_tenant_id) or is_backoffice_user(v_actor_user_id)) then
    raise exception 'TENANT_ACCESS_DENIED';
  end if;

  select t.plan::text, t.currency
  into v_plan_slug, v_currency
  from public.tenants t
  where t.id = p_tenant_id;

  if v_plan_slug is null then
    raise exception 'TENANT_NOT_FOUND';
  end if;

  select count(*)::integer
  into v_used
  from public.locations
  where tenant_id = p_tenant_id;

  if lower(v_plan_slug) = 'chain' then
    select p.id
    into v_plan_id
    from public.plans p
    where lower(p.slug) = 'chain'
    order by p.is_active desc, p.created_at desc
    limit 1;

    select e.allowed_locations
    into v_allowed
    from public.tenant_plan_entitlements e
    where e.tenant_id = p_tenant_id;

    v_allowed := coalesce(v_allowed, 1);

    if v_plan_id is not null then
      select *
      into v_quote
      from public.compute_chain_price(v_plan_id, v_currency, v_used + 1)
      limit 1;
    end if;

    return query
      select
        v_allowed,
        v_used,
        (v_used < v_allowed),
        coalesce(v_quote.requires_custom, false);
    return;
  end if;

  select p.id
  into v_plan_id
  from public.plans p
  where lower(p.slug) = lower(v_plan_slug)
  order by p.is_active desc, p.created_at desc
  limit 1;

  if v_plan_id is not null then
    select coalesce(pl.max_locations, 1)
    into v_plan_limit
    from public.plan_limits pl
    where pl.plan_id = v_plan_id;
  end if;

  return query
    select
      v_plan_limit,
      v_used,
      (v_used < v_plan_limit),
      false;
end;
$$;

