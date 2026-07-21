-- Fix "column reference feature_key is ambiguous" in backoffice_set_marketing_feature_toggle.
-- The function returns table(feature_key text, ...) which creates an implicit PL/pgSQL
-- output variable named feature_key.  The unqualified column references in the SELECT and
-- WHERE against platform_features clash with that variable.  Qualifying them with a table
-- alias resolves the ambiguity.

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

  -- Qualify pf.feature_key to avoid ambiguity with the returns-table output variable.
  select pf.id, pf.feature_key, pf.description
  into v_feature
  from public.platform_features pf
  where lower(pf.feature_key) = lower(trim(p_feature_key))
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
