-- Backoffice security + audit + plan rollout foundation

create table if not exists public.backoffice_step_up_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  resource_id uuid not null,
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_backoffice_step_up_user_action_resource
  on public.backoffice_step_up_challenges (user_id, action, resource_id, expires_at desc);

alter table public.backoffice_step_up_challenges enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'backoffice_step_up_challenges'
      and policyname = 'BackOffice can read own step-up challenges'
  ) then
    create policy "BackOffice can read own step-up challenges"
      on public.backoffice_step_up_challenges
      for select
      to authenticated
      using (user_id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'plans'
      and policyname = 'BackOffice super admins can delete plans'
  ) then
    create policy "BackOffice super admins can delete plans"
      on public.plans
      for delete
      to authenticated
      using (has_backoffice_role(auth.uid(), 'super_admin'));
  end if;
end $$;

create unique index if not exists idx_plans_single_recommended_true
  on public.plans ((is_recommended))
  where is_recommended = true;

do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_logs'
      and policyname = 'BackOffice users can read audit logs'
  ) then
    drop policy "BackOffice users can read audit logs" on public.audit_logs;
  end if;
end $$;

create policy "BackOffice users can read audit logs"
  on public.audit_logs
  for select
  to authenticated
  using (
    tenant_id in (select get_user_tenant_ids(auth.uid()))
    or is_backoffice_user(auth.uid())
  );

