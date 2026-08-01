-- Promo-code trial-extension incentive: if a tenant applies a promo code
-- within `window_days` of their account being created, they get
-- `bonus_days` added to their trial on top of it. Configured via
-- platform_settings (edited from a new backoffice page), reusing the
-- existing claim_sales_promo_code() redemption flow — this only adds the
-- bonus-days step on top of it, it doesn't touch promo redemption itself.

insert into public.platform_settings (key, value)
values (
  'promo_trial_bonus',
  jsonb_build_object('enabled', true, 'window_days', 7, 'bonus_days', 7)
)
on conflict (key) do nothing;

alter table public.tenants
  add column if not exists trial_bonus_granted_at timestamptz;

create or replace function public.apply_promo_trial_bonus(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
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

  if not exists (
    select 1 from public.user_roles r
    where r.user_id = v_actor and r.tenant_id = p_tenant_id and coalesce(r.is_active, true)
  ) then
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
  v_bonus_days := coalesce((v_setting->>'bonus_days')::int, 7);

  if not v_enabled then
    return jsonb_build_object('granted', false, 'reason', 'disabled');
  end if;

  if v_tenant.created_at < now() - make_interval(days => v_window_days) then
    return jsonb_build_object('granted', false, 'reason', 'window_elapsed');
  end if;

  select exists (
    select 1 from public.sales_promo_redemptions r
    where r.tenant_id = p_tenant_id
      and r.status in ('claimed', 'finalized', 'provisional')
  ) into v_has_redemption;

  if not v_has_redemption then
    return jsonb_build_object('granted', false, 'reason', 'no_promo_applied');
  end if;

  update public.tenants
  set
    trial_ends_at = coalesce(trial_ends_at, now()) + make_interval(days => v_bonus_days),
    trial_bonus_granted_at = now()
  where id = p_tenant_id;

  return jsonb_build_object('granted', true, 'bonus_days', v_bonus_days);
end;
$$;

grant execute on function public.apply_promo_trial_bonus(uuid) to authenticated;
