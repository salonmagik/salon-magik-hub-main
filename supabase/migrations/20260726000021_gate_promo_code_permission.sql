-- Neither claim_sales_promo_code nor apply_promo_trial_bonus checked role at
-- all — any active team member, including receptionist/staff, could apply
-- an arbitrary promo code and trigger a billing-adjacent trial extension
-- with zero owner awareness or consent. This isn't the same fraud shape as
-- the single-owner-per-tenant fix (the bonus is still capped once per real
-- tenant, so nobody can multiply it) — it's a permission gap: a low-trust
-- role touching what's effectively a subscription decision.
--
-- Scoped to owner + manager by default, matching usePermissions.tsx's
-- DEFAULT_ROLE_PERMISSIONS. The owner can toggle it off for manager (or
-- override it per-user) from the existing Roles & Permissions UI —
-- StaffPage.tsx already renders a toggle for any module present in
-- MODULE_LABELS, so registering "promo_trial_bonus" there was enough to
-- surface the control; this migration is what actually enforces it.
create or replace function public.tenant_user_allows_promo_trial_bonus(
  p_tenant_id uuid,
  p_user_id uuid,
  p_role public.app_role
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed boolean;
begin
  if p_role = 'owner' then
    return true;
  end if;

  -- Per-user override takes precedence, matching usePermissions.tsx's
  -- hasPermission() precedence (user override > role permission > default).
  select allowed into v_allowed
  from public.user_permission_overrides
  where tenant_id = p_tenant_id and user_id = p_user_id and module = 'promo_trial_bonus';
  if v_allowed is not null then
    return v_allowed;
  end if;

  select allowed into v_allowed
  from public.role_permissions
  where tenant_id = p_tenant_id and role = p_role and module = 'promo_trial_bonus';
  if v_allowed is not null then
    return v_allowed;
  end if;

  return p_role = 'manager';
end;
$$;

grant execute on function public.tenant_user_allows_promo_trial_bonus(uuid, uuid, public.app_role) to authenticated;

create or replace function public.apply_promo_trial_bonus(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
  where r.user_id = v_actor and r.tenant_id = p_tenant_id and coalesce(r.is_active, true)
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

-- claim_sales_promo_code also has surfaced variants (p_surface =
-- 'subscription' | 'credits') that are already gated by their own
-- user_has_module_access('payments'/'messaging') checks — deliberately not
-- touching those. This only adds the same promo_trial_bonus gate to the
-- surfaceless call ApplyPromoCodeDialog actually uses.
create or replace function public.claim_sales_promo_code(
  p_code text,
  p_tenant_id uuid,
  p_surface text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role public.app_role;
  v_email text;
  v_promo public.sales_promo_codes;
  v_campaign public.sales_promo_campaigns;
  v_existing public.sales_promo_redemptions;
  v_conflicting_count integer;
  v_required_module text;
begin
  if v_actor is null then
    return jsonb_build_object('success', false, 'message', 'Authentication required');
  end if;

  select lower(trim(coalesce(email, '')))
  into v_email
  from auth.users
  where id = v_actor;

  select r.role into v_actor_role
  from public.user_roles r
  where r.user_id = v_actor and r.tenant_id = p_tenant_id and coalesce(r.is_active, true)
  order by case r.role when 'owner' then 1 when 'manager' then 2 else 3 end
  limit 1;

  if v_actor_role is null then
    return jsonb_build_object('success', false, 'message', 'You do not have access to this tenant');
  end if;

  if p_surface is null
     and not public.tenant_user_allows_promo_trial_bonus(p_tenant_id, v_actor, v_actor_role) then
    return jsonb_build_object('success', false, 'message', 'You do not have permission to apply a promo code for this salon');
  end if;

  if p_surface is not null and p_surface not in ('subscription', 'credits') then
    return jsonb_build_object('success', false, 'message', 'Unsupported promo surface');
  end if;

  if p_surface is not null then
    v_required_module := case
      when p_surface = 'subscription' then 'payments'
      when p_surface = 'credits' then 'messaging'
      else null
    end;

    if v_required_module is not null
       and not public.user_has_module_access(v_actor, p_tenant_id, v_required_module) then
      return jsonb_build_object('success', false, 'message', 'You do not have permission to claim a promo for this billing surface');
    end if;
  end if;

  select * into v_promo
  from public.sales_promo_codes
  where upper(code) = upper(trim(coalesce(p_code, '')));

  if v_promo.id is null then
    return jsonb_build_object('success', false, 'message', 'Invalid promo code');
  end if;

  select * into v_campaign
  from public.sales_promo_campaigns
  where id = v_promo.campaign_id;

  if v_campaign.id is null or v_campaign.is_active is not true or v_campaign.ends_at <= now() then
    return jsonb_build_object('success', false, 'message', 'This promo campaign is no longer active');
  end if;

  if v_promo.invalidated_at is not null or v_promo.status in ('invalidated', 'cancelled', 'expired', 'redeemed', 'consumed') then
    return jsonb_build_object('success', false, 'message', 'This promo code is no longer valid');
  end if;

  if lower(trim(coalesce(v_promo.target_email, ''))) <> v_email then
    return jsonb_build_object('success', false, 'message', 'This promo code is reserved for a different email address');
  end if;

  select count(*)
  into v_conflicting_count
  from public.sales_promo_redemptions r
  join public.sales_promo_codes pc on pc.id = r.promo_code_id
  join public.sales_promo_campaigns c on c.id = pc.campaign_id
  where r.tenant_id = p_tenant_id
    and r.status in ('claimed', 'provisional', 'finalized')
    and r.remaining_uses > 0
    and coalesce(r.invalidated_at, pc.invalidated_at) is null
    and c.ends_at > now();

  if v_conflicting_count > 0 and coalesce(v_promo.claimed_tenant_id, p_tenant_id) <> p_tenant_id then
    return jsonb_build_object('success', false, 'message', 'This tenant already has an active promo code');
  end if;

  if v_promo.claimed_tenant_id is not null and v_promo.claimed_tenant_id <> p_tenant_id then
    return jsonb_build_object('success', false, 'message', 'This promo code has already been claimed by another salon');
  end if;

  select * into v_existing
  from public.sales_promo_redemptions
  where promo_code_id = v_promo.id;

  if v_existing.id is null then
    insert into public.sales_promo_redemptions (
      promo_code_id,
      tenant_id,
      owner_user_id,
      owner_email,
      email_match,
      discount_snapshot,
      trial_extension_days,
      status,
      provider_reference,
      claimed_by_user_id,
      claimed_at,
      max_uses,
      uses_consumed,
      remaining_uses,
      billing_targets
    )
    values (
      v_promo.id,
      p_tenant_id,
      v_actor,
      v_email,
      true,
      jsonb_build_object(
        'discount_type', v_campaign.discount_type,
        'discount_value', v_campaign.discount_value,
        'campaign_name', v_campaign.name
      ),
      coalesce(v_campaign.trial_extension_days, 0),
      'claimed',
      null,
      v_actor,
      now(),
      greatest(v_campaign.max_uses_per_tenant, 1),
      0,
      greatest(v_campaign.max_uses_per_tenant, 1),
      v_campaign.billing_targets
    )
    returning * into v_existing;
  else
    update public.sales_promo_redemptions
    set
      tenant_id = p_tenant_id,
      owner_user_id = coalesce(owner_user_id, v_actor),
      owner_email = v_email,
      email_match = true,
      status = case when remaining_uses > 0 then 'claimed' else status end,
      claimed_by_user_id = coalesce(claimed_by_user_id, v_actor),
      claimed_at = coalesce(claimed_at, now()),
      max_uses = greatest(v_campaign.max_uses_per_tenant, 1),
      remaining_uses = greatest(v_campaign.max_uses_per_tenant - uses_consumed, 0),
      billing_targets = v_campaign.billing_targets
    where id = v_existing.id
    returning * into v_existing;
  end if;

  update public.sales_promo_codes
  set
    status = case when v_existing.remaining_uses > 0 then 'claimed' else 'consumed' end,
    claimed_tenant_id = p_tenant_id,
    claimed_by_user_id = coalesce(claimed_by_user_id, v_actor),
    claimed_at = coalesce(claimed_at, now())
  where id = v_promo.id;

  return jsonb_build_object(
    'success', true,
    'promo_code_id', v_promo.id,
    'campaign_name', v_campaign.name,
    'discount_type', v_campaign.discount_type,
    'discount_value', v_campaign.discount_value,
    'billing_targets', v_campaign.billing_targets,
    'remaining_uses', v_existing.remaining_uses,
    'campaign_ends_at', v_campaign.ends_at
  );
end;
$$;

grant execute on function public.claim_sales_promo_code(text, uuid, text) to authenticated;
