alter table public.sales_promo_campaigns
  add column if not exists billing_targets text[] not null default array['subscription']::text[],
  add column if not exists max_uses_per_tenant integer not null default 1,
  add column if not exists email_subject_template text,
  add column if not exists email_body_template text;

update public.sales_promo_campaigns
set
  billing_targets = coalesce(nullif(billing_targets, '{}'::text[]), array['subscription']::text[]),
  max_uses_per_tenant = greatest(coalesce(max_uses_per_tenant, 1), 1),
  email_subject_template = coalesce(
    nullif(trim(email_subject_template), ''),
    'Your {{campaign_name}} Salon Magik promo code'
  ),
  email_body_template = coalesce(
    nullif(trim(email_body_template), ''),
    '<p>Hello {{recipient_firstname}},</p><p>Your Salon Magik promo code for {{campaign_name}} is <strong>{{promo_code}}</strong>.</p><p>This code is reserved for {{recipient_email}} and can be used before {{expires_at}}.</p><p><a href="{{signup_url}}">Create your account</a> or <a href="{{login_url}}">log in</a> to continue.</p>'
  );

alter table public.sales_promo_campaigns
  drop constraint if exists sales_promo_campaigns_billing_targets_check;

alter table public.sales_promo_campaigns
  add constraint sales_promo_campaigns_billing_targets_check
  check (
    cardinality(billing_targets) > 0
    and billing_targets <@ array['subscription', 'credits']::text[]
  );

alter table public.sales_promo_campaigns
  drop constraint if exists sales_promo_campaigns_max_uses_per_tenant_check;

alter table public.sales_promo_campaigns
  add constraint sales_promo_campaigns_max_uses_per_tenant_check
  check (max_uses_per_tenant >= 1);

alter table public.sales_promo_codes
  add column if not exists target_first_name text,
  add column if not exists claimed_tenant_id uuid references public.tenants(id) on delete set null,
  add column if not exists claimed_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists claimed_at timestamptz,
  add column if not exists invalidated_at timestamptz,
  add column if not exists invalidated_by uuid references auth.users(id) on delete set null,
  add column if not exists invalidation_reason text,
  add column if not exists last_sent_at timestamptz,
  add column if not exists send_count integer not null default 0;

alter table public.sales_promo_codes
  drop constraint if exists sales_promo_codes_status_check;

alter table public.sales_promo_codes
  add constraint sales_promo_codes_status_check
  check (status in ('active', 'claimed', 'redeemed', 'consumed', 'expired', 'cancelled', 'invalidated'));

alter table public.sales_promo_redemptions
  add column if not exists claimed_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists claimed_at timestamptz,
  add column if not exists max_uses integer not null default 1,
  add column if not exists uses_consumed integer not null default 0,
  add column if not exists remaining_uses integer not null default 1,
  add column if not exists billing_targets text[] not null default array['subscription']::text[],
  add column if not exists last_surface text,
  add column if not exists last_used_at timestamptz,
  add column if not exists invalidated_at timestamptz,
  add column if not exists invalidated_by uuid references auth.users(id) on delete set null,
  add column if not exists invalidation_reason text;

update public.sales_promo_redemptions r
set
  max_uses = greatest(coalesce(r.max_uses, c.max_uses_per_tenant, 1), 1),
  uses_consumed = greatest(coalesce(r.uses_consumed, 0), 0),
  remaining_uses = greatest(
    greatest(coalesce(r.max_uses, c.max_uses_per_tenant, 1), 1) - greatest(coalesce(r.uses_consumed, 0), 0),
    0
  ),
  billing_targets = coalesce(nullif(r.billing_targets, '{}'::text[]), c.billing_targets, array['subscription']::text[])
from public.sales_promo_codes p
join public.sales_promo_campaigns c on c.id = p.campaign_id
where r.promo_code_id = p.id;

alter table public.sales_promo_redemptions
  drop constraint if exists sales_promo_redemptions_status_check;

alter table public.sales_promo_redemptions
  add constraint sales_promo_redemptions_status_check
  check (status in ('provisional', 'finalized', 'rejected', 'reversed', 'claimed', 'consumed', 'invalidated', 'expired'));

