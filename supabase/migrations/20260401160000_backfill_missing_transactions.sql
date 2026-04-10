create or replace function public.backfill_missing_transactions(
  p_tenant_id uuid default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_inserted_appointment_payments integer := 0;
  v_inserted_customer_purse_topups integer := 0;
begin
  with appointment_backfill as (
    insert into public.transactions (
      tenant_id,
      customer_id,
      appointment_id,
      type,
      method,
      amount,
      currency,
      provider,
      provider_reference,
      paystack_reference,
      status
    )
    select
      pi.tenant_id,
      ap.customer_id,
      coalesce(pi.appointment_id, ap.id),
      case when coalesce(pi.is_deposit, false) then 'deposit' else 'payment' end,
      'card'::public.payment_method,
      pi.amount,
      coalesce(nullif(pi.currency, ''), 'USD'),
      pi.gateway,
      coalesce(pi.gateway_reference, pi.paystack_reference, pi.stripe_session_id),
      case
        when pi.gateway = 'paystack' then coalesce(pi.paystack_reference, pi.gateway_reference)
        else null
      end,
      'completed'
    from public.payment_intents pi
    left join public.appointments ap on ap.id = pi.appointment_id
    where pi.status = 'completed'
      and pi.intent_type = 'appointment_payment'
      and (p_tenant_id is null or pi.tenant_id = p_tenant_id)
      and coalesce(pi.gateway_reference, pi.paystack_reference, pi.stripe_session_id) is not null
      and not exists (
        select 1
        from public.transactions tx
        where tx.tenant_id = pi.tenant_id
          and tx.provider_reference = coalesce(pi.gateway_reference, pi.paystack_reference, pi.stripe_session_id)
          and tx.type in ('payment', 'deposit')
      )
    returning 1
  )
  select count(*) into v_inserted_appointment_payments from appointment_backfill;

  with purse_backfill as (
    insert into public.transactions (
      tenant_id,
      customer_id,
      appointment_id,
      type,
      method,
      amount,
      currency,
      provider,
      provider_reference,
      paystack_reference,
      status
    )
    select
      wle.tenant_id,
      cp.customer_id,
      null,
      'purse_topup',
      'card'::public.payment_method,
      abs(wle.amount),
      wle.currency,
      wle.gateway,
      wle.gateway_reference,
      case when wle.gateway = 'paystack' then wle.gateway_reference else null end,
      'completed'
    from public.wallet_ledger_entries wle
    join public.customer_purses cp
      on cp.id = wle.wallet_id
     and wle.wallet_type = 'customer'
    where wle.entry_type = 'customer_purse_topup'
      and (p_tenant_id is null or wle.tenant_id = p_tenant_id)
      and wle.gateway_reference is not null
      and not exists (
        select 1
        from public.transactions tx
        where tx.tenant_id = wle.tenant_id
          and tx.provider_reference = wle.gateway_reference
          and tx.type = 'purse_topup'
      )
    returning 1
  )
  select count(*) into v_inserted_customer_purse_topups from purse_backfill;

  return jsonb_build_object(
    'appointment_payments_inserted', v_inserted_appointment_payments,
    'customer_purse_topups_inserted', v_inserted_customer_purse_topups
  );
end;
$$;

comment on function public.backfill_missing_transactions(uuid)
  is 'Backfills missing transaction rows from completed payment intents and customer purse wallet ledger entries.';