create or replace function public.backoffice_delete_or_archive_plan(
  p_plan_id uuid,
  p_reason text,
  p_challenge_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_plan public.plans%rowtype;
  v_is_in_use boolean := false;
  v_action text;
begin
  if v_actor_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not public.has_backoffice_role(v_actor_user_id, 'super_admin'::backoffice_role) then
    raise exception 'BACKOFFICE_SUPER_ADMIN_REQUIRED';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'PLAN_DELETE_REASON_REQUIRED';
  end if;

  if p_challenge_id is null then
    raise exception 'STEP_UP_REQUIRED';
  end if;

  select *
  into v_plan
  from public.plans
  where id = p_plan_id
  for update;

  if not found then
    raise exception 'PLAN_NOT_FOUND';
  end if;

  update public.backoffice_step_up_challenges
  set used_at = now()
  where id = p_challenge_id
    and user_id = v_actor_user_id
    and action = 'plan_delete'
    and resource_id = p_plan_id
    and used_at is null
    and expires_at > now();

  if not found then
    raise exception 'STEP_UP_CHALLENGE_INVALID_OR_EXPIRED';
  end if;

  select exists (
    select 1
    from public.subscriptions s
    where s.plan_id = p_plan_id
      and s.status in ('active', 'trialing', 'past_due', 'paused')
  ) into v_is_in_use;

  if v_is_in_use then
    update public.plans
    set is_active = false,
        is_recommended = false
    where id = p_plan_id;
    v_action := 'plan_archived';
  else
    delete from public.plans where id = p_plan_id;
    v_action := 'plan_deleted';
  end if;

  insert into public.audit_logs (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_actor_user_id,
    v_action,
    'plan',
    p_plan_id,
    jsonb_build_object(
      'reason', p_reason,
      'was_in_use', v_is_in_use,
      'plan_name', v_plan.name,
      'plan_slug', v_plan.slug
    )
  );

  return jsonb_build_object(
    'status', case when v_is_in_use then 'archived' else 'deleted' end,
    'plan_id', p_plan_id
  );
end;
$$;

grant execute on function public.backoffice_delete_or_archive_plan(uuid, text, uuid) to authenticated;

create table if not exists public.plan_change_batches (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  reason text not null,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'rolled_out', 'cancelled')),
  rollout_at timestamptz,
  rolled_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plan_change_versions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.plan_change_batches(id) on delete cascade,
  plan_core_json jsonb not null default '{}'::jsonb,
  limits_json jsonb not null default '{}'::jsonb,
  pricing_json jsonb not null default '[]'::jsonb,
  change_summary_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.plan_change_targets (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.plan_change_batches(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(batch_id, tenant_id)
);

create table if not exists public.plan_change_notifications (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.plan_change_batches(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  seen_at timestamptz,
  cta_opened_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(batch_id, tenant_id)
);

create index if not exists idx_plan_change_batches_plan_id_status
  on public.plan_change_batches (plan_id, status, rollout_at);
create index if not exists idx_plan_change_targets_batch_id on public.plan_change_targets (batch_id);
create index if not exists idx_plan_change_notifications_tenant_unseen
  on public.plan_change_notifications (tenant_id, created_at desc)
  where seen_at is null and dismissed_at is null;

drop trigger if exists update_plan_change_batches_updated_at on public.plan_change_batches;
create trigger update_plan_change_batches_updated_at
  before update on public.plan_change_batches
  for each row execute function public.update_updated_at_column();

alter table public.plan_change_batches enable row level security;
alter table public.plan_change_versions enable row level security;
alter table public.plan_change_targets enable row level security;
alter table public.plan_change_notifications enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='plan_change_batches' and policyname='BackOffice can read plan change batches'
  ) then
    create policy "BackOffice can read plan change batches"
      on public.plan_change_batches
      for select
      to authenticated
      using (is_backoffice_user(auth.uid()));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='plan_change_batches' and policyname='BackOffice super admins can write plan change batches'
  ) then
    create policy "BackOffice super admins can write plan change batches"
      on public.plan_change_batches
      for all
      to authenticated
      using (has_backoffice_role(auth.uid(), 'super_admin'))
      with check (has_backoffice_role(auth.uid(), 'super_admin'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='plan_change_versions' and policyname='BackOffice can read plan change versions'
  ) then
    create policy "BackOffice can read plan change versions"
      on public.plan_change_versions
      for select
      to authenticated
      using (is_backoffice_user(auth.uid()));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='plan_change_versions' and policyname='BackOffice super admins can write plan change versions'
  ) then
    create policy "BackOffice super admins can write plan change versions"
      on public.plan_change_versions
      for all
      to authenticated
      using (has_backoffice_role(auth.uid(), 'super_admin'))
      with check (has_backoffice_role(auth.uid(), 'super_admin'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='plan_change_targets' and policyname='BackOffice can read plan change targets'
  ) then
    create policy "BackOffice can read plan change targets"
      on public.plan_change_targets
      for select
      to authenticated
      using (is_backoffice_user(auth.uid()));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='plan_change_targets' and policyname='BackOffice super admins can write plan change targets'
  ) then
    create policy "BackOffice super admins can write plan change targets"
      on public.plan_change_targets
      for all
      to authenticated
      using (has_backoffice_role(auth.uid(), 'super_admin'))
      with check (has_backoffice_role(auth.uid(), 'super_admin'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='plan_change_notifications' and policyname='BackOffice can read plan change notifications'
  ) then
    create policy "BackOffice can read plan change notifications"
      on public.plan_change_notifications
      for select
      to authenticated
      using (is_backoffice_user(auth.uid()));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='plan_change_notifications' and policyname='Tenant members can read own plan change notifications'
  ) then
    create policy "Tenant members can read own plan change notifications"
      on public.plan_change_notifications
      for select
      to authenticated
      using (tenant_id in (select get_user_tenant_ids(auth.uid())));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='plan_change_notifications' and policyname='Tenant members can update own plan change notifications'
  ) then
    create policy "Tenant members can update own plan change notifications"
      on public.plan_change_notifications
      for update
      to authenticated
      using (tenant_id in (select get_user_tenant_ids(auth.uid())))
      with check (tenant_id in (select get_user_tenant_ids(auth.uid())));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='plan_change_notifications' and policyname='BackOffice super admins can write plan change notifications'
  ) then
    create policy "BackOffice super admins can write plan change notifications"
      on public.plan_change_notifications
      for all
      to authenticated
      using (has_backoffice_role(auth.uid(), 'super_admin'))
      with check (has_backoffice_role(auth.uid(), 'super_admin'));
  end if;
end $$;

