-- Atomic backoffice plan update with mandatory audit logging.
-- If any step fails (including audit insertion), the entire update is rolled back.

create unique index if not exists idx_plan_features_plan_feature_text_ci_unique
  on public.plan_features (plan_id, lower(btrim(feature_text)));

create or replace function public.backoffice_update_plan_with_features(
  p_plan_id uuid,
  p_name text,
  p_slug text,
  p_description text,
  p_display_order integer,
  p_trial_days integer,
  p_is_active boolean,
  p_is_recommended boolean,
  p_max_locations integer,
  p_max_staff integer,
  p_max_services integer,
  p_max_products integer,
  p_monthly_messages integer,
  p_features jsonb,
  p_reason text
)
returns uuid
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

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'PLAN_UPDATE_REASON_REQUIRED';
  end if;

  if p_features is null or jsonb_typeof(p_features) <> 'array' then
    raise exception 'PLAN_FEATURES_PAYLOAD_INVALID';
  end if;

  if p_is_recommended then
    update public.plans
    set is_recommended = false
    where id <> p_plan_id
      and is_recommended = true;
  end if;

  update public.plans
  set
    name = p_name,
    slug = p_slug,
    description = nullif(btrim(coalesce(p_description, '')), ''),
    display_order = p_display_order,
    trial_days = p_trial_days,
    is_active = p_is_active,
    is_recommended = p_is_recommended
  where id = p_plan_id;

  if not found then
    raise exception 'PLAN_NOT_FOUND';
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
    p_plan_id,
    p_max_locations,
    p_max_staff,
    p_max_services,
    p_max_products,
    p_monthly_messages
  )
  on conflict (plan_id) do update set
    max_locations = excluded.max_locations,
    max_staff = excluded.max_staff,
    max_services = excluded.max_services,
    max_products = excluded.max_products,
    monthly_messages = excluded.monthly_messages;

  delete from public.plan_features
  where plan_id = p_plan_id;

  insert into public.plan_features (plan_id, feature_text, sort_order)
  select
    p_plan_id,
    btrim(value->>'feature_text'),
    coalesce((value->>'sort_order')::integer, 0)
  from jsonb_array_elements(p_features)
  where btrim(coalesce(value->>'feature_text', '')) <> '';

  insert into public.audit_logs (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_actor_user_id,
    'plan_updated',
    'plan',
    p_plan_id,
    jsonb_build_object(
      'reason', p_reason,
      'name', p_name,
      'slug', p_slug,
      'is_active', p_is_active,
      'is_recommended', p_is_recommended,
      'display_order', p_display_order
    )
  );

  return p_plan_id;
end;
$$;

grant execute on function public.backoffice_update_plan_with_features(
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  boolean,
  boolean,
  integer,
  integer,
  integer,
  integer,
  integer,
  jsonb,
  text
) to authenticated;