alter table public.sales_promo_redemptions
  drop constraint if exists sales_promo_redemptions_last_surface_check;

alter table public.sales_promo_redemptions
  add constraint sales_promo_redemptions_last_surface_check
  check (last_surface is null or last_surface in ('subscription', 'credits'));

alter table public.sales_promo_redemptions
  drop constraint if exists sales_promo_redemptions_billing_targets_check;

alter table public.sales_promo_redemptions
  add constraint sales_promo_redemptions_billing_targets_check
  check (
    cardinality(billing_targets) > 0
    and billing_targets <@ array['subscription', 'credits']::text[]
  );

create unique index if not exists idx_sales_promo_redemptions_unique_code
  on public.sales_promo_redemptions (promo_code_id);

create table if not exists public.sales_promo_usage_events (
  id uuid primary key default gen_random_uuid(),
  redemption_id uuid not null references public.sales_promo_redemptions(id) on delete cascade,
  promo_code_id uuid not null references public.sales_promo_codes(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  surface text not null check (surface in ('subscription', 'credits')),
  usage_reference text not null,
  amount numeric,
  discount_type text,
  discount_value numeric,
  status text not null default 'consumed' check (status in ('consumed', 'reversed')),
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

create unique index if not exists idx_sales_promo_usage_events_unique_ref
  on public.sales_promo_usage_events (promo_code_id, usage_reference);

create index if not exists idx_sales_promo_usage_events_tenant_id
  on public.sales_promo_usage_events (tenant_id, created_at desc);

alter table public.sales_promo_usage_events enable row level security;

drop policy if exists "Sales capture can read usage events" on public.sales_promo_usage_events;
create policy "Sales capture can read usage events"
  on public.sales_promo_usage_events
  for select
  to authenticated
  using (
    has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role)
    or backoffice_user_has_permission(auth.uid(), 'sales.capture_client')
  );

drop policy if exists "Sales capture can manage usage events" on public.sales_promo_usage_events;
create policy "Sales capture can manage usage events"
  on public.sales_promo_usage_events
  for all
  to authenticated
  using (
    has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role)
    or backoffice_user_has_permission(auth.uid(), 'sales.capture_client')
  )
  with check (
    has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role)
    or backoffice_user_has_permission(auth.uid(), 'sales.capture_client')
  );

