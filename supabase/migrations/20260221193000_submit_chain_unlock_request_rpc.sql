create or replace function public.submit_chain_unlock_request(
  p_tenant_id uuid,
  p_plan_id uuid,
  p_requested_locations integer,
  p_reason text default null
)
returns public.tenant_chain_unlock_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_allowed_locations integer := 10;
  v_result public.tenant_chain_unlock_requests;
begin
  if v_actor_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not belongs_to_tenant(v_actor_user_id, p_tenant_id) then
    raise exception 'TENANT_ACCESS_DENIED';
  end if;

  if p_requested_locations < 11 then
    raise exception 'REQUESTED_LOCATIONS_MUST_BE_11_OR_MORE';
  end if;

  select coalesce(e.allowed_locations, 10)
  into v_allowed_locations
  from public.tenant_plan_entitlements e
  where e.tenant_id = p_tenant_id;

  insert into public.tenant_chain_unlock_requests (
    tenant_id,
    plan_id,
    requested_locations,
    allowed_locations,
    status,
    reason,
    requested_by
  )
  values (
    p_tenant_id,
    p_plan_id,
    p_requested_locations,
    v_allowed_locations,
    'pending',
    p_reason,
    v_actor_user_id
  )
  on conflict (tenant_id)
  do update
    set plan_id = excluded.plan_id,
        requested_locations = excluded.requested_locations,
        status = 'pending',
        reason = excluded.reason,
        requested_by = v_actor_user_id,
        approved_by = null,
        approved_at = null,
        updated_at = now()
  returning * into v_result;

  return v_result;
end;
$$;

grant execute on function public.submit_chain_unlock_request(uuid, uuid, integer, text) to authenticated;
