-- Two bugs found after the schedule feature got real use:
--
-- 1. plan_pricing.valid_from defaults to now(), which is FROZEN for the entire
--    transaction in Postgres (not per-statement). When process_due_scheduled_plan_batches
--    applies two due batches for the same plan+currency in one cron tick, both inserts
--    get the identical valid_from, violating the (plan_id, currency, valid_from) unique
--    constraint. Fix: insert with clock_timestamp(), which actually advances per call.
--
-- 2. That failure wasn't caught, so it rolled back the WHOLE cron run — including any
--    other due batches that would have applied cleanly — and the same failing batches
--    just kept retrying every 5 minutes forever. Fix: wrap each batch in its own
--    exception handler so one bad batch can't block the rest, and record the failure.

alter table public.plan_change_batches
  drop constraint if exists plan_change_batches_status_check;
alter table public.plan_change_batches
  add constraint plan_change_batches_status_check
  check (status in ('draft', 'scheduled', 'rolled_out', 'cancelled', 'failed'));

alter table public.plan_change_batches
  add column if not exists last_error text;

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
  v_existing_code_monthly text;
  v_existing_code_annual text;
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
      select paystack_plan_code_monthly, paystack_plan_code_annual
      into v_existing_code_monthly, v_existing_code_annual
      from public.plan_pricing
      where plan_id = v_batch.plan_id
        and currency = v_currency
        and valid_until is null;

      update public.plan_pricing
      set valid_until = clock_timestamp()
      where plan_id = v_batch.plan_id
        and currency = v_currency
        and valid_until is null;

      insert into public.plan_pricing (
        plan_id,
        currency,
        monthly_price,
        annual_price,
        effective_monthly,
        paystack_plan_code_monthly,
        paystack_plan_code_annual,
        valid_from
      )
      values (
        v_batch.plan_id,
        v_currency,
        v_monthly,
        v_annual,
        v_effective,
        v_existing_code_monthly,
        v_existing_code_annual,
        clock_timestamp()
      );

      v_existing_code_monthly := null;
      v_existing_code_annual := null;
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
      rolled_out_at = now(),
      last_error = null
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

-- One bad batch can no longer block every other due batch, and failures are recorded
-- instead of retrying forever.
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
    begin
      perform public._apply_plan_change_batch_internal(v_batch.id, v_batch.created_by, 'now', null);
      v_count := v_count + 1;
    exception when others then
      update public.plan_change_batches
      set status = 'failed',
          last_error = sqlerrm
      where id = v_batch.id;
    end;
  end loop;
  return v_count;
end;
$$;
