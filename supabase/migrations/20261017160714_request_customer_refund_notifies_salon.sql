-- request_customer_refund persisted the refund_requests row but never told
-- the salon about it -- no notifications insert, no trigger, nothing. The
-- request only ever surfaced to staff who happened to load the Cashflow
-- page and spot the "Refund pending" badge themselves. Add the same
-- notification insert the edge-function helper (createTenantNotification)
-- would produce, inline, since this path is a plain SQL RPC and never
-- passes through an edge function.
create or replace function public.request_customer_refund(
  p_transaction_id uuid,
  p_amount numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.transactions%rowtype;
  v_customer public.customers%rowtype;
  v_reserved numeric(12,2);
  v_request_id uuid;
begin
  select t.*
  into v_transaction
  from public.transactions t
  where t.id = p_transaction_id
  for update;

  select c.*
  into v_customer
  from public.customers c
  where c.id = v_transaction.customer_id;

  if v_transaction.id is null
     or v_transaction.type not in ('payment', 'deposit')
     or v_transaction.status <> 'completed'
     or v_transaction.customer_id is null
     or v_customer.user_id <> auth.uid() then
    raise exception 'This transaction is not refundable by this customer';
  end if;

  if p_amount is null or p_amount <= 0 or nullif(trim(p_reason), '') is null then
    raise exception 'A valid amount and reason are required';
  end if;

  select coalesce(sum(amount), 0)
  into v_reserved
  from public.refund_requests
  where transaction_id = p_transaction_id
    and status in ('pending', 'approved', 'completed');

  if p_amount > v_transaction.amount - v_reserved then
    raise exception 'Refund exceeds the remaining refundable amount';
  end if;

  insert into public.refund_requests (
    tenant_id, transaction_id, customer_id, refund_type, amount, reason,
    status, requested_by_id
  )
  values (
    v_transaction.tenant_id, p_transaction_id, v_transaction.customer_id,
    'offline', p_amount, trim(p_reason), 'pending', auth.uid()
  )
  returning id into v_request_id;

  insert into public.notifications (
    tenant_id, type, title, description, urgent, entity_type, entity_id
  )
  values (
    v_transaction.tenant_id,
    'refund_request',
    'Refund request received',
    coalesce(nullif(trim(v_customer.full_name), ''), 'A customer') || ' requested a '
      || v_transaction.currency || ' ' || to_char(p_amount, 'FM999999999.00') || ' refund. Review it in Cashflow.',
    true,
    'refund_request',
    v_request_id
  );

  return v_request_id;
end;
$$;
