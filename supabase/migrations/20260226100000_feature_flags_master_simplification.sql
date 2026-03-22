-- Permanent feature-flag simplification for MVP marketing behavior.
-- Removes rollout-rule machinery and makes platform_features.master_enabled the canonical source.

alter table public.platform_features
  add column if not exists master_enabled boolean;

update public.platform_features pf
set master_enabled = coalesce(
  (
    select f.is_enabled
    from public.feature_flags f
    where f.feature_id = pf.id
    order by f.updated_at desc nulls last
    limit 1
  ),
  pf.default_enabled,
  false
)
where pf.master_enabled is null;

update public.platform_features
set master_enabled = coalesce(master_enabled, false)
where master_enabled is null;

alter table public.platform_features
  alter column master_enabled set default false,
  alter column master_enabled set not null;

-- Rollout/rule system hard removal.
drop function if exists public.backoffice_create_feature_rule(uuid, text, text, text, text[], integer, boolean, text, timestamptz, timestamptz, uuid);
drop function if exists public.backoffice_delete_feature_rule(uuid, uuid);
drop function if exists public.evaluate_feature_flag(text, text, text, text, text, uuid, uuid);
drop function if exists public.semver_matches_range(text, text);
drop table if exists public.feature_flag_conflicts cascade;
drop table if exists public.feature_flag_rules cascade;

-- Public read RPC for marketing app.
create or replace function public.get_marketing_feature_toggles()
returns table (
  waitlist_enabled boolean,
  other_countries_interest_enabled boolean,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(
      (
        select pf.master_enabled
        from public.platform_features pf
        where lower(pf.feature_key) = 'waitlist_enabled'
          and pf.status <> 'deprecated'
        limit 1
      ),
      false
    ) as waitlist_enabled,
    coalesce(
      (
        select pf.master_enabled
        from public.platform_features pf
        where lower(pf.feature_key) = 'other_countries_interest_enabled'
          and pf.status <> 'deprecated'
        limit 1
      ),
      false
    ) as other_countries_interest_enabled,
    greatest(
      coalesce((select max(updated_at) from public.platform_features where lower(feature_key) in ('waitlist_enabled', 'other_countries_interest_enabled')), now()),
      coalesce((select max(updated_at) from public.feature_flags where lower(name) in ('waitlist_enabled', 'other_countries_interest_enabled')), now())
    ) as updated_at;
$$;

grant execute on function public.get_marketing_feature_toggles() to anon, authenticated;

-- Backoffice write RPC (2FA challenge required).
create or replace function public.backoffice_set_marketing_feature_toggle(
  p_feature_key text,
  p_enabled boolean,
  p_reason text,
  p_challenge_id uuid
)
returns table (
  feature_key text,
  master_enabled boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_feature record;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_actor_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not has_backoffice_role(v_actor_user_id, 'super_admin'::backoffice_role) then
    raise exception 'BACKOFFICE_SUPER_ADMIN_REQUIRED';
  end if;

  if lower(trim(coalesce(p_feature_key, ''))) not in ('waitlist_enabled', 'other_countries_interest_enabled') then
    raise exception 'UNSUPPORTED_MARKETING_FEATURE';
  end if;

  select id, feature_key, description
  into v_feature
  from public.platform_features
  where lower(feature_key) = lower(trim(p_feature_key))
  limit 1;

  if v_feature.id is null then
    raise exception 'FEATURE_NOT_FOUND';
  end if;

  perform public.consume_backoffice_step_up_challenge(
    p_challenge_id,
    'feature_flag_write',
    v_feature.id
  );

  update public.platform_features
  set
    master_enabled = coalesce(p_enabled, false),
    updated_at = now()
  where id = v_feature.id;

  insert into public.feature_flags (
    name,
    feature_id,
    description,
    scope,
    is_enabled,
    reason,
    created_by_id
  )
  values (
    v_feature.feature_key,
    v_feature.id,
    v_feature.description,
    'feature'::public.feature_flag_scope,
    coalesce(p_enabled, false),
    v_reason,
    v_actor_user_id
  )
  on conflict on constraint feature_flags_feature_id_unique do update
  set
    scope = 'feature'::public.feature_flag_scope,
    is_enabled = excluded.is_enabled,
    reason = excluded.reason,
    updated_at = now();

  insert into public.audit_logs (
    action,
    entity_type,
    entity_id,
    actor_user_id,
    metadata
  )
  values (
    'marketing_feature_toggle_set',
    'platform_features',
    v_feature.id,
    v_actor_user_id,
    jsonb_build_object(
      'feature_key', v_feature.feature_key,
      'enabled', coalesce(p_enabled, false),
      'reason', v_reason
    )
  );

  return query
  select
    pf.feature_key,
    pf.master_enabled,
    pf.updated_at
  from public.platform_features pf
  where pf.id = v_feature.id;
end;
$$;

grant execute on function public.backoffice_set_marketing_feature_toggle(text, boolean, text, uuid) to authenticated;

-- Compatibility: old reader now returns canonical master toggle.
create or replace function public.get_feature_master_state(
  p_feature_key text
)
returns table (
  feature_key text,
  enabled boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pf.feature_key,
    coalesce(pf.master_enabled, false) as enabled
  from public.platform_features pf
  where lower(pf.feature_key) = lower(trim(p_feature_key))
    and pf.status <> 'deprecated'
  limit 1;
$$;

grant execute on function public.get_feature_master_state(text) to anon, authenticated;

-- Compatibility: old writer ignores rollout complexity and uses canonical master toggle semantics.
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
  v_row public.feature_flags;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_actor_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not has_backoffice_role(v_actor_user_id, 'super_admin'::backoffice_role) then
    raise exception 'BACKOFFICE_SUPER_ADMIN_REQUIRED';
  end if;

  select id, feature_key, description
  into v_feature
  from public.platform_features
  where id = p_feature_id;

  if v_feature.id is null then
    raise exception 'FEATURE_NOT_FOUND';
  end if;

  perform public.consume_backoffice_step_up_challenge(
    p_challenge_id,
    'feature_flag_write',
    v_feature.id
  );

  update public.platform_features
  set
    master_enabled = coalesce(p_is_enabled, false),
    updated_at = now()
  where id = v_feature.id;

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
    'feature'::public.feature_flag_scope,
    coalesce(p_is_enabled, false),
    v_reason,
    p_schedule_start,
    p_schedule_end,
    v_actor_user_id
  )
  on conflict on constraint feature_flags_feature_id_unique do update
  set
    scope = 'feature'::public.feature_flag_scope,
    is_enabled = excluded.is_enabled,
    reason = excluded.reason,
    schedule_start = excluded.schedule_start,
    schedule_end = excluded.schedule_end,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.backoffice_upsert_feature_master_toggle(uuid, feature_flag_scope, boolean, text, timestamptz, timestamptz, uuid) to authenticated;
