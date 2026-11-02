-- Keep trial length changes consistent across plan configuration, new
-- onboarding tenants, and tenants that are already trialing.

alter table public.tenants
  add column if not exists trial_bonus_days integer not null default 0;

-- Older tenants only recorded that a bonus was granted, not its size. Seed
-- that legacy state from the current bonus setting so a later base-trial
-- update does not silently remove the bonus they already received.
update public.tenants t
set trial_bonus_days = coalesce(
  (
    select greatest(0, (ps.value->>'bonus_days')::int)
    from public.platform_settings ps
    where ps.key = 'promo_trial_bonus'
  ),
  7
)
where t.trial_bonus_granted_at is not null
  and t.trial_bonus_days = 0;

create or replace function public.apply_promo_trial_bonus(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor uuid := auth.uid();
  v_actor_role public.app_role;
  v_tenant public.tenants;
  v_setting jsonb;
  v_enabled boolean;
  v_window_days int;
  v_bonus_days int;
  v_has_redemption boolean;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select r.role into v_actor_role
  from public.user_roles r
  where r.user_id = v_actor
    and r.tenant_id = p_tenant_id
    and coalesce(r.is_active, true)
  order by case r.role when 'owner' then 1 when 'manager' then 2 else 3 end
  limit 1;

  if v_actor_role is null then
    raise exception 'FORBIDDEN';
  end if;

  if not public.tenant_user_allows_promo_trial_bonus(p_tenant_id, v_actor, v_actor_role) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_tenant from public.tenants where id = p_tenant_id;
  if v_tenant.id is null then
    return jsonb_build_object('granted', false, 'reason', 'tenant_not_found');
  end if;

  if v_tenant.trial_bonus_granted_at is not null then
    return jsonb_build_object('granted', false, 'reason', 'already_granted');
  end if;

  if v_tenant.subscription_status <> 'trialing' then
    return jsonb_build_object('granted', false, 'reason', 'not_trialing');
  end if;

  select value into v_setting from public.platform_settings where key = 'promo_trial_bonus';
  v_enabled := coalesce((v_setting->>'enabled')::boolean, true);
  v_window_days := coalesce((v_setting->>'window_days')::int, 7);
  v_bonus_days := greatest(0, coalesce((v_setting->>'bonus_days')::int, 7));

  if not v_enabled then
    return jsonb_build_object('granted', false, 'reason', 'disabled');
  end if;

  if v_tenant.created_at < now() - make_interval(days => v_window_days) then
    return jsonb_build_object('granted', false, 'reason', 'window_elapsed');
  end if;

  select exists (
    select 1
    from public.sales_promo_redemptions r
    where r.tenant_id = p_tenant_id
      and r.status in ('claimed', 'finalized', 'provisional')
  ) into v_has_redemption;

  if not v_has_redemption then
    return jsonb_build_object('granted', false, 'reason', 'no_promo_applied');
  end if;

  update public.tenants
  set
    trial_ends_at = coalesce(trial_ends_at, now()) + make_interval(days => v_bonus_days),
    trial_bonus_days = v_bonus_days,
    trial_bonus_granted_at = now()
  where id = p_tenant_id;

  return jsonb_build_object('granted', true, 'bonus_days', v_bonus_days);
end;
$function$;

grant execute on function public.apply_promo_trial_bonus(uuid) to authenticated;

-- This RPC is also used by the Backoffice global trial setting. Preserve any
-- bonus already granted while changing only the base trial period.
create or replace function public.extend_trialing_tenants_trial(p_days int)
returns void
language sql
security definer
set search_path = public
as $function$
  update public.tenants t
  set trial_ends_at = t.created_at + make_interval(
    days => greatest(0, coalesce(p_days, 0)) + greatest(0, coalesce(t.trial_bonus_days, 0))
  )
  where t.subscription_status = 'trialing';
$function$;

revoke execute on function public.extend_trialing_tenants_trial(int) from public, anon, authenticated;
grant execute on function public.extend_trialing_tenants_trial(int) to authenticated;

-- Plan edits are the source of truth for new signups. Keep current trialing
-- tenants on that plan aligned too, while retaining their granted bonus.
create or replace function public.sync_trialing_tenants_after_plan_trial_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if old.trial_days is distinct from new.trial_days
     or old.slug is distinct from new.slug then
    update public.tenants t
    set trial_ends_at = t.created_at + make_interval(
      days => greatest(0, coalesce(new.trial_days, 0)) + greatest(0, coalesce(t.trial_bonus_days, 0))
    )
    where t.subscription_status = 'trialing'
      and lower(t.plan::text) in (lower(old.slug), lower(new.slug));
  end if;
  return new;
end;
$function$;

drop trigger if exists sync_trialing_tenants_after_plan_trial_change on public.plans;
create trigger sync_trialing_tenants_after_plan_trial_change
after update of slug, trial_days on public.plans
for each row
execute function public.sync_trialing_tenants_after_plan_trial_change();
