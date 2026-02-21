-- Feature flag conflicts + secure write RPCs with fresh step-up challenge enforcement.

create table if not exists public.feature_flag_conflicts (
  feature_id uuid not null references public.platform_features(id) on delete cascade,
  conflicting_feature_id uuid not null references public.platform_features(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (feature_id, conflicting_feature_id),
  constraint feature_flag_conflicts_not_self check (feature_id <> conflicting_feature_id)
);

alter table public.feature_flag_conflicts enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'feature_flag_conflicts'
      and policyname = 'Backoffice can read feature flag conflicts'
  ) then
    create policy "Backoffice can read feature flag conflicts"
      on public.feature_flag_conflicts
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
      and tablename = 'feature_flag_conflicts'
      and policyname = 'Backoffice super admins can manage feature flag conflicts'
  ) then
    create policy "Backoffice super admins can manage feature flag conflicts"
      on public.feature_flag_conflicts
      for all
      to authenticated
      using (has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role))
      with check (has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role));
  end if;
end $$;

insert into public.feature_flag_conflicts (feature_id, conflicting_feature_id, reason)
select f1.id, f2.id, 'Exclusive access waitlist and other-countries interest cannot be enabled together.'
from public.platform_features f1
join public.platform_features f2
  on lower(f1.feature_key) = 'waitlist_enabled'
 and lower(f2.feature_key) = 'other_countries_interest_enabled'
on conflict do nothing;

insert into public.feature_flag_conflicts (feature_id, conflicting_feature_id, reason)
select f2.id, f1.id, 'Exclusive access waitlist and other-countries interest cannot be enabled together.'
from public.platform_features f1
join public.platform_features f2
  on lower(f1.feature_key) = 'waitlist_enabled'
 and lower(f2.feature_key) = 'other_countries_interest_enabled'
on conflict do nothing;

