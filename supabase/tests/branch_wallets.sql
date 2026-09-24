\set ON_ERROR_STOP on

begin;

do $$
declare
  v_tenant constant uuid := '30000000-0000-0000-0000-000000000001';
  v_owner constant uuid := '30000000-0000-0000-0000-000000000002';
  v_customer constant uuid := '30000000-0000-0000-0000-000000000003';
  v_branch_a constant uuid := '30000000-0000-0000-0000-000000000004';
  v_branch_b constant uuid := '30000000-0000-0000-0000-000000000005';
  v_appointment_a constant uuid := '30000000-0000-0000-0000-000000000006';
  v_appointment_b constant uuid := '30000000-0000-0000-0000-000000000007';
  v_transaction_b constant uuid := '30000000-0000-0000-0000-000000000008';
  v_destination_a constant uuid := '30000000-0000-0000-0000-000000000009';
  v_destination_b constant uuid := '30000000-0000-0000-0000-00000000000a';
  v_credit_a uuid;
  v_credit_b uuid;
  v_result jsonb;
  v_central numeric;
  v_a numeric;
  v_b numeric;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v_owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'branch-wallet-owner@test.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
  insert into public.tenants (id, name, slug, country, currency, timezone)
  values (v_tenant, 'Branch Wallet Test', 'branch-wallet-test', 'GH', 'GHS', 'Africa/Accra');
  insert into public.user_roles (user_id, tenant_id, role, is_active)
  values (v_owner, v_tenant, 'owner', true);
  insert into public.customers (id, tenant_id, full_name, email)
  values (v_customer, v_tenant, 'Branch Wallet Customer', 'branch-wallet-customer@test.local');
  insert into public.locations (id, tenant_id, name, country, city, timezone, is_default)
  values
    (v_branch_a, v_tenant, 'Branch A', 'GH', 'Accra', 'Africa/Accra', true),
    (v_branch_b, v_tenant, 'Branch B', 'GH', 'Kumasi', 'Africa/Accra', false);
  insert into public.appointments (id, tenant_id, location_id, customer_id, scheduled_start,
    scheduled_end, total_amount, amount_paid, payment_status)
  values
    (v_appointment_a, v_tenant, v_branch_a, v_customer, now() + interval '1 day', now() + interval '2 days', 100, 100, 'fully_paid'),
    (v_appointment_b, v_tenant, v_branch_b, v_customer, now() + interval '3 days', now() + interval '4 days', 100, 100, 'fully_paid');
  insert into public.transactions (id, tenant_id, customer_id, appointment_id, type, method, amount,
    currency, provider, provider_reference, status, created_by_id)
  values (v_transaction_b, v_tenant, v_customer, v_appointment_b, 'payment', 'card', 100, 'GHS',
    'paystack', 'branch-payment-b', 'completed', v_owner);
  insert into public.salon_payout_destinations (id, tenant_id, destination_type, country, currency,
    bank_name, account_number, account_name, paystack_recipient_code, location_ids)
  values
    (v_destination_a, v_tenant, 'bank', 'GH', 'GHS', 'Test Bank', '0001', 'Branch A', 'RCP_A', array[v_branch_a]),
    (v_destination_b, v_tenant, 'bank', 'GH', 'GHS', 'Test Bank', '0002', 'Branch B', 'RCP_B', array[v_branch_b]);

  v_credit_a := public.credit_salon_purse(v_tenant, 'salon_purse_credit_booking', 'appointment', v_appointment_a, 100, 'GHS', 'branch-credit-a', 'branch-payment-a');
  v_credit_b := public.credit_salon_purse(v_tenant, 'salon_purse_credit_booking', 'appointment', v_appointment_b, 100, 'GHS', 'branch-credit-b', 'branch-payment-b');

  select balance into v_central from public.salon_wallets where tenant_id = v_tenant and location_id is null;
  select balance into v_a from public.salon_wallets where tenant_id = v_tenant and location_id = v_branch_a;
  select balance into v_b from public.salon_wallets where tenant_id = v_tenant and location_id = v_branch_b;
  if v_central <> 0 or v_a <> 100 or v_b <> 100 then
    raise exception 'Branch credits were not isolated: central %, A %, B %', v_central, v_a, v_b;
  end if;

  perform public.debit_salon_purse(v_tenant, 'salon_purse_debit_refund', 'transaction', v_transaction_b, 25, 'GHS', 'branch-debit-b', v_branch_b);
  select balance into v_a from public.salon_wallets where tenant_id = v_tenant and location_id = v_branch_a;
  select balance into v_b from public.salon_wallets where tenant_id = v_tenant and location_id = v_branch_b;
  if v_a <> 100 or v_b <> 75 then
    raise exception 'Branch debit crossed wallet scopes: A %, B %', v_a, v_b;
  end if;

  begin
    perform public.debit_salon_purse(v_tenant, 'salon_purse_debit_refund', 'transaction', v_transaction_b, 101, 'GHS', 'branch-debit-a-overdraw', v_branch_a);
    raise exception 'A branch debit unexpectedly spent another branch balance';
  exception when others then
    if sqlerrm not like '%Insufficient wallet balance%' then raise; end if;
  end;

  v_result := public.debit_salon_wallet_for_refund(v_transaction_b, 100, 'paystack', 'branch refund', v_owner, 'branch-refund-b');
  if (v_result ->> 'ok')::boolean is not true or (v_result ->> 'location_id')::uuid <> v_branch_b then
    raise exception 'Refund did not resolve the original branch wallet: %', v_result;
  end if;
  select balance into v_a from public.salon_wallets where tenant_id = v_tenant and location_id = v_branch_a;
  select balance into v_b from public.salon_wallets where tenant_id = v_tenant and location_id = v_branch_b;
  if v_a <> 100 or v_b <> 0 then
    raise exception 'Refund clawback crossed wallet scopes: A %, B %', v_a, v_b;
  end if;

  -- Withdrawal reservations must also keep wallet and payout destination in
  -- the same branch. Backdate the credit so it is cleared under T+1.
  update public.wallet_ledger_entries set created_at = now() - interval '2 days'
  where tenant_id = v_tenant and wallet_id = (select id from public.salon_wallets where tenant_id = v_tenant and location_id = v_branch_a)
    and entry_type = 'salon_purse_credit_booking';
  perform set_config('request.jwt.claim.role', 'service_role', true);
  begin
    insert into public.salon_withdrawals (tenant_id, salon_wallet_id, payout_destination_id, location_id,
      currency, amount, transfer_fee, stamp_duty, fee_version, status)
    values (v_tenant, (select id from public.salon_wallets where tenant_id = v_tenant and location_id = v_branch_a),
      v_destination_b, v_branch_a, 'GHS', 50, 8, 0, 'paystack-2026-09-16', 'pending');
    raise exception 'A branch withdrawal unexpectedly accepted another branch destination';
  exception when others then
    if sqlerrm not like '%Withdrawal wallet, destination, and location do not match%' then raise; end if;
  end;
end;
$$;

rollback;
