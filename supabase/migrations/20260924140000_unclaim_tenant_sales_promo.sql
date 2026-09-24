-- Lets a tenant remove/"unclaim" their own currently-applied sales promo
-- code, mirroring claim_sales_promo_code's tenant-self-service access
-- pattern (not the super-admin-only invalidate_sales_promo_code path).
-- Unlike invalidate_sales_promo_code, this reverts the underlying code back
-- to 'active' and clears its claim, so the same code can be re-applied
-- later (by this tenant or, since target_email already scopes eligibility,
-- whoever it's reserved for) — a true unclaim, not a permanent burn.
create or replace function public.unclaim_tenant_sales_promo(
  p_tenant_id uuid,
  p_surface text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_required_module text;
  v_redemption public.sales_promo_redemptions;
  v_promo public.sales_promo_codes;
begin
  if v_actor is null then
    return jsonb_build_object('success', false, 'message', 'Authentication required');
  end if;

  if not exists (
    select 1
    from public.user_roles
    where user_id = v_actor
      and tenant_id = p_tenant_id
      and is_active = true
  ) then
    return jsonb_build_object('success', false, 'message', 'You do not have access to this tenant');
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
      return jsonb_build_object('success', false, 'message', 'You do not have permission to remove a promo for this billing surface');
    end if;
  end if;

  select r.*
  into v_redemption
  from public.sales_promo_redemptions r
  join public.sales_promo_codes pc on pc.id = r.promo_code_id
  join public.sales_promo_campaigns c on c.id = pc.campaign_id
  where r.tenant_id = p_tenant_id
    and r.remaining_uses > 0
    and coalesce(r.invalidated_at, pc.invalidated_at) is null
    and c.ends_at > now()
    and (p_surface is null or p_surface = any(c.billing_targets))
  order by r.claimed_at desc nulls last, r.created_at desc
  limit 1
  for update;

  if v_redemption.id is null then
    return jsonb_build_object('success', false, 'message', 'No active promo to remove');
  end if;

  select * into v_promo
  from public.sales_promo_codes
  where id = v_redemption.promo_code_id
  for update;

  update public.sales_promo_redemptions
  set
    status = 'invalidated',
    remaining_uses = 0,
    invalidated_at = now(),
    invalidated_by = v_actor,
    invalidation_reason = coalesce(nullif(trim(p_reason), ''), 'Removed by tenant owner')
  where id = v_redemption.id;

  update public.sales_promo_codes
  set
    status = 'active',
    claimed_tenant_id = null,
    claimed_by_user_id = null,
    claimed_at = null
  where id = v_promo.id;

  return jsonb_build_object(
    'success', true,
    'promo_code_id', v_promo.id,
    'code', v_promo.code
  );
end;
$$;

grant execute on function public.unclaim_tenant_sales_promo(uuid, text, text) to authenticated;
