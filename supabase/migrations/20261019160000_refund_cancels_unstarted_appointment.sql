-- A fully refunded appointment that hasn't started yet should be cancelled
-- automatically; a partial refund leaves it open unless the salon explicitly
-- opts in (p_cancel_appointment). Either way, an appointment that's already
-- started/completed/paused/cancelled/rescheduled is left alone -- only
-- 'scheduled' (not started) appointments are eligible.
create or replace function public.complete_transaction_refund(
  p_transaction_id uuid,
  p_amount numeric,
  p_refund_type public.refund_type,
  p_reason text,
  p_request_id uuid default null,
  p_wallet_debit_entry_id uuid default null,
  p_cancel_appointment boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.transactions%rowtype;
  v_request public.refund_requests%rowtype;
  v_refund_id uuid;
  v_request_id uuid;
  v_reserved numeric(12,2);
  v_remaining numeric(12,2);
  v_method public.payment_method;
  v_balance_refund_handled boolean := false;
  v_requires_wallet_debit boolean;
  v_debit public.wallet_ledger_entries%rowtype;
  v_appt_amount_paid numeric(12,2);
  v_appt_status public.appointment_status;
  v_new_payment_status public.payment_status;
  v_should_cancel boolean;
begin
  select * into v_transaction
  from public.transactions
  where id = p_transaction_id
  for update;

  if v_transaction.id is null
     or v_transaction.type not in ('payment', 'deposit')
     or v_transaction.status <> 'completed'
     or v_transaction.customer_id is null then
    raise exception 'This transaction is not refundable';
  end if;

  if auth.role() is distinct from 'service_role' and not exists (
    select 1 from public.user_roles
    where tenant_id = v_transaction.tenant_id
      and user_id = auth.uid()
      and role in ('owner', 'manager')
      and is_active = true
  ) then
    raise exception 'Only owners and managers can complete refunds';
  end if;

  if p_amount is null or p_amount <= 0 or nullif(trim(p_reason), '') is null then
    raise exception 'A valid amount and reason are required';
  end if;

  if p_request_id is not null then
    select * into v_request
    from public.refund_requests
    where id = p_request_id
      and transaction_id = p_transaction_id
    for update;
    if v_request.id is null or v_request.status <> 'pending' then
      raise exception 'Refund request is no longer pending';
    end if;
    if v_request.amount <> p_amount or v_request.refund_type <> p_refund_type then
      raise exception 'Approved refund must match the pending request';
    end if;
  end if;

  select coalesce(sum(amount), 0)
  into v_reserved
  from public.refund_requests
  where transaction_id = p_transaction_id
    and status in ('pending', 'approved', 'completed')
    and (p_request_id is null or id <> p_request_id);

  v_remaining := v_transaction.amount - v_reserved;
  if p_amount > v_remaining then
    raise exception 'Refund exceeds the remaining refundable amount';
  end if;

  v_requires_wallet_debit := p_refund_type in ('paystack', 'store_credit', 'original_method')
    and v_transaction.method <> 'purse';

  if v_requires_wallet_debit and p_wallet_debit_entry_id is null
     and public.refund_wallet_debit_amount(p_transaction_id, p_amount) > 0 then
    raise exception 'REFUND_WALLET_DEBIT_REQUIRED: a refund of this type must be completed through the refund-via-paystack function';
  end if;

  if p_wallet_debit_entry_id is not null then
    if not v_requires_wallet_debit then
      raise exception 'REFUND_WALLET_DEBIT_UNEXPECTED: this refund does not draw on the salon wallet and must not carry a wallet debit';
    end if;

    select * into v_debit
    from public.wallet_ledger_entries
    where id = p_wallet_debit_entry_id
    for update;

    if v_debit.id is null
       or v_debit.tenant_id <> v_transaction.tenant_id
       or v_debit.wallet_type <> 'salon'
       or v_debit.entry_type <> 'salon_purse_debit_refund'
       or (v_debit.metadata->>'refund_gross_amount')::numeric <> p_amount
       or v_debit.currency <> v_transaction.currency
       or v_debit.reference_id <> p_transaction_id then
      raise exception 'REFUND_WALLET_DEBIT_INVALID: the supplied wallet debit does not cover this refund';
    end if;
  end if;

  v_method := case
    when p_refund_type = 'store_credit' then 'purse'::public.payment_method
    when p_refund_type = 'offline' and v_transaction.method = 'cash' then 'cash'::public.payment_method
    when p_refund_type = 'offline' then 'transfer'::public.payment_method
    else v_transaction.method
  end;

  insert into public.transactions (
    tenant_id, customer_id, appointment_id, type, method, amount, currency,
    provider, provider_reference, status, created_by_id, original_transaction_id,
    refund_request_id
  )
  values (
    v_transaction.tenant_id, v_transaction.customer_id, v_transaction.appointment_id,
    'refund', v_method, p_amount, v_transaction.currency,
    case when p_refund_type = 'store_credit' then 'customer_balance' else 'external' end,
    p_transaction_id::text, 'completed', auth.uid(), p_transaction_id, p_request_id
  )
  returning id into v_refund_id;

  if p_request_id is null then
    insert into public.refund_requests (
      tenant_id, transaction_id, customer_id, refund_type, amount, reason,
      status, requested_by_id, approved_by_id, approved_at, processed_transaction_id,
      wallet_debit_entry_id
    )
    values (
      v_transaction.tenant_id, p_transaction_id, v_transaction.customer_id,
      p_refund_type, p_amount, trim(p_reason), 'completed', auth.uid(), auth.uid(),
      now(), v_refund_id, p_wallet_debit_entry_id
    )
    returning id into v_request_id;

    update public.transactions
    set refund_request_id = v_request_id
    where id = v_refund_id;
  else
    v_request_id := p_request_id;
    update public.refund_requests
    set status = 'completed',
        approved_by_id = auth.uid(),
        approved_at = now(),
        processed_transaction_id = v_refund_id,
        wallet_debit_entry_id = p_wallet_debit_entry_id,
        updated_at = now()
    where id = p_request_id;
  end if;

  if v_transaction.method = 'purse' and v_transaction.appointment_id is not null then
    v_balance_refund_handled := public.refund_customer_balance_reservation(
      v_transaction.appointment_id,
      p_amount,
      p_refund_type in ('store_credit', 'original_method')
    );
  end if;

  if (
    p_refund_type = 'store_credit'
    or (p_refund_type = 'original_method' and v_transaction.method = 'purse')
  ) and not v_balance_refund_handled then
    perform public.credit_customer_balance(
      v_transaction.tenant_id,
      v_transaction.customer_id,
      p_amount,
      v_transaction.currency,
      'refund',
      v_refund_id,
      false,
      null,
      'Refund issued as store credit',
      'refund_credit_' || v_refund_id::text,
      jsonb_build_object(
        'original_transaction_id', p_transaction_id,
        'refund_request_id', v_request_id
      )
    );
  end if;

  if v_transaction.appointment_id is not null then
    select amount_paid, status into v_appt_amount_paid, v_appt_status
    from public.appointments
    where id = v_transaction.appointment_id
    for update;

    v_new_payment_status := case
      when v_appt_amount_paid - p_amount <= 0 then 'refunded_full'::public.payment_status
      else 'refunded_partial'::public.payment_status
    end;

    v_should_cancel := v_appt_status = 'scheduled'
      and (v_new_payment_status = 'refunded_full' or p_cancel_appointment);

    update public.appointments
    set amount_paid = greatest(0, amount_paid - p_amount),
        payment_status = v_new_payment_status,
        status = case when v_should_cancel then 'cancelled'::public.appointment_status else status end,
        cancellation_reason = case
          when v_should_cancel and cancellation_reason is null then 'Refunded'
          else cancellation_reason
        end,
        updated_at = now()
    where id = v_transaction.appointment_id;
  end if;

  perform public.log_audit_event(
    v_transaction.tenant_id,
    'update',
    'transaction',
    p_transaction_id,
    null,
    jsonb_build_object(
      'refund_transaction_id', v_refund_id,
      'refund_request_id', v_request_id,
      'amount', p_amount,
      'refund_type', p_refund_type,
      'processed_by_id', auth.uid(),
      'wallet_debit_entry_id', p_wallet_debit_entry_id
    )
  );

  return v_refund_id;
end;
$$;

-- complete_local_refund just threads the new flag through to complete_transaction_refund.
create or replace function public.complete_local_refund(
 p_transaction_id uuid,p_amount numeric,p_refund_type public.refund_type,p_reason text,
 p_actor_id uuid,p_key text,p_request_id uuid default null,p_cancel_appointment boolean default false
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_t transactions%rowtype; v_op local_refund_operations%rowtype; v_debit jsonb; v_id uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
 if p_refund_type is null or p_refund_type not in ('store_credit','offline','original_method') or nullif(trim(p_key),'') is null then
   raise exception 'Invalid local refund';
 end if;
 select * into strict v_t from transactions where id=p_transaction_id for update;
 if not exists(select 1 from user_roles where tenant_id=v_t.tenant_id and user_id=p_actor_id and is_active and role in ('owner','manager')) then
   raise exception 'Only owners and managers can complete refunds';
 end if;
 if p_refund_type='original_method' and v_t.method<>'purse' then raise exception 'Use Paystack to refund gateway payments'; end if;
 select * into v_op from local_refund_operations where idempotency_key=p_key;
 if v_op.idempotency_key is not null then
   if v_op.transaction_id<>p_transaction_id or v_op.amount is distinct from p_amount or v_op.refund_type<>p_refund_type then raise exception 'Refund key mismatch'; end if;
   return jsonb_build_object('success',true,'refundId',v_op.refund_id,'duplicate',true);
 end if;
 if p_request_id is not null then
   update refund_requests
   set amount=p_amount, refund_type=p_refund_type, reason=trim(p_reason), updated_at=now()
   where id=p_request_id and transaction_id=p_transaction_id and status='pending';
   if not found then raise exception 'Refund request is no longer pending'; end if;
 end if;
 v_debit := debit_salon_wallet_for_refund(p_transaction_id,p_amount,p_refund_type,p_reason,p_actor_id,'local-refund:'||p_key,p_request_id,v_t.appointment_id,false);
 if not (v_debit->>'ok')::boolean then
   return v_debit||jsonb_build_object('success',false,'error','This salon has insufficient recoverable funds for the refund');
 end if;
 v_id := complete_transaction_refund(p_transaction_id,p_amount,p_refund_type,p_reason,p_request_id,(v_debit->>'ledger_entry_id')::uuid,p_cancel_appointment);
 update transactions set created_by_id=p_actor_id where id=v_id;
 update refund_requests set requested_by_id=coalesce(requested_by_id,p_actor_id),approved_by_id=p_actor_id where processed_transaction_id=v_id;
 insert into local_refund_operations values(p_key,p_transaction_id,p_amount,p_refund_type,v_id,now());
 return jsonb_build_object('success',true,'refundId',v_id,'duplicate',false);
end;
$$;
revoke all on function public.complete_local_refund(uuid,numeric,public.refund_type,text,uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.complete_local_refund(uuid,numeric,public.refund_type,text,uuid,text,uuid,boolean) to service_role;