create or replace function public.backoffice_apply_plan_change_batch(
  p_batch_id uuid,
  p_rollout_mode text default 'now',
  p_rollout_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_batch public.plan_change_batches%rowtype;
  v_version public.plan_change_versions%rowtype;
  v_mode text := lower(coalesce(p_rollout_mode, 'now'));
  v_rollout_time timestamptz;
  v_currency text;
  v_monthly numeric;
  v_effective numeric;
  v_annual numeric;
begin
  if v_actor_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not public.has_backoffice_role(v_actor_user_id, 'super_admin'::backoffice_role) then
    raise exception 'BACKOFFICE_SUPER_ADMIN_REQUIRED';
  end if;

  select * into v_batch
  from public.plan_change_batches
  where id = p_batch_id
  for update;

  if not found then
    raise exception 'PLAN_CHANGE_BATCH_NOT_FOUND';
  end if;

  select *
  into v_version
  from public.plan_change_versions
  where batch_id = p_batch_id
  order by created_at desc
  limit 1;

  if v_version.id is null then
    raise exception 'PLAN_CHANGE_VERSION_NOT_FOUND';
  end if;

  if v_mode = 'schedule' then
    v_rollout_time := coalesce(p_rollout_at, now() + interval '1 hour');
    update public.plan_change_batches
    set status = 'scheduled',
        rollout_at = v_rollout_time
    where id = p_batch_id;

    insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
    values (
      v_actor_user_id,
      'plan_change_scheduled',
      'plan_change_batch',
      p_batch_id,
      jsonb_build_object('rollout_at', v_rollout_time, 'plan_id', v_batch.plan_id)
    );

    return jsonb_build_object('status', 'scheduled', 'batch_id', p_batch_id, 'rollout_at', v_rollout_time);
  end if;

  update public.plans
  set
    name = coalesce(v_version.plan_core_json->>'name', name),
    slug = coalesce(v_version.plan_core_json->>'slug', slug),
    description = coalesce(v_version.plan_core_json->>'description', description),
    display_order = coalesce((v_version.plan_core_json->>'display_order')::integer, display_order),
    trial_days = coalesce((v_version.plan_core_json->>'trial_days')::integer, trial_days),
    is_active = coalesce((v_version.plan_core_json->>'is_active')::boolean, is_active),
    is_recommended = coalesce((v_version.plan_core_json->>'is_recommended')::boolean, is_recommended)
  where id = v_batch.plan_id;

  if coalesce((v_version.plan_core_json->>'is_recommended')::boolean, false) then
    update public.plans
    set is_recommended = false
    where id <> v_batch.plan_id
      and is_recommended = true;
  end if;

  insert into public.plan_limits (
    plan_id,
    max_locations,
    max_staff,
    max_services,
    max_products,
    monthly_messages
  )
  values (
    v_batch.plan_id,
    coalesce((v_version.limits_json->>'max_locations')::integer, 1),
    coalesce((v_version.limits_json->>'max_staff')::integer, 1),
    nullif(v_version.limits_json->>'max_services', '')::integer,
    nullif(v_version.limits_json->>'max_products', '')::integer,
    coalesce((v_version.limits_json->>'monthly_messages')::integer, 30)
  )
  on conflict (plan_id) do update set
    max_locations = excluded.max_locations,
    max_staff = excluded.max_staff,
    max_services = excluded.max_services,
    max_products = excluded.max_products,
    monthly_messages = excluded.monthly_messages;

  if jsonb_typeof(v_version.change_summary_json->'features') = 'array' then
    delete from public.plan_features where plan_id = v_batch.plan_id;

    insert into public.plan_features (plan_id, feature_text, sort_order)
    select
      v_batch.plan_id,
      btrim(coalesce(value->>'feature_text', '')),
      coalesce((value->>'sort_order')::integer, 0)
    from jsonb_array_elements(v_version.change_summary_json->'features')
    where btrim(coalesce(value->>'feature_text', '')) <> '';
  end if;

  if jsonb_typeof(v_version.pricing_json) = 'array' then
    for v_currency, v_monthly, v_effective, v_annual in
      select
        upper(trim(value->>'currency')),
        (value->>'monthly_price')::numeric,
        (value->>'effective_monthly')::numeric,
        (value->>'annual_price')::numeric
      from jsonb_array_elements(v_version.pricing_json)
      where coalesce(value->>'currency', '') <> ''
    loop
      update public.plan_pricing
      set valid_until = now()
      where plan_id = v_batch.plan_id
        and currency = v_currency
        and valid_until is null;

      insert into public.plan_pricing (
        plan_id,
        currency,
        monthly_price,
        annual_price,
        effective_monthly
      )
      values (
        v_batch.plan_id,
        v_currency,
        v_monthly,
        v_annual,
        v_effective
      );
    end loop;
  end if;

  insert into public.plan_change_targets (batch_id, tenant_id, subscription_id)
  select
    p_batch_id,
    s.tenant_id,
    s.id
  from public.subscriptions s
  where s.plan_id = v_batch.plan_id
    and s.status in ('active', 'trialing', 'past_due', 'paused')
  on conflict (batch_id, tenant_id) do nothing;

  insert into public.plan_change_notifications (batch_id, tenant_id)
  select
    p_batch_id,
    t.tenant_id
  from public.plan_change_targets t
  where t.batch_id = p_batch_id
  on conflict (batch_id, tenant_id) do nothing;

  update public.plan_change_batches
  set status = 'rolled_out',
      rollout_at = coalesce(rollout_at, now()),
      rolled_out_at = now()
  where id = p_batch_id;

  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  values (
    v_actor_user_id,
    'plan_change_rolled_out',
    'plan_change_batch',
    p_batch_id,
    jsonb_build_object(
      'plan_id', v_batch.plan_id,
      'reason', v_batch.reason
    )
  );

  return jsonb_build_object('status', 'rolled_out', 'batch_id', p_batch_id);
end;
$$;

grant execute on function public.backoffice_apply_plan_change_batch(uuid, text, timestamptz) to authenticated;

create or replace function public.backoffice_create_plan_change_batch(
  p_plan_id uuid,
  p_reason text,
  p_plan_core_json jsonb,
  p_limits_json jsonb,
  p_pricing_json jsonb,
  p_change_summary_json jsonb,
  p_rollout_mode text default 'now',
  p_rollout_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_batch_id uuid;
begin
  if v_actor_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not public.has_backoffice_role(v_actor_user_id, 'super_admin'::backoffice_role) then
    raise exception 'BACKOFFICE_SUPER_ADMIN_REQUIRED';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'PLAN_CHANGE_REASON_REQUIRED';
  end if;

  insert into public.plan_change_batches (plan_id, created_by, reason, status)
  values (p_plan_id, v_actor_user_id, btrim(p_reason), 'draft')
  returning id into v_batch_id;

  insert into public.plan_change_versions (
    batch_id,
    plan_core_json,
    limits_json,
    pricing_json,
    change_summary_json
  )
  values (
    v_batch_id,
    coalesce(p_plan_core_json, '{}'::jsonb),
    coalesce(p_limits_json, '{}'::jsonb),
    coalesce(p_pricing_json, '[]'::jsonb),
    coalesce(p_change_summary_json, '{}'::jsonb)
  );

  perform public.backoffice_apply_plan_change_batch(v_batch_id, p_rollout_mode, p_rollout_at);

  return v_batch_id;
end;
$$;

grant execute on function public.backoffice_create_plan_change_batch(
  uuid,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  text,
  timestamptz
) to authenticated;

create or replace function public.process_due_scheduled_plan_batches()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch record;
  v_count integer := 0;
begin
  for v_batch in
    select id
    from public.plan_change_batches
    where status = 'scheduled'
      and rollout_at is not null
      and rollout_at <= now()
    order by rollout_at asc
  loop
    perform public.backoffice_apply_plan_change_batch(v_batch.id, 'now', null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function public.process_due_scheduled_plan_batches() to authenticated;

create or replace function public.get_tenant_plan_change_notifications(
  p_tenant_id uuid,
  p_limit integer default 20
)
returns table (
  notification_id uuid,
  batch_id uuid,
  plan_id uuid,
  reason text,
  rollout_at timestamptz,
  rolled_out_at timestamptz,
  created_at timestamptz,
  change_summary_json jsonb,
  seen_at timestamptz,
  cta_opened_at timestamptz,
  dismissed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and tenant_id = p_tenant_id
  ) then
    raise exception 'TENANT_ACCESS_DENIED';
  end if;

  return query
  select
    n.id as notification_id,
    b.id as batch_id,
    b.plan_id,
    b.reason,
    b.rollout_at,
    b.rolled_out_at,
    n.created_at,
    v.change_summary_json,
    n.seen_at,
    n.cta_opened_at,
    n.dismissed_at
  from public.plan_change_notifications n
  join public.plan_change_batches b on b.id = n.batch_id
  join lateral (
    select v1.change_summary_json
    from public.plan_change_versions v1
    where v1.batch_id = b.id
    order by v1.created_at desc
    limit 1
  ) v on true
  where n.tenant_id = p_tenant_id
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;

grant execute on function public.get_tenant_plan_change_notifications(uuid, integer) to authenticated;

create or replace function public.mark_plan_change_notification_seen(
  p_notification_id uuid,
  p_action text default 'seen'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text := lower(coalesce(p_action, 'seen'));
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  update public.plan_change_notifications n
  set
    seen_at = case when v_action in ('seen', 'opened', 'dismissed') then coalesce(n.seen_at, now()) else n.seen_at end,
    cta_opened_at = case when v_action = 'opened' then now() else n.cta_opened_at end,
    dismissed_at = case when v_action = 'dismissed' then now() else n.dismissed_at end
  where n.id = p_notification_id
    and n.tenant_id in (select get_user_tenant_ids(auth.uid()));

  return found;
end;
$$;

grant execute on function public.mark_plan_change_notification_seen(uuid, text) to authenticated;
