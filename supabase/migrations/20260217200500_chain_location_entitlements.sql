-- Chain plan tier pricing and tenant entitlement caps.

create table if not exists public.additional_location_pricing (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  currency text not null,
  tier_label text not null,
  tier_min integer not null,
  tier_max integer,
  price_per_location numeric,
  is_custom boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint additional_location_pricing_tier_min_check check (tier_min >= 2),
  constraint additional_location_pricing_tier_max_check check (tier_max is null or tier_max >= tier_min),
  constraint additional_location_pricing_price_check check (
    (is_custom = true and price_per_location is null)
    or (is_custom = false and price_per_location is not null and price_per_location >= 0)
  )
);

create unique index if not exists idx_additional_location_pricing_unique
  on public.additional_location_pricing (plan_id, currency, tier_min, coalesce(tier_max, -1));

create index if not exists idx_additional_location_pricing_plan_currency_min
  on public.additional_location_pricing (plan_id, currency, tier_min);

create unique index if not exists idx_additional_location_pricing_label_ci
  on public.additional_location_pricing (plan_id, currency, lower(btrim(tier_label)));

drop trigger if exists update_additional_location_pricing_updated_at on public.additional_location_pricing;
create trigger update_additional_location_pricing_updated_at
  before update on public.additional_location_pricing
  for each row execute function public.update_updated_at_column();

alter table public.additional_location_pricing enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'additional_location_pricing'
      and policyname = 'Authenticated can read additional location pricing'
  ) then
    create policy "Authenticated can read additional location pricing"
      on public.additional_location_pricing
      for select
      to authenticated
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'additional_location_pricing'
      and policyname = 'BackOffice super admins manage additional location pricing'
  ) then
    create policy "BackOffice super admins manage additional location pricing"
      on public.additional_location_pricing
      for all
      to authenticated
      using (has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role))
      with check (has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role));
  end if;
end $$;

create table if not exists public.tenant_plan_entitlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  allowed_locations integer not null default 1,
  source text not null,
  reason text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_plan_entitlements_allowed_locations_check check (allowed_locations >= 1)
);

create index if not exists idx_tenant_plan_entitlements_plan
  on public.tenant_plan_entitlements (plan_id);

drop trigger if exists update_tenant_plan_entitlements_updated_at on public.tenant_plan_entitlements;
create trigger update_tenant_plan_entitlements_updated_at
  before update on public.tenant_plan_entitlements
  for each row execute function public.update_updated_at_column();

alter table public.tenant_plan_entitlements enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tenant_plan_entitlements'
      and policyname = 'Tenant members can read own entitlements'
  ) then
    create policy "Tenant members can read own entitlements"
      on public.tenant_plan_entitlements
      for select
      to authenticated
      using (belongs_to_tenant(auth.uid(), tenant_id));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tenant_plan_entitlements'
      and policyname = 'BackOffice users can read all entitlements'
  ) then
    create policy "BackOffice users can read all entitlements"
      on public.tenant_plan_entitlements
      for select
      to authenticated
      using (is_backoffice_user(auth.uid()));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tenant_plan_entitlements'
      and policyname = 'BackOffice super admins manage entitlements'
  ) then
    create policy "BackOffice super admins manage entitlements"
      on public.tenant_plan_entitlements
      for all
      to authenticated
      using (has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role))
      with check (has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role));
  end if;
end $$;

