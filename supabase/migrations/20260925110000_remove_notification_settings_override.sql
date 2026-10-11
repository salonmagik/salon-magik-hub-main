-- The Notifications settings redesign adds a "Branch overrides" list on the
-- business/owner_hub settings page: any branch with its own row in
-- notification_settings (location_id not null) is "customized," and an
-- owner can remove that customization to fall back to the tenant-wide
-- defaults. There was previously no delete path at all — the existing RLS
-- policies on notification_settings only cover select/insert/update and
-- check tenant membership alone (no role/module check), which is too loose
-- to safely extend to delete. This RPC gives that action a real permission
-- check instead: active tenant membership AND the "settings" module,
-- mirroring the pattern used by claim_sales_promo_code / unclaim_tenant_sales_promo.
create or replace function public.remove_notification_settings_override(
  p_tenant_id uuid,
  p_location_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_deleted_id uuid;
begin
  if v_actor is null then
    return jsonb_build_object('success', false, 'message', 'Authentication required');
  end if;

  if p_location_id is null then
    return jsonb_build_object('success', false, 'message', 'A branch is required');
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

  if not public.user_has_module_access(v_actor, p_tenant_id, 'settings') then
    return jsonb_build_object('success', false, 'message', 'You do not have permission to manage notification settings');
  end if;

  delete from public.notification_settings
  where tenant_id = p_tenant_id
    and location_id = p_location_id
  returning id into v_deleted_id;

  if v_deleted_id is null then
    return jsonb_build_object('success', false, 'message', 'This branch has no customized settings to remove');
  end if;

  return jsonb_build_object('success', true, 'id', v_deleted_id);
end;
$$;

grant execute on function public.remove_notification_settings_override(uuid, uuid) to authenticated;
