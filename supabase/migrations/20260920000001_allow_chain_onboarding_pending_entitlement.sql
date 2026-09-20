-- A chain onboarding request can legitimately start in a pending-custom state
-- when the market has no self-serve location tier configured yet. The owner
-- still needs an entitlement row for the active locations, so allow the
-- onboarding_pending_unlock source through the same tenant-member guard.
create or replace function public.set_tenant_chain_entitlement(
  p_tenant_id uuid,
  p_plan_id uuid,
  p_allowed_locations integer,
  p_source text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_plan_slug text;
  v_is_super_admin boolean;
  v_is_tenant_member boolean;
begin
  if v_actor_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_allowed_locations < 1 then
    raise exception 'ALLOWED_LOCATIONS_INVALID';
  end if;

  v_is_super_admin := has_backoffice_role(v_actor_user_id, 'super_admin'::backoffice_role);
  v_is_tenant_member := belongs_to_tenant(v_actor_user_id, p_tenant_id);

  if not v_is_super_admin
     and not (v_is_tenant_member and p_source in ('onboarding', 'onboarding_pending_unlock')) then
    raise exception 'ENTITLEMENT_WRITE_FORBIDDEN';
  end if;

  select slug into v_plan_slug from public.plans where id = p_plan_id;
  if v_plan_slug is null then raise exception 'PLAN_NOT_FOUND'; end if;
  if lower(v_plan_slug) <> 'chain' then raise exception 'CHAIN_PLAN_REQUIRED'; end if;

  insert into public.tenant_plan_entitlements (
    tenant_id, plan_id, allowed_locations, source, reason, updated_by
  ) values (
    p_tenant_id, p_plan_id, p_allowed_locations, p_source, p_reason, v_actor_user_id
  )
  on conflict (tenant_id) do update set
    plan_id = excluded.plan_id,
    allowed_locations = excluded.allowed_locations,
    source = excluded.source,
    reason = excluded.reason,
    updated_by = excluded.updated_by,
    updated_at = now();

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    p_tenant_id, v_actor_user_id, 'tenant_chain_entitlement_updated',
    'tenant_plan_entitlement', p_tenant_id,
    jsonb_build_object('allowed_locations', p_allowed_locations, 'source', p_source, 'reason', p_reason)
  );

  return jsonb_build_object(
    'success', true, 'tenant_id', p_tenant_id, 'allowed_locations', p_allowed_locations
  );
end;
$$;

grant execute on function public.set_tenant_chain_entitlement(uuid, uuid, integer, text, text) to authenticated;
grant execute on function public.set_tenant_chain_entitlement(uuid, uuid, integer, text, text) to service_role;
