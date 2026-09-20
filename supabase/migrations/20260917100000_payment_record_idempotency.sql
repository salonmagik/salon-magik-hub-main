-- Serialize recording by provider reference, including rows created before this
-- migration. Do not delete historical duplicates or rewrite financial history.
create or replace function public.record_gateway_payment(p_record jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_tenant uuid := (p_record->>'tenant_id')::uuid; v_reference text := p_record->>'provider_reference';
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
  if v_tenant is null or nullif(v_reference, '') is null
     or p_record->>'provider' <> 'paystack'
     or p_record->>'type' not in ('payment','deposit','purse_topup')
     or p_record->>'status' <> 'completed'
     or (p_record->>'amount')::numeric <= 0
     or p_record->>'currency' not in ('NGN','GHS') then
    raise exception 'Invalid gateway payment record';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_tenant::text || ':' || (p_record->>'provider') || ':' || v_reference, 0));
  select id into v_id from transactions where tenant_id=v_tenant and provider=p_record->>'provider'
    and provider_reference=v_reference and type in ('payment','deposit','purse_topup') order by created_at limit 1;
  if v_id is not null then return jsonb_build_object('id',v_id,'duplicate',true); end if;
  insert into transactions(tenant_id,customer_id,appointment_id,type,amount,currency,method,provider,provider_reference,status,paystack_reference,payment_group_id)
  select v_tenant,(p_record->>'customer_id')::uuid,(p_record->>'appointment_id')::uuid,
    r.type,r.amount,r.currency,r.method,r.provider,r.provider_reference,r.status,r.paystack_reference,r.payment_group_id
  from jsonb_populate_record(null::transactions,p_record) r returning id into v_id;
  return jsonb_build_object('id',v_id,'duplicate',false);
end;
$$;
revoke all on function public.record_gateway_payment(jsonb) from public,anon,authenticated;
grant execute on function public.record_gateway_payment(jsonb) to service_role;

create or replace function public.complete_messaging_credit_purchase(
 p_tenant_id uuid,p_payment_intent_id uuid,p_reference text,p_credits integer,p_amount numeric,p_currency text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_intent payment_intents%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
 if nullif(p_reference,'') is null or p_credits <= 0 or p_amount <= 0 then raise exception 'Invalid purchase'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':messaging',0));
 select id into v_id from messaging_credit_purchases where tenant_id=p_tenant_id
   and (gateway_reference=p_reference or payment_intent_id=p_payment_intent_id) limit 1;
 if v_id is not null then return jsonb_build_object('id',v_id,'duplicate',true); end if;
 select * into v_intent from payment_intents where id=p_payment_intent_id and tenant_id=p_tenant_id for update;
 if v_intent.id is null then
   raise exception 'Payment intent does not belong to salon';
 end if;
 if v_intent.intent_type <> 'messaging_credit_purchase'
    or v_intent.amount is distinct from p_amount
    or v_intent.currency <> p_currency
    or coalesce((v_intent.metadata->>'credits')::integer,0) <> p_credits then
   raise exception 'Messaging purchase does not match its payment intent';
 end if;
 insert into messaging_credit_purchases(tenant_id,credits,currency,amount,paid_via,payment_intent_id,gateway_reference)
 values(p_tenant_id,p_credits,p_currency,p_amount,'paystack',p_payment_intent_id,p_reference) returning id into v_id;
 insert into communication_credits(tenant_id,balance,updated_at) values(p_tenant_id,p_credits,now())
 on conflict(tenant_id) do update set balance=communication_credits.balance+excluded.balance,updated_at=now();
 return jsonb_build_object('id',v_id,'duplicate',false);
end;
$$;
revoke all on function public.complete_messaging_credit_purchase(uuid,uuid,text,integer,numeric,text) from public,anon,authenticated;
grant execute on function public.complete_messaging_credit_purchase(uuid,uuid,text,integer,numeric,text) to service_role;
