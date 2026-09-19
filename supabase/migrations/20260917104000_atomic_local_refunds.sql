-- Store-credit and offline refunds have no external step: commit their wallet,
-- customer credit and refund records together, or roll all of them back.
create table public.local_refund_operations (
 idempotency_key text primary key,
 transaction_id uuid not null references transactions(id),
 amount numeric(12,2) not null,
 refund_type public.refund_type not null,
 refund_id uuid not null references transactions(id),
 created_at timestamptz not null default now()
);
alter table public.local_refund_operations enable row level security;
create or replace function public.complete_local_refund(
 p_transaction_id uuid,p_amount numeric,p_refund_type public.refund_type,p_reason text,
 p_actor_id uuid,p_key text,p_request_id uuid default null
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
 v_id := complete_transaction_refund(p_transaction_id,p_amount,p_refund_type,p_reason,p_request_id,(v_debit->>'ledger_entry_id')::uuid);
 update transactions set created_by_id=p_actor_id where id=v_id;
 update refund_requests set requested_by_id=coalesce(requested_by_id,p_actor_id),approved_by_id=p_actor_id where processed_transaction_id=v_id;
 insert into local_refund_operations values(p_key,p_transaction_id,p_amount,p_refund_type,v_id,now());
 return jsonb_build_object('success',true,'refundId',v_id,'duplicate',false);
end;
$$;
revoke all on function public.complete_local_refund(uuid,numeric,public.refund_type,text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.complete_local_refund(uuid,numeric,public.refund_type,text,uuid,text,uuid) to service_role;
