-- Owner-initiated end-of-period cancellation and reversal. Both are
-- security definer with an internal owner check — the RPCs are granted to
-- `authenticated`, so this check is the real authorization boundary; the
-- edge function that calls these (manage-subscription-cancellation) does
-- its own check first only to return a clean 403 rather than surfacing a
-- raw Postgres exception to the client.
create or replace function public.request_subscription_cancellation(
  p_tenant_id uuid,
  p_reason text,
  p_note text
) returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_status public.subscription_status;
  v_next_billing_at timestamptz;
  v_existing_cancel_at timestamptz;
  v_cancel_at timestamptz;
begin
  if v_actor_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not exists (
    select 1 from public.user_roles
    where user_id = v_actor_user_id
      and tenant_id = p_tenant_id
      and role = 'owner'::app_role
  ) then
    raise exception 'OWNER_ROLE_REQUIRED';
  end if;

  select subscription_status, next_billing_at, subscription_cancel_at
  into v_status, v_next_billing_at, v_existing_cancel_at
  from public.tenants
  where id = p_tenant_id
  for update;

  if v_status is null then
    raise exception 'TENANT_NOT_FOUND';
  end if;

  -- A cancellation-pending tenant stays 'active' (AD-2), so the status/
  -- next_billing_at checks alone can't tell a fresh cancellation apart from
  -- a duplicate request against one already pending — subscription_cancel_at
  -- being unset is what makes this idempotency check possible.
  if v_status <> 'active' or v_next_billing_at is null or v_existing_cancel_at is not null then
    raise exception 'SUBSCRIPTION_NOT_CANCELLABLE';
  end if;

  v_cancel_at := v_next_billing_at;

  update public.tenants
  set subscription_cancel_at = v_cancel_at,
      cancellation_requested_at = now(),
      cancellation_requested_by = v_actor_user_id,
      cancellation_reason = p_reason,
      cancellation_reason_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_tenant_id;

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant_id,
    v_actor_user_id,
    'subscription_cancellation_requested',
    'tenant',
    p_tenant_id,
    jsonb_build_object('cancel_at', v_cancel_at, 'reason', p_reason, 'trigger', 'owner')
  );

  return v_cancel_at;
end;
$$;

grant execute on function public.request_subscription_cancellation(uuid, text, text) to authenticated;

create or replace function public.resume_subscription(
  p_tenant_id uuid
) returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_cancel_at timestamptz;
  v_next_billing_at timestamptz;
begin
  if v_actor_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not exists (
    select 1 from public.user_roles
    where user_id = v_actor_user_id
      and tenant_id = p_tenant_id
      and role = 'owner'::app_role
  ) then
    raise exception 'OWNER_ROLE_REQUIRED';
  end if;

  select subscription_cancel_at, next_billing_at
  into v_cancel_at, v_next_billing_at
  from public.tenants
  where id = p_tenant_id
  for update;

  if v_cancel_at is null or v_cancel_at <= now() then
    raise exception 'NOTHING_TO_RESUME';
  end if;

  update public.tenants
  set subscription_cancel_at = null,
      cancellation_requested_at = null,
      cancellation_requested_by = null,
      cancellation_reason = null,
      cancellation_reason_note = null
  where id = p_tenant_id;

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant_id,
    v_actor_user_id,
    'subscription_cancellation_reversed',
    'tenant',
    p_tenant_id,
    jsonb_build_object('trigger', 'owner')
  );

  return v_next_billing_at;
end;
$$;

grant execute on function public.resume_subscription(uuid) to authenticated;
