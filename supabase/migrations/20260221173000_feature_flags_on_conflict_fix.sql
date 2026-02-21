-- Ensure feature_flags has a concrete unique constraint for RPC upserts.
-- A partial unique index cannot always be inferred by ON CONFLICT(feature_id).

with ranked as (
  select
    id,
    feature_id,
    row_number() over (
      partition by feature_id
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as rn
  from public.feature_flags
  where feature_id is not null
)
delete from public.feature_flags ff
using ranked r
where ff.id = r.id
  and r.rn > 1;

drop index if exists public.idx_feature_flags_feature_id_unique;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.feature_flags'::regclass
      and conname = 'feature_flags_feature_id_unique'
  ) then
    alter table public.feature_flags
      add constraint feature_flags_feature_id_unique unique (feature_id);
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
  on conflict on constraint feature_flags_feature_id_unique do update
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