create or replace function public.consume_backoffice_step_up_challenge(
  p_challenge_id uuid,
  p_action text,
  p_resource_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_used_id uuid;
begin
  if v_actor_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_challenge_id is null then
    raise exception 'STEP_UP_REQUIRED';
  end if;

  update public.backoffice_step_up_challenges
  set used_at = now()
  where id = p_challenge_id
    and user_id = v_actor_user_id
    and action = p_action
    and resource_id = p_resource_id
    and used_at is null
    and expires_at > now()
  returning id into v_used_id;

  if v_used_id is null then
    raise exception 'STEP_UP_REQUIRED';
  end if;
end;
$$;

create or replace function public.backoffice_upsert_feature_master_toggle(
  p_feature_id uuid,
  p_scope feature_flag_scope,
  p_is_enabled boolean,
  p_reason text,
  p_schedule_start timestamptz,
  p_schedule_end timestamptz,
  p_challenge_id uuid
)
returns public.feature_flags
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_feature record;
  v_conflict record;
  v_row public.feature_flags;
begin
  if v_actor_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not has_backoffice_role(v_actor_user_id, 'super_admin'::backoffice_role) then
    raise exception 'BACKOFFICE_SUPER_ADMIN_REQUIRED';
  end if;

  select id, feature_key, display_name, description
  into v_feature
  from public.platform_features
  where id = p_feature_id;

  if not found then
    raise exception 'FEATURE_NOT_FOUND';
  end if;

  perform public.consume_backoffice_step_up_challenge(
    p_challenge_id,
    'feature_flag_write',
    p_feature_id
  );

  if p_is_enabled then
    select
      pf.feature_key as conflicting_key,
      coalesce(fc.reason, 'Conflicting flag is already active.') as reason
    into v_conflict
    from public.feature_flag_conflicts fc
    join public.feature_flags ff
      on ff.feature_id = fc.conflicting_feature_id
     and ff.is_enabled = true
    join public.platform_features pf
      on pf.id = fc.conflicting_feature_id
    where fc.feature_id = p_feature_id
    limit 1;

    if found then
      raise exception 'FEATURE_FLAG_CONFLICT'
        using detail = v_conflict.conflicting_key,
              hint = v_conflict.reason;
    end if;
  end if;

  insert into public.feature_flags (
    name,
    feature_id,
    description,
    scope,
    is_enabled,
    reason,
    schedule_start,
    schedule_end,
    created_by_id
  )
  values (
    v_feature.feature_key,
    v_feature.id,
    v_feature.description,
    coalesce(p_scope, 'feature'::feature_flag_scope),
    coalesce(p_is_enabled, false),
    nullif(btrim(coalesce(p_reason, '')), ''),
    p_schedule_start,
    p_schedule_end,
    v_actor_user_id
  )
  on conflict (feature_id) do update
  set
    scope = excluded.scope,
    is_enabled = excluded.is_enabled,
    reason = excluded.reason,
    schedule_start = excluded.schedule_start,
    schedule_end = excluded.schedule_end,
    updated_at = now()
  returning * into v_row;

  insert into public.audit_logs (
    action,
    entity_type,
    entity_id,
    actor_user_id,
    metadata
  )
  values (
    'feature_master_toggle_upserted',
    'feature_flags',
    v_row.id,
    v_actor_user_id,
    jsonb_build_object(
      'feature_id', p_feature_id,
      'feature_key', v_feature.feature_key,
      'is_enabled', p_is_enabled,
      'scope', p_scope
    )
  );

  return v_row;
end;
$$;

create or replace function public.backoffice_create_feature_rule(
  p_feature_id uuid,
  p_environment text,
  p_app_name text,
  p_version_range text,
  p_country_codes text[],
  p_priority integer,
  p_is_enabled boolean,
  p_reason text,
  p_schedule_start timestamptz,
  p_schedule_end timestamptz,
  p_challenge_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_rule_id uuid;
  v_conflict record;
begin
  if v_actor_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not has_backoffice_role(v_actor_user_id, 'super_admin'::backoffice_role) then
    raise exception 'BACKOFFICE_SUPER_ADMIN_REQUIRED';
  end if;

  perform public.consume_backoffice_step_up_challenge(
    p_challenge_id,
    'feature_flag_write',
    p_feature_id
  );

  if coalesce(p_is_enabled, false) then
    select
      pf.feature_key as conflicting_key,
      coalesce(fc.reason, 'Conflicting flag is already active.') as reason
    into v_conflict
    from public.feature_flag_conflicts fc
    join public.feature_flags ff
      on ff.feature_id = fc.conflicting_feature_id
     and ff.is_enabled = true
    join public.platform_features pf
      on pf.id = fc.conflicting_feature_id
    where fc.feature_id = p_feature_id
    limit 1;

    if found then
      raise exception 'FEATURE_FLAG_CONFLICT'
        using detail = v_conflict.conflicting_key,
              hint = v_conflict.reason;
    end if;
  end if;

  insert into public.feature_flag_rules (
    feature_id,
    environment,
    app_name,
    version_range,
    country_codes,
    priority,
    is_enabled,
    reason,
    schedule_start,
    schedule_end,
    created_by
  )
  values (
    p_feature_id,
    p_environment,
    p_app_name,
    nullif(btrim(coalesce(p_version_range, '')), ''),
    p_country_codes,
    coalesce(p_priority, 100),
    coalesce(p_is_enabled, false),
    nullif(btrim(coalesce(p_reason, '')), ''),
    p_schedule_start,
    p_schedule_end,
    v_actor_user_id
  )
  returning id into v_rule_id;

  insert into public.audit_logs (
    action,
    entity_type,
    entity_id,
    actor_user_id,
    metadata
  )
  values (
    'feature_rule_created',
    'feature_flag_rules',
    v_rule_id,
    v_actor_user_id,
    jsonb_build_object(
      'feature_id', p_feature_id,
      'environment', p_environment,
      'app_name', p_app_name,
      'priority', coalesce(p_priority, 100),
      'is_enabled', coalesce(p_is_enabled, false)
    )
  );

  return v_rule_id;
end;
$$;

create or replace function public.backoffice_delete_feature_rule(
  p_rule_id uuid,
  p_challenge_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_rule record;
begin
  if v_actor_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not has_backoffice_role(v_actor_user_id, 'super_admin'::backoffice_role) then
    raise exception 'BACKOFFICE_SUPER_ADMIN_REQUIRED';
  end if;

  select *
  into v_rule
  from public.feature_flag_rules
  where id = p_rule_id;

  if not found then
    raise exception 'FEATURE_RULE_NOT_FOUND';
  end if;

  perform public.consume_backoffice_step_up_challenge(
    p_challenge_id,
    'feature_flag_write',
    p_rule_id
  );

  delete from public.feature_flag_rules
  where id = p_rule_id;

  insert into public.audit_logs (
    action,
    entity_type,
    entity_id,
    actor_user_id,
    metadata
  )
  values (
    'feature_rule_deleted',
    'feature_flag_rules',
    p_rule_id,
    v_actor_user_id,
    jsonb_build_object(
      'feature_id', v_rule.feature_id,
      'environment', v_rule.environment,
      'app_name', v_rule.app_name
    )
  );
end;
$$;

grant execute on function public.consume_backoffice_step_up_challenge(uuid, text, uuid) to authenticated;
grant execute on function public.backoffice_upsert_feature_master_toggle(uuid, feature_flag_scope, boolean, text, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.backoffice_create_feature_rule(uuid, text, text, text, text[], integer, boolean, text, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.backoffice_delete_feature_rule(uuid, uuid) to authenticated;
