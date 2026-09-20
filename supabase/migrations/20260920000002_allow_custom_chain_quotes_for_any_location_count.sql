-- A Chain quote may be required even for a small number of locations when
-- the market has no configured additional-location tier. Keep the unlock
-- request flow usable for those tenants instead of restricting it to the
-- legacy 11+ location case.

alter table public.tenant_chain_unlock_requests
  drop constraint if exists tenant_chain_unlock_requests_requested_locations_check;

alter table public.tenant_chain_unlock_requests
  add constraint tenant_chain_unlock_requests_requested_locations_check
  check (requested_locations >= 1);

create or replace function public.approve_chain_custom_unlock(
  p_tenant_id uuid,
  p_allowed_locations integer,
  p_amount numeric,
  p_currency text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_request record;
  v_plan_id uuid;
begin
  if v_actor_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not has_backoffice_role(v_actor_user_id, 'super_admin'::backoffice_role) then
    raise exception 'BACKOFFICE_SUPER_ADMIN_REQUIRED';
  end if;

  if p_allowed_locations is null or p_allowed_locations < 1 then
    raise exception 'CHAIN_UNLOCK_ALLOWED_LOCATIONS_INVALID';
  end if;

  if p_amount is null or p_amount < 0 then
    raise exception 'CHAIN_UNLOCK_AMOUNT_INVALID';
  end if;

  if p_currency is null or upper(p_currency) not in ('USD', 'NGN', 'GHS') then
    raise exception 'CHAIN_UNLOCK_CURRENCY_INVALID';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'CHAIN_UNLOCK_REASON_REQUIRED';
  end if;

  select *
  into v_request
  from public.tenant_chain_unlock_requests
  where tenant_id = p_tenant_id
    and status = 'pending'
  for update;

  if not found then
    raise exception 'CHAIN_UNLOCK_REQUEST_NOT_FOUND';
  end if;

  v_plan_id := v_request.plan_id;

  insert into public.tenant_plan_entitlements (
    tenant_id,
    plan_id,
    allowed_locations,
    source,
    reason,
    updated_by
  )
  values (
    p_tenant_id,
    v_plan_id,
    p_allowed_locations,
    'backoffice_override',
    p_reason,
    v_actor_user_id
  )
  on conflict (tenant_id) do update
  set
    plan_id = excluded.plan_id,
    allowed_locations = excluded.allowed_locations,
    source = excluded.source,
    reason = excluded.reason,
    updated_by = excluded.updated_by,
    updated_at = now();

  update public.tenant_chain_unlock_requests
  set
    status = 'approved',
    allowed_locations = p_allowed_locations,
    custom_unlock_amount = p_amount,
    custom_unlock_currency = upper(p_currency),
    reason = p_reason,
    approved_by = v_actor_user_id,
    approved_at = now(),
    updated_at = now()
  where id = v_request.id;

  insert into public.audit_logs (
    action,
    entity_type,
    entity_id,
    actor_user_id,
    tenant_id,
    metadata
  )
  values (
    'chain_unlock_request_approved',
    'tenant_chain_unlock_requests',
    v_request.id,
    v_actor_user_id,
    p_tenant_id,
    jsonb_build_object(
      'allowed_locations', p_allowed_locations,
      'amount', p_amount,
      'currency', upper(p_currency),
      'reason', p_reason
    )
  );

  return jsonb_build_object(
    'success', true,
    'request_id', v_request.id,
    'allowed_locations', p_allowed_locations
  );
end;
$$;

grant execute on function public.approve_chain_custom_unlock(uuid, integer, numeric, text, text) to authenticated;
