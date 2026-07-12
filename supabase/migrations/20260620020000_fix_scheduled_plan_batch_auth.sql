-- backoffice_apply_plan_change_batch requires auth.uid() to be an active super_admin.
-- That's correct when a human calls it directly, but process_due_scheduled_plan_batches()
-- is invoked by pg_cron, which has no authenticated session — auth.uid() is null there,
-- so every scheduled rollout would fail with AUTH_REQUIRED and silently never apply.
--
-- Fix: move the actual apply logic into an internal function that skips the actor check,
-- and have process_due_scheduled_plan_batches call that directly (authorization already
-- happened when the batch was scheduled by a super admin in the first place).

create or replace function public._apply_plan_change_batch_internal(
  p_batch_id uuid,
  p_actor_user_id uuid,
  p_rollout_mode text default 'now',
  p_rollout_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.plan_change_batches%rowtype;
  v_version public.plan_change_versions%rowtype;
  v_mode text := lower(coalesce(p_rollout_mode, 'now'));
  v_rollout_time timestamptz;
  v_currency text;
  v_monthly numeric;
  v_effective numeric;
  v_annual numeric;
begin
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
      p_actor_user_id,
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
    p_actor_user_id,
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

-- Public-facing RPC: requires a real authenticated super admin.
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
begin
  if v_actor_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not public.has_backoffice_role(v_actor_user_id, 'super_admin'::backoffice_role) then
    raise exception 'BACKOFFICE_SUPER_ADMIN_REQUIRED';
  end if;

  return public._apply_plan_change_batch_internal(p_batch_id, v_actor_user_id, p_rollout_mode, p_rollout_at);
end;
$$;

grant execute on function public.backoffice_apply_plan_change_batch(uuid, text, timestamptz) to authenticated;

-- System-facing: invoked by pg_cron, no authenticated session exists.
-- Authorization already happened when the batch was scheduled by a super admin;
-- this just executes the already-approved change once its go-live date arrives.
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
    select id, created_by
    from public.plan_change_batches
    where status = 'scheduled'
      and rollout_at is not null
      and rollout_at <= now()
    order by rollout_at asc
  loop
    perform public._apply_plan_change_batch_internal(v_batch.id, v_batch.created_by, 'now', null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function public.process_due_scheduled_plan_batches() to authenticated;
