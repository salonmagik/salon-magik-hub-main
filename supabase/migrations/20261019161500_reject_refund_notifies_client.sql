-- reject_transaction_refund updated the request row but never told the
-- customer -- no notifications insert, so client-portal's realtime pipeline
-- (and its chime, added alongside this) had nothing to pick up. Mirrors the
-- salon-facing insert already added in request_customer_refund_notifies_salon
-- for the request-created path.
create or replace function public.reject_transaction_refund(
  p_request_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.refund_requests%rowtype;
  v_customer public.customers%rowtype;
  v_transaction public.transactions%rowtype;
begin
  select * into v_request
  from public.refund_requests
  where id = p_request_id
  for update;

  if v_request.id is null or v_request.status <> 'pending' then
    raise exception 'Refund request is no longer pending';
  end if;

  if not exists (
    select 1 from public.user_roles
    where tenant_id = v_request.tenant_id
      and user_id = auth.uid()
      and role in ('owner', 'manager')
      and is_active = true
  ) then
    raise exception 'Only owners and managers can reject refunds';
  end if;

  if nullif(trim(p_reason), '') is null then
    raise exception 'A rejection reason is required';
  end if;

  update public.refund_requests
  set status = 'rejected',
      rejection_reason = trim(p_reason),
      approved_by_id = auth.uid(),
      approved_at = now(),
      updated_at = now()
  where id = p_request_id;

  select * into v_customer from public.customers where id = v_request.customer_id;
  select * into v_transaction from public.transactions where id = v_request.transaction_id;

  if v_customer.user_id is not null then
    insert into public.notifications (
      tenant_id, user_id, type, title, description, urgent, entity_type, entity_id
    )
    values (
      v_request.tenant_id,
      v_customer.user_id,
      'refund_request',
      'Refund request declined',
      'Your '
        || coalesce(v_transaction.currency, '') || ' ' || to_char(v_request.amount, 'FM999999999.00')
        || ' refund request was declined: ' || trim(p_reason),
      true,
      'refund_request',
      p_request_id
    );
  end if;

  return true;
end;
$$;