create or replace function public.backoffice_upsert_chain_location_pricing(
  p_plan_id uuid,
  p_tiers jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_plan_slug text;
  v_currency text;
  v_prev_max integer;
  v_row record;
  v_tier_count integer;
begin
  if v_actor_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not has_backoffice_role(v_actor_user_id, 'super_admin'::backoffice_role) then
    raise exception 'BACKOFFICE_SUPER_ADMIN_REQUIRED';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'CHAIN_TIER_REASON_REQUIRED';
  end if;

  select slug into v_plan_slug
  from public.plans
  where id = p_plan_id;

  if v_plan_slug is null then
    raise exception 'PLAN_NOT_FOUND';
  end if;

  if lower(v_plan_slug) <> 'chain' then
    raise exception 'CHAIN_PLAN_REQUIRED';
  end if;

  if p_tiers is null or jsonb_typeof(p_tiers) <> 'array' then
    raise exception 'CHAIN_TIERS_INVALID_PAYLOAD';
  end if;

  create temporary table tmp_chain_tiers (
    currency text not null,
    tier_label text not null,
    tier_min integer not null,
    tier_max integer,
    price_per_location numeric,
    is_custom boolean not null
  ) on commit drop;

  insert into tmp_chain_tiers (currency, tier_label, tier_min, tier_max, price_per_location, is_custom)
  select
    upper(btrim(value->>'currency')) as currency,
    coalesce(nullif(btrim(value->>'tier_label'), ''),
      concat((value->>'tier_min')::integer::text, case when nullif(value->>'tier_max', '') is null then '+' else '-' || (value->>'tier_max') end)
    ) as tier_label,
    (value->>'tier_min')::integer as tier_min,
    nullif(value->>'tier_max', '')::integer as tier_max,
    nullif(value->>'price_per_location', '')::numeric as price_per_location,
    coalesce((value->>'is_custom')::boolean, false) as is_custom
  from jsonb_array_elements(p_tiers) as value;

  select count(*) into v_tier_count from tmp_chain_tiers;
  if v_tier_count = 0 then
    raise exception 'CHAIN_TIERS_REQUIRED';
  end if;

  if exists (select 1 from tmp_chain_tiers where currency not in ('USD', 'NGN', 'GHS')) then
    raise exception 'CHAIN_TIER_CURRENCY_INVALID';
  end if;

  if exists (select 1 from tmp_chain_tiers where tier_min < 2 or (tier_max is not null and tier_max < tier_min)) then
    raise exception 'CHAIN_TIER_RANGE_INVALID';
  end if;

  if exists (
    select 1
    from tmp_chain_tiers
    where (is_custom and price_per_location is not null)
      or (not is_custom and (price_per_location is null or price_per_location < 0))
  ) then
    raise exception 'CHAIN_TIER_PRICE_INVALID';
  end if;

  if exists (
    select 1
    from (
      select
        currency,
        tier_min,
        coalesce(tier_max, 2147483647) as tier_max,
        lag(coalesce(tier_max, 2147483647)) over (partition by currency order by tier_min) as prev_tier_max
      from tmp_chain_tiers
    ) ordered
    where prev_tier_max is not null
      and tier_min <= prev_tier_max
  ) then
    raise exception 'CHAIN_TIER_OVERLAP';
  end if;

  for v_currency in select distinct currency from tmp_chain_tiers loop
    v_prev_max := 1;

    for v_row in
      select tier_min, tier_max, is_custom
      from tmp_chain_tiers
      where currency = v_currency
      order by tier_min asc
    loop
      if v_row.tier_min <> v_prev_max + 1 then
        raise exception 'CHAIN_TIER_GAP_OR_OVERLAP_%', v_currency;
      end if;

      if v_row.tier_max is null then
        if not v_row.is_custom then
          raise exception 'CHAIN_TIER_OPEN_ENDED_MUST_BE_CUSTOM_%', v_currency;
        end if;
        v_prev_max := 2147483647;
      else
        v_prev_max := v_row.tier_max;
      end if;
    end loop;

    if exists (
      select 1
      from tmp_chain_tiers
      where currency = v_currency
        and tier_max is null
      group by currency
      having count(*) > 1
    ) then
      raise exception 'CHAIN_TIER_OPEN_ENDED_DUPLICATE_%', v_currency;
    end if;
  end loop;

  delete from public.additional_location_pricing
  where plan_id = p_plan_id;

  insert into public.additional_location_pricing (
    plan_id,
    currency,
    tier_label,
    tier_min,
    tier_max,
    price_per_location,
    is_custom
  )
  select
    p_plan_id,
    currency,
    tier_label,
    tier_min,
    tier_max,
    price_per_location,
    is_custom
  from tmp_chain_tiers;

  insert into public.audit_logs (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_actor_user_id,
    'chain_pricing_tiers_updated',
    'plan',
    p_plan_id,
    jsonb_build_object(
      'reason', p_reason,
      'tier_count', v_tier_count
    )
  );

  return jsonb_build_object('success', true, 'tier_count', v_tier_count);
end;
$$;

grant execute on function public.backoffice_upsert_chain_location_pricing(uuid, jsonb, text) to authenticated;

create or replace function public.compute_chain_price(
  p_plan_id uuid,
  p_currency text,
  p_total_locations integer
)
returns table (
  total_price numeric,
  breakdown jsonb,
  requires_custom boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_currency text := upper(btrim(p_currency));
  v_base numeric;
  v_total numeric;
  v_breakdown jsonb := '[]'::jsonb;
  v_ptr integer := 2;
  v_tier record;
  v_count integer;
begin
  if p_total_locations < 1 then
    raise exception 'TOTAL_LOCATIONS_INVALID';
  end if;

  select monthly_price
  into v_base
  from public.plan_pricing
  where plan_id = p_plan_id
    and currency = v_currency
    and valid_until is null
  order by valid_from desc
  limit 1;

  if v_base is null then
    raise exception 'CHAIN_BASE_PRICE_NOT_FOUND';
  end if;

  v_total := v_base;
  v_breakdown := v_breakdown || jsonb_build_object(
    'tier_label', 'Base (1 location)',
    'locations', 1,
    'price_per_location', v_base,
    'subtotal', v_base,
    'is_custom', false
  );

  if p_total_locations = 1 then
    return query select v_total, v_breakdown, false;
    return;
  end if;

  for v_tier in
    select *
    from public.additional_location_pricing
    where plan_id = p_plan_id
      and currency = v_currency
    order by tier_min asc
  loop
    exit when v_ptr > p_total_locations;

    if v_tier.tier_min > v_ptr then
      return query select v_total, v_breakdown, true;
      return;
    end if;

    v_count := greatest(
      0,
      least(p_total_locations, coalesce(v_tier.tier_max, p_total_locations))
      - greatest(v_ptr, v_tier.tier_min)
      + 1
    );

    if v_count <= 0 then
      continue;
    end if;

    if v_tier.is_custom then
      v_breakdown := v_breakdown || jsonb_build_object(
        'tier_label', v_tier.tier_label,
        'locations', v_count,
        'price_per_location', null,
        'subtotal', null,
        'is_custom', true
      );
      return query select v_total, v_breakdown, true;
      return;
    end if;

    v_total := v_total + (v_count * v_tier.price_per_location);
    v_breakdown := v_breakdown || jsonb_build_object(
      'tier_label', v_tier.tier_label,
      'locations', v_count,
      'price_per_location', v_tier.price_per_location,
      'subtotal', v_count * v_tier.price_per_location,
      'is_custom', false
    );

    v_ptr := least(p_total_locations, coalesce(v_tier.tier_max, p_total_locations)) + 1;
  end loop;

  if v_ptr <= p_total_locations then
    return query select v_total, v_breakdown, true;
  else
    return query select v_total, v_breakdown, false;
  end if;
end;
$$;

grant execute on function public.compute_chain_price(uuid, text, integer) to authenticated;

create or replace function public.set_tenant_chain_entitlement(
  p_tenant_id uuid,
  p_plan_id uuid,
  p_allowed_locations integer,
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
  v_plan_slug text;
  v_is_super_admin boolean;
  v_is_tenant_member boolean;
begin
  if v_actor_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_allowed_locations < 1 then
    raise exception 'ALLOWED_LOCATIONS_INVALID';
  end if;

  v_is_super_admin := has_backoffice_role(v_actor_user_id, 'super_admin'::backoffice_role);
  v_is_tenant_member := belongs_to_tenant(v_actor_user_id, p_tenant_id);

  if not v_is_super_admin and not (v_is_tenant_member and p_source = 'onboarding') then
    raise exception 'ENTITLEMENT_WRITE_FORBIDDEN';
  end if;

  select slug into v_plan_slug
  from public.plans
  where id = p_plan_id;

  if v_plan_slug is null then
    raise exception 'PLAN_NOT_FOUND';
  end if;

  if lower(v_plan_slug) <> 'chain' then
    raise exception 'CHAIN_PLAN_REQUIRED';
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
    p_plan_id,
    p_allowed_locations,
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
      'allowed_locations', p_allowed_locations,
      'source', p_source,
      'reason', p_reason
    )
  );

  return jsonb_build_object(
    'success', true,
    'tenant_id', p_tenant_id,
    'allowed_locations', p_allowed_locations
  );
end;
$$;

grant execute on function public.set_tenant_chain_entitlement(uuid, uuid, integer, text, text) to authenticated;

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
begin
  if v_actor_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not (belongs_to_tenant(v_actor_user_id, p_tenant_id) or is_backoffice_user(v_actor_user_id)) then
    raise exception 'TENANT_ACCESS_DENIED';
  end if;

  select t.plan::text
  into v_plan_slug
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
    select e.allowed_locations
    into v_allowed
    from public.tenant_plan_entitlements e
    where e.tenant_id = p_tenant_id;

    v_allowed := coalesce(v_allowed, 1);

    return query
      select
        v_allowed,
        v_used,
        (v_used < v_allowed),
        (v_used + 1 > 10);
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

grant execute on function public.assert_tenant_can_add_location(uuid) to authenticated;