create or replace function public.get_sales_promo_email_vars(
  p_promo_code_id uuid,
  p_origin text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_promo public.sales_promo_codes;
  v_campaign public.sales_promo_campaigns;
  v_base_url text;
begin
  select * into v_promo
  from public.sales_promo_codes
  where id = p_promo_code_id;

  if v_promo.id is null then
    raise exception 'PROMO_NOT_FOUND';
  end if;

  select * into v_campaign
  from public.sales_promo_campaigns
  where id = v_promo.campaign_id;

  if v_campaign.id is null then
    raise exception 'CAMPAIGN_NOT_FOUND';
  end if;

  v_base_url := coalesce(nullif(trim(p_origin), ''), nullif(trim(current_setting('request.headers', true)::jsonb ->> 'origin'), ''), 'https://app.salonmagik.com');
  v_base_url := regexp_replace(v_base_url, '/+$', '');

  return jsonb_build_object(
    'recipient_email', v_promo.target_email,
    'recipient_firstname', coalesce(nullif(trim(v_promo.target_first_name), ''), 'there'),
    'promo_code', v_promo.code,
    'campaign_name', v_campaign.name,
    'expires_at', to_char(coalesce(v_promo.expires_at, v_campaign.ends_at), 'Mon DD, YYYY HH24:MI TZ'),
    'signup_url', v_base_url || '/signup?promo=' || v_promo.code,
    'login_url', v_base_url || '/login?promo=' || v_promo.code,
    'discount_value', v_campaign.discount_value,
    'billing_targets', array_to_string(v_campaign.billing_targets, ', ')
  );
end;
$$;

create or replace function public.validate_sales_promo_code_for_email(
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_email text;
  v_promo public.sales_promo_codes;
  v_campaign public.sales_promo_campaigns;
begin
  if v_actor is null then
    return jsonb_build_object('valid', false, 'message', 'Authentication required');
  end if;

  select lower(trim(coalesce(email, '')))
  into v_email
  from auth.users
  where id = v_actor;

  select * into v_promo
  from public.sales_promo_codes
  where upper(code) = upper(trim(coalesce(p_code, '')));

  if v_promo.id is null then
    return jsonb_build_object('valid', false, 'message', 'Invalid promo code');
  end if;

  select * into v_campaign
  from public.sales_promo_campaigns
  where id = v_promo.campaign_id;

  if v_campaign.id is null or v_campaign.is_active is not true or v_campaign.ends_at <= now() then
    return jsonb_build_object('valid', false, 'message', 'This promo campaign is no longer active');
  end if;

  if v_promo.invalidated_at is not null or v_promo.status in ('invalidated', 'cancelled', 'expired', 'redeemed', 'consumed') then
    return jsonb_build_object('valid', false, 'message', 'This promo code is no longer valid');
  end if;

  if v_promo.claimed_tenant_id is not null and v_promo.status in ('claimed', 'redeemed', 'consumed') then
    return jsonb_build_object('valid', false, 'message', 'This promo code has already been claimed');
  end if;

  if lower(trim(coalesce(v_promo.target_email, ''))) <> v_email then
    return jsonb_build_object('valid', false, 'message', 'This promo code is reserved for a different email address');
  end if;

  return jsonb_build_object(
    'valid', true,
    'promo_code_id', v_promo.id,
    'code', v_promo.code,
    'campaign_name', v_campaign.name,
    'discount_type', v_campaign.discount_type,
    'discount_value', v_campaign.discount_value,
    'billing_targets', v_campaign.billing_targets,
    'max_uses_per_tenant', v_campaign.max_uses_per_tenant,
    'expires_at', v_promo.expires_at,
    'campaign_ends_at', v_campaign.ends_at
  );
end;
$$;

create or replace function public.claim_sales_promo_code(
  p_code text,
  p_tenant_id uuid,
  p_surface text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_email text;
  v_promo public.sales_promo_codes;
  v_campaign public.sales_promo_campaigns;
  v_existing public.sales_promo_redemptions;
  v_conflicting_count integer;
  v_required_module text;
begin
  if v_actor is null then
    return jsonb_build_object('success', false, 'message', 'Authentication required');
  end if;

  select lower(trim(coalesce(email, '')))
  into v_email
  from auth.users
  where id = v_actor;

  if not exists (
    select 1
    from public.user_roles
    where user_id = v_actor
      and tenant_id = p_tenant_id
      and is_active = true
  ) then
    return jsonb_build_object('success', false, 'message', 'You do not have access to this tenant');
  end if;

  if p_surface is not null and p_surface not in ('subscription', 'credits') then
    return jsonb_build_object('success', false, 'message', 'Unsupported promo surface');
  end if;

  if p_surface is not null then
    v_required_module := case
      when p_surface = 'subscription' then 'payments'
      when p_surface = 'credits' then 'messaging'
      else null
    end;

    if v_required_module is not null
       and not public.user_has_module_access(v_actor, p_tenant_id, v_required_module) then
      return jsonb_build_object('success', false, 'message', 'You do not have permission to claim a promo for this billing surface');
    end if;
  end if;

  select * into v_promo
  from public.sales_promo_codes
  where upper(code) = upper(trim(coalesce(p_code, '')));

  if v_promo.id is null then
    return jsonb_build_object('success', false, 'message', 'Invalid promo code');
  end if;

  select * into v_campaign
  from public.sales_promo_campaigns
  where id = v_promo.campaign_id;

  if v_campaign.id is null or v_campaign.is_active is not true or v_campaign.ends_at <= now() then
    return jsonb_build_object('success', false, 'message', 'This promo campaign is no longer active');
  end if;

  if v_promo.invalidated_at is not null or v_promo.status in ('invalidated', 'cancelled', 'expired', 'redeemed', 'consumed') then
    return jsonb_build_object('success', false, 'message', 'This promo code is no longer valid');
  end if;

  if lower(trim(coalesce(v_promo.target_email, ''))) <> v_email then
    return jsonb_build_object('success', false, 'message', 'This promo code is reserved for a different email address');
  end if;

  select count(*)
  into v_conflicting_count
  from public.sales_promo_redemptions r
  join public.sales_promo_codes pc on pc.id = r.promo_code_id
  join public.sales_promo_campaigns c on c.id = pc.campaign_id
  where r.tenant_id = p_tenant_id
    and r.status in ('claimed', 'provisional', 'finalized')
    and r.remaining_uses > 0
    and coalesce(r.invalidated_at, pc.invalidated_at) is null
    and c.ends_at > now();

  if v_conflicting_count > 0 and coalesce(v_promo.claimed_tenant_id, p_tenant_id) <> p_tenant_id then
    return jsonb_build_object('success', false, 'message', 'This tenant already has an active promo code');
  end if;

  if v_promo.claimed_tenant_id is not null and v_promo.claimed_tenant_id <> p_tenant_id then
    return jsonb_build_object('success', false, 'message', 'This promo code has already been claimed by another salon');
  end if;

  select * into v_existing
  from public.sales_promo_redemptions
  where promo_code_id = v_promo.id;

  if v_existing.id is null then
    insert into public.sales_promo_redemptions (
      promo_code_id,
      tenant_id,
      owner_user_id,
      owner_email,
      email_match,
      discount_snapshot,
      trial_extension_days,
      status,
      provider_reference,
      claimed_by_user_id,
      claimed_at,
      max_uses,
      uses_consumed,
      remaining_uses,
      billing_targets
    )
    values (
      v_promo.id,
      p_tenant_id,
      v_actor,
      v_email,
      true,
      jsonb_build_object(
        'discount_type', v_campaign.discount_type,
        'discount_value', v_campaign.discount_value,
        'campaign_name', v_campaign.name
      ),
      coalesce(v_campaign.trial_extension_days, 0),
      'claimed',
      null,
      v_actor,
      now(),
      greatest(v_campaign.max_uses_per_tenant, 1),
      0,
      greatest(v_campaign.max_uses_per_tenant, 1),
      v_campaign.billing_targets
    )
    returning * into v_existing;
  else
    update public.sales_promo_redemptions
    set
      tenant_id = p_tenant_id,
      owner_user_id = coalesce(owner_user_id, v_actor),
      owner_email = v_email,
      email_match = true,
      status = case when remaining_uses > 0 then 'claimed' else status end,
      claimed_by_user_id = coalesce(claimed_by_user_id, v_actor),
      claimed_at = coalesce(claimed_at, now()),
      max_uses = greatest(v_campaign.max_uses_per_tenant, 1),
      remaining_uses = greatest(v_campaign.max_uses_per_tenant - uses_consumed, 0),
      billing_targets = v_campaign.billing_targets
    where id = v_existing.id
    returning * into v_existing;
  end if;

  update public.sales_promo_codes
  set
    status = case when v_existing.remaining_uses > 0 then 'claimed' else 'consumed' end,
    claimed_tenant_id = p_tenant_id,
    claimed_by_user_id = coalesce(claimed_by_user_id, v_actor),
    claimed_at = coalesce(claimed_at, now())
  where id = v_promo.id;

  return jsonb_build_object(
    'success', true,
    'promo_code_id', v_promo.id,
    'campaign_name', v_campaign.name,
    'discount_type', v_campaign.discount_type,
    'discount_value', v_campaign.discount_value,
    'billing_targets', v_campaign.billing_targets,
    'remaining_uses', v_existing.remaining_uses,
    'campaign_ends_at', v_campaign.ends_at
  );
end;
$$;

create or replace function public.get_tenant_sales_promo_summary(
  p_tenant_id uuid,
  p_surface text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_result record;
begin
  if v_actor is null then
    return null;
  end if;

  if not exists (
    select 1
    from public.user_roles
    where user_id = v_actor
      and tenant_id = p_tenant_id
      and is_active = true
  ) then
    return null;
  end if;

  select
    r.id as redemption_id,
    pc.id as promo_code_id,
    pc.code,
    pc.target_email,
    pc.status as promo_status,
    pc.expires_at,
    pc.invalidated_at as promo_invalidated_at,
    c.name as campaign_name,
    c.ends_at as campaign_ends_at,
    c.discount_type,
    c.discount_value,
    c.billing_targets,
    r.status as claim_status,
    r.max_uses,
    r.uses_consumed,
    r.remaining_uses,
    r.claimed_at,
    r.last_surface,
    r.last_used_at,
    r.invalidated_at as claim_invalidated_at
  into v_result
  from public.sales_promo_redemptions r
  join public.sales_promo_codes pc on pc.id = r.promo_code_id
  join public.sales_promo_campaigns c on c.id = pc.campaign_id
  where r.tenant_id = p_tenant_id
    and r.remaining_uses > 0
    and coalesce(r.invalidated_at, pc.invalidated_at) is null
    and c.ends_at > now()
    and (p_surface is null or p_surface = any(c.billing_targets))
  order by r.claimed_at desc nulls last, r.created_at desc
  limit 1;

  if v_result.redemption_id is null then
    return null;
  end if;

  return jsonb_build_object(
    'redemption_id', v_result.redemption_id,
    'promo_code_id', v_result.promo_code_id,
    'code', v_result.code,
    'target_email', v_result.target_email,
    'promo_status', v_result.promo_status,
    'campaign_name', v_result.campaign_name,
    'campaign_ends_at', v_result.campaign_ends_at,
    'discount_type', v_result.discount_type,
    'discount_value', v_result.discount_value,
    'billing_targets', v_result.billing_targets,
    'max_uses', v_result.max_uses,
    'uses_consumed', v_result.uses_consumed,
    'remaining_uses', v_result.remaining_uses,
    'claimed_at', v_result.claimed_at,
    'last_surface', v_result.last_surface,
    'last_used_at', v_result.last_used_at
  );
end;
$$;

create or replace function public.consume_tenant_sales_promo_use(
  p_tenant_id uuid,
  p_surface text,
  p_usage_reference text,
  p_amount numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_redemption public.sales_promo_redemptions;
  v_promo public.sales_promo_codes;
  v_campaign public.sales_promo_campaigns;
  v_event public.sales_promo_usage_events;
begin
  if p_surface not in ('subscription', 'credits') then
    return jsonb_build_object('applied', false, 'message', 'Unsupported promo surface');
  end if;

  select e.*
  into v_event
  from public.sales_promo_usage_events e
  where e.usage_reference = p_usage_reference
  limit 1;

  if v_event.id is not null then
    return jsonb_build_object('applied', true, 'duplicate', true, 'usage_event_id', v_event.id);
  end if;

  select r.*
  into v_redemption
  from public.sales_promo_redemptions r
  join public.sales_promo_codes pc on pc.id = r.promo_code_id
  join public.sales_promo_campaigns c on c.id = pc.campaign_id
  where r.tenant_id = p_tenant_id
    and r.remaining_uses > 0
    and r.status in ('claimed', 'finalized', 'provisional')
    and coalesce(r.invalidated_at, pc.invalidated_at) is null
    and c.ends_at > now()
    and p_surface = any(r.billing_targets)
  order by r.claimed_at desc nulls last, r.created_at desc
  limit 1
  for update;

  if v_redemption.id is null then
    return jsonb_build_object('applied', false, 'message', 'No active promo available');
  end if;

  select * into v_promo
  from public.sales_promo_codes
  where id = v_redemption.promo_code_id
  for update;

  select * into v_campaign
  from public.sales_promo_campaigns
  where id = v_promo.campaign_id;

  if v_campaign.id is null or v_campaign.ends_at <= now() or v_campaign.is_active is not true then
    update public.sales_promo_redemptions
    set status = 'expired'
    where id = v_redemption.id;

    update public.sales_promo_codes
    set status = 'expired'
    where id = v_promo.id;

    return jsonb_build_object('applied', false, 'message', 'Promo campaign has ended');
  end if;

  if v_promo.invalidated_at is not null or v_redemption.invalidated_at is not null then
    return jsonb_build_object('applied', false, 'message', 'Promo code has been invalidated');
  end if;

  insert into public.sales_promo_usage_events (
    redemption_id,
    promo_code_id,
    tenant_id,
    surface,
    usage_reference,
    amount,
    discount_type,
    discount_value,
    status,
    consumed_at
  )
  values (
    v_redemption.id,
    v_promo.id,
    p_tenant_id,
    p_surface,
    p_usage_reference,
    p_amount,
    v_campaign.discount_type,
    v_campaign.discount_value,
    'consumed',
    now()
  )
  returning * into v_event;

  update public.sales_promo_redemptions
  set
    uses_consumed = uses_consumed + 1,
    remaining_uses = greatest(max_uses - (uses_consumed + 1), 0),
    last_surface = p_surface,
    last_used_at = now(),
    status = case when max_uses - (uses_consumed + 1) <= 0 then 'consumed' else 'claimed' end,
    finalized_at = now()
  where id = v_redemption.id
  returning * into v_redemption;

  update public.sales_promo_codes
  set status = case when v_redemption.remaining_uses <= 0 then 'consumed' else 'claimed' end
  where id = v_promo.id;

  return jsonb_build_object(
    'applied', true,
    'usage_event_id', v_event.id,
    'promo_code_id', v_promo.id,
    'redemption_id', v_redemption.id,
    'discount_type', v_campaign.discount_type,
    'discount_value', v_campaign.discount_value,
    'remaining_uses', v_redemption.remaining_uses
  );
end;
$$;

create or replace function public.invalidate_sales_promo_code(
  p_promo_code_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    return jsonb_build_object('success', false, 'message', 'Authentication required');
  end if;

  if not has_backoffice_role(v_actor, 'super_admin'::backoffice_role) then
    return jsonb_build_object('success', false, 'message', 'Only super admins can invalidate promo codes');
  end if;

  update public.sales_promo_codes
  set
    status = 'invalidated',
    invalidated_at = now(),
    invalidated_by = v_actor,
    invalidation_reason = nullif(trim(coalesce(p_reason, '')), '')
  where id = p_promo_code_id;

  update public.sales_promo_redemptions
  set
    status = case when status = 'consumed' then status else 'invalidated' end,
    invalidated_at = now(),
    invalidated_by = v_actor,
    invalidation_reason = nullif(trim(coalesce(p_reason, '')), '')
  where promo_code_id = p_promo_code_id
    and invalidated_at is null;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.get_sales_promo_email_vars(uuid, text) to authenticated;
grant execute on function public.validate_sales_promo_code_for_email(text) to authenticated;
grant execute on function public.claim_sales_promo_code(text, uuid, text) to authenticated;
grant execute on function public.get_tenant_sales_promo_summary(uuid, text) to authenticated;
grant execute on function public.consume_tenant_sales_promo_use(uuid, text, text, numeric) to authenticated;
grant execute on function public.invalidate_sales_promo_code(uuid, text) to authenticated;

create or replace function public.backoffice_generate_sales_promo_code(
  p_campaign_id uuid,
  p_agent_id uuid,
  p_target_email text,
  p_target_first_name text default null
)
returns public.sales_promo_codes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_code text;
  v_result public.sales_promo_codes;
  v_is_super_admin boolean;
  v_campaign public.sales_promo_campaigns;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  v_is_super_admin := has_backoffice_role(v_actor, 'super_admin'::backoffice_role);

  if not (
    v_is_super_admin
    or backoffice_user_has_permission(v_actor, 'sales.capture_client')
  ) then
    raise exception 'ACCESS_DENIED';
  end if;

  if not v_is_super_admin then
    if not exists (
      select 1
      from public.sales_agents sa
      join public.backoffice_users bu on bu.id = sa.backoffice_user_id
      where sa.id = p_agent_id
        and bu.user_id = v_actor
    ) then
      raise exception 'AGENT_SCOPE_DENIED';
    end if;
  end if;

  select * into v_campaign
  from public.sales_promo_campaigns
  where id = p_campaign_id;

  if v_campaign.id is null then
    raise exception 'CAMPAIGN_NOT_FOUND';
  end if;

  if v_campaign.ends_at <= now() then
    raise exception 'CAMPAIGN_ENDED';
  end if;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.sales_promo_codes (
    campaign_id,
    agent_id,
    code,
    target_first_name,
    target_email,
    expires_at
  )
  values (
    p_campaign_id,
    p_agent_id,
    v_code,
    nullif(trim(coalesce(p_target_first_name, '')), ''),
    lower(trim(p_target_email)),
    least(v_campaign.ends_at, now() + interval '24 hours')
  )
  returning * into v_result;

  return v_result;
end;
$$;
