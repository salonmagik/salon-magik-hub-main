create or replace function public.complete_transaction_refund(
  p_transaction_id uuid,
  p_amount numeric,
  p_refund_type public.refund_type,
  p_reason text,
  p_request_id uuid default null,
  p_wallet_debit_entry_id uuid default null
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

  -- Wallet-debit guard (refund clawback safeguard): a refund that moves
  -- money out of the salon's own recoverable funds must be backed by a real,
  -- already-committed wallet_ledger_entries debit — taking that debit here
  -- would be too late for the paystack path (the external refund already
  -- happened by the time this RPC runs), so the debit is taken up front by
  -- debit_salon_wallet_for_refund and merely validated here.
  v_requires_wallet_debit := p_refund_type in ('paystack', 'store_credit', 'original_method')
    and v_transaction.method <> 'purse';

  -- A null wallet_debit_entry_id is legitimate, not just a bypass, when the
  -- salon was never actually given this money in the first place (design
  -- edge case 4 — a swallowed credit_salon_purse error on the original
  -- charge): debit_salon_wallet_for_refund correctly returns a null entry id
  -- for that case too, since there is nothing to debit. Recompute the same
  -- way it did to tell the two apart, rather than trusting a bare null.
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
    update public.appointments
    set amount_paid = greatest(0, amount_paid - p_amount),
    payment_status = case
      when amount_paid - p_amount <= 0 then 'refunded_full'::public.payment_status
      else 'refunded_partial'::public.payment_status
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

grant execute on function public.complete_transaction_refund(
  uuid, numeric, public.refund_type, text, uuid, uuid
) to authenticated;

-- Credit-attribution lookups in refund_wallet_debit_amount above are scoped
-- by tenant_id and an equality on gateway_reference or
-- (reference_type, reference_id) — bounded to the entries for one
-- transaction, but only if indexed; without these it degrades to a
-- per-tenant scan of the highest-volume table in the schema.
create index if not exists wallet_ledger_entries_tenant_gateway_reference_idx
  on public.wallet_ledger_entries (tenant_id, gateway_reference);

create index if not exists wallet_ledger_entries_tenant_reference_idx
  on public.wallet_ledger_entries (tenant_id, reference_type, reference_id);

create table public.paystack_refunds (
 id uuid primary key default gen_random_uuid(),
 transaction_id uuid not null references transactions(id),
 provider_id text,
 currency text not null,
 amount numeric(12,2) not null check(amount>0),
 provider_amount numeric(12,2) check(provider_amount is null or provider_amount>0),
 reason text not null,
 status text not null default 'initiating',
 debit_key text not null unique,
 wallet_debit_entry_id uuid references wallet_ledger_entries(id),
 request_id uuid references refund_requests(id),
 refund_transaction_id uuid references transactions(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(currency,provider_id)
);
alter table public.paystack_refunds enable row level security;
create policy "Salon refund status" on public.paystack_refunds for select to authenticated using (
 exists(select 1 from transactions t join user_roles r on r.tenant_id=t.tenant_id
 where t.id=transaction_id and r.user_id=auth.uid() and r.is_active and r.role in ('owner','manager'))
);

create or replace function public.prepare_paystack_refund(p_transaction_id uuid,p_amount numeric,p_reason text,p_actor_id uuid,p_key text,p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_t transactions%rowtype; v_r paystack_refunds%rowtype; v_debit jsonb; v_request uuid := p_request_id; v_reserved numeric;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
 select * into strict v_t from transactions where id=p_transaction_id for update;
 if v_t.status <> 'completed' or v_t.type not in ('payment','deposit') or v_t.provider <> 'paystack' or v_t.customer_id is null then
   raise exception 'This transaction is not refundable through Paystack';
 end if;
 if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount,2) or nullif(trim(p_key),'') is null or nullif(trim(p_reason),'') is null then
   raise exception 'A valid amount, reason and refund key are required';
 end if;
 if not exists(select 1 from user_roles where tenant_id=v_t.tenant_id and user_id=p_actor_id and is_active and role in ('owner','manager')) then
   raise exception 'Only owners and managers can complete refunds';
 end if;
 select * into v_r from paystack_refunds where debit_key=p_key;
 if v_r.id is not null then
   if v_r.transaction_id<>p_transaction_id or v_r.amount<>p_amount then raise exception 'Refund key mismatch'; end if;
   return to_jsonb(v_r)||jsonb_build_object('duplicate',true,'ok',true);
 end if;
 if exists(select 1 from paystack_refunds where transaction_id=p_transaction_id and status not in ('processed','failed')) then
   raise exception 'A refund is already awaiting Paystack confirmation for this payment';
 end if;
 if v_request is not null and not exists(select 1 from refund_requests where id=v_request and transaction_id=p_transaction_id and status='pending' and amount=p_amount and refund_type='paystack') then
   raise exception 'Refund request no longer matches';
 end if;
 select coalesce(sum(amount),0) into v_reserved from refund_requests where transaction_id=p_transaction_id
   and status in ('pending','approved','completed') and (v_request is null or id<>v_request);
 if p_amount > v_t.amount-v_reserved then raise exception 'Refund exceeds the remaining refundable amount'; end if;
 v_debit := debit_salon_wallet_for_refund(p_transaction_id,p_amount,'paystack',p_reason,p_actor_id,p_key,p_request_id,v_t.appointment_id,false);
 if not (v_debit->>'ok')::boolean then return v_debit; end if;
 if v_request is null then
   insert into refund_requests(tenant_id,transaction_id,customer_id,refund_type,amount,reason,status,requested_by_id)
   values(v_t.tenant_id,v_t.id,v_t.customer_id,'paystack',p_amount,p_reason,'pending',p_actor_id) returning id into v_request;
 end if;
 insert into paystack_refunds(transaction_id,currency,amount,reason,debit_key,wallet_debit_entry_id,request_id)
 values(p_transaction_id,v_t.currency,p_amount,p_reason,p_key,(v_debit->>'ledger_entry_id')::uuid,v_request) returning * into v_r;
 return to_jsonb(v_r)||jsonb_build_object('ok',true,'duplicate',false);
end;
$$;

create or replace function public.reconcile_paystack_refund(p_provider_id text,p_reference text,p_currency text,p_amount numeric,p_status text,p_local_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_r paystack_refunds%rowtype; v_t transactions%rowtype; v_d jsonb; v_refund uuid;
  v_reserved numeric(12,2); v_service_amount numeric(12,2);
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
 if p_status is null or p_status not in ('pending','processing','processed','failed','needs-attention') then raise exception 'Unknown Paystack refund state'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_currency||':refund:'||p_provider_id,0));
 select * into v_r from paystack_refunds where (provider_id=p_provider_id and currency=p_currency) or id=p_local_id for update;
 if v_r.id is null then
   select * into v_t from transactions where provider='paystack' and currency=p_currency
     and (provider_reference=p_reference or paystack_reference=p_reference) and type in ('payment','deposit')
     and status='completed' order by created_at limit 1 for update;
   if v_t.id is null then raise exception 'Refund payment is not recorded yet'; end if;
   select coalesce(sum(amount),0) into v_reserved from refund_requests
   where transaction_id=v_t.id and status in ('pending','approved','completed');
   v_service_amount := least(p_amount, greatest(0,v_t.amount-v_reserved));
   if v_service_amount <= 0 then
     raise exception 'Provider refund has no remaining refundable transaction amount';
   end if;
   insert into refund_requests(tenant_id,transaction_id,customer_id,refund_type,amount,reason,status)
   values(v_t.tenant_id,v_t.id,v_t.customer_id,'paystack',v_service_amount,'Refund initiated through Paystack','pending')
   returning id into v_refund;
   insert into paystack_refunds(transaction_id,provider_id,currency,amount,provider_amount,reason,debit_key,request_id)
   values(v_t.id,p_provider_id,p_currency,v_service_amount,p_amount,'Refund initiated through Paystack',
     'paystack-refund:'||p_currency||':'||p_provider_id,v_refund) returning * into v_r;
 end if;
 select * into strict v_t from transactions where id=v_r.transaction_id for update;
 if v_r.currency<>p_currency or coalesce(v_r.provider_amount,v_r.amount)<>p_amount or coalesce(v_t.provider_reference,v_t.paystack_reference)<>p_reference
   or (v_r.provider_id is not null and v_r.provider_id<>p_provider_id) then raise exception 'Refund details mismatch'; end if;
 if v_r.status='failed' then return jsonb_build_object('status','failed'); end if;
 if v_r.status='processed' then return jsonb_build_object('status','processed','refundId',v_r.refund_transaction_id); end if;
 if p_status='processed' then
   if v_r.wallet_debit_entry_id is null then
     v_d := debit_salon_wallet_for_refund(v_t.id,v_r.amount,'paystack',v_r.reason,null,v_r.debit_key,v_r.request_id,v_t.appointment_id,true);
     if not (v_d->>'ok')::boolean then raise exception 'Unable to account for provider refund'; end if;
     v_r.wallet_debit_entry_id := (v_d->>'ledger_entry_id')::uuid;
   end if;
   v_refund := complete_transaction_refund(v_t.id,v_r.amount,'paystack',v_r.reason,v_r.request_id,v_r.wallet_debit_entry_id);
 elsif p_status='failed' then
   if v_r.wallet_debit_entry_id is not null then
     perform reverse_refund_wallet_debit(v_t.tenant_id,v_t.id,v_r.amount,p_currency,v_r.debit_key);
   end if;
   update refund_requests set status='rejected',updated_at=now() where id=v_r.request_id and status='pending';
 end if;
 update paystack_refunds set provider_id=p_provider_id,status=p_status,wallet_debit_entry_id=v_r.wallet_debit_entry_id,
 refund_transaction_id=v_refund,updated_at=now() where id=v_r.id;
 return jsonb_build_object('status',p_status,'refundId',v_refund);
end;
$$;
revoke all on function public.prepare_paystack_refund(uuid,numeric,text,uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.reconcile_paystack_refund(text,text,text,numeric,text,uuid) from public,anon,authenticated;
grant execute on function public.prepare_paystack_refund(uuid,numeric,text,uuid,text,uuid) to service_role;
grant execute on function public.reconcile_paystack_refund(text,text,text,numeric,text,uuid) to service_role;
