\set ON_ERROR_STOP on

begin;

do $$
declare
  v_tenant_id constant uuid := '10000000-0000-0000-0000-000000000001';
  v_owner_id constant uuid := '10000000-0000-0000-0000-000000000002';
  v_staff_id constant uuid := '10000000-0000-0000-0000-000000000003';
  v_customer_id constant uuid := '10000000-0000-0000-0000-000000000004';
  v_location_id constant uuid := '10000000-0000-0000-0000-000000000005';
  v_cash_appointment_id constant uuid := '10000000-0000-0000-0000-000000000006';
  v_refund_appointment_id constant uuid := '10000000-0000-0000-0000-000000000007';
  v_package_appointment_id constant uuid := '10000000-0000-0000-0000-000000000008';
  v_payment_id constant uuid := '10000000-0000-0000-0000-000000000009';
  v_voucher_id constant uuid := '10000000-0000-0000-0000-000000000010';
  v_service_id constant uuid := '10000000-0000-0000-0000-000000000011';
  v_package_id constant uuid := '10000000-0000-0000-0000-000000000012';
  v_request_id uuid;
  v_refund_id uuid;
  v_entitlement_id uuid;
  v_result jsonb;
  v_count integer;
  v_amount numeric;
  v_status text;
  v_actor_id uuid;
begin
  if to_regclass('public.customer_credit_grants') is null
     or to_regclass('public.customer_credit_ledger') is null
     or to_regclass('public.customer_credit_reservations') is null
     or to_regclass('public.voucher_redemptions') is null
     or to_regclass('public.customer_package_entitlements') is null
     or to_regclass('public.package_entitlement_reservations') is null then
    raise exception 'Customer value schema is incomplete';
  end if;

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  )
  values
    (
      v_owner_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'owner@test.local', '',
      now(), '{}'::jsonb, '{}'::jsonb, now(), now()
    ),
    (
      v_staff_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'staff@test.local', '',
      now(), '{}'::jsonb, '{}'::jsonb, now(), now()
    );

  insert into public.tenants (id, name, slug, country, currency, timezone)
  values (v_tenant_id, 'Customer Value Test', 'customer-value-test', 'GH', 'GHS', 'Africa/Accra');

  insert into public.user_roles (user_id, tenant_id, role, is_active)
  values
    (v_owner_id, v_tenant_id, 'owner', true),
    (v_staff_id, v_tenant_id, 'staff', true);

  insert into public.customers (id, tenant_id, full_name, email)
  values (v_customer_id, v_tenant_id, 'Test Customer', 'customer@test.local');

  insert into public.locations (id, tenant_id, name, country, city, timezone, is_default)
  values (v_location_id, v_tenant_id, 'Accra Test Branch', 'GH', 'Accra', 'Africa/Accra', true);

  insert into public.appointments (
    id, tenant_id, location_id, customer_id, scheduled_start, scheduled_end,
    total_amount, amount_paid, payment_status
  )
  values
    (
      v_cash_appointment_id, v_tenant_id, v_location_id, v_customer_id,
      now() + interval '1 day', now() + interval '2 days',
      100, 0, 'unpaid'
    ),
    (
      v_refund_appointment_id, v_tenant_id, v_location_id, v_customer_id,
      now() + interval '3 days', now() + interval '4 days',
      100, 100, 'fully_paid'
    ),
    (
      v_package_appointment_id, v_tenant_id, v_location_id, v_customer_id,
      now() + interval '5 days', now() + interval '6 days',
      0, 0, 'unpaid'
    );

  perform set_config('request.jwt.claim.sub', v_staff_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  v_result := public.record_offline_cash_payment(
    v_cash_appointment_id, 25, 'CASH-001', 'Front desk cash'
  );

  if (v_result ->> 'payment_status') <> 'deposit_paid'
     or (v_result ->> 'amount_paid')::numeric <> 25 then
    raise exception 'Offline payment did not update appointment totals';
  end if;

  select count(*) into v_count
  from public.journal_entries je
  join public.transactions t on t.id = je.transaction_id
  join public.locations l on l.id = je.location_id
  where je.appointment_id = v_cash_appointment_id
    and je.payment_method = 'cash'
    and t.provider = 'offline'
    and l.id = v_location_id;
  if v_count <> 1 then
    raise exception 'Offline payment was not linked across ledger, transaction, and location';
  end if;

  begin
    perform public.record_offline_cash_payment(v_cash_appointment_id, 76, null, null);
    raise exception 'Overpayment unexpectedly succeeded';
  exception
    when others then
      if sqlerrm = 'Overpayment unexpectedly succeeded' then raise; end if;
  end;

  insert into public.transactions (
    id, tenant_id, customer_id, appointment_id, type, method,
    amount, currency, provider, status, created_by_id
  )
  values (
    v_payment_id, v_tenant_id, v_customer_id, v_refund_appointment_id,
    'payment', 'card', 100, 'GHS', 'paystack', 'completed', v_staff_id
  );

  v_request_id := public.request_transaction_refund(
    v_payment_id, 30, 'offline', 'Customer complaint'
  );

  perform set_config('request.jwt.claim.sub', v_owner_id::text, true);
  v_refund_id := public.complete_transaction_refund(
    v_payment_id, 30, 'offline', 'Approved customer complaint', v_request_id
  );

  select status, approved_by_id
  into v_status, v_actor_id
  from public.refund_requests
  where id = v_request_id;
  if v_status <> 'completed' or v_actor_id <> v_owner_id then
    raise exception 'Refund approval actor or status was not recorded';
  end if;

  if not exists (
    select 1 from public.transactions
    where id = v_refund_id
      and type = 'refund'
      and original_transaction_id = v_payment_id
      and created_by_id = v_owner_id
      and amount = 30
  ) then
    raise exception 'Completed refund transaction is incorrect';
  end if;

  select amount_paid, payment_status::text
  into v_amount, v_status
  from public.appointments
  where id = v_refund_appointment_id;
  if v_amount <> 70 or v_status <> 'refunded_partial' then
    raise exception 'Partial refund did not update the appointment';
  end if;

  perform public.complete_transaction_refund(
    v_payment_id, 20, 'store_credit', 'Goodwill credit', null
  );
  if public.customer_credit_available(v_tenant_id, v_customer_id) <> 20 then
    raise exception 'Store-credit refund did not create spendable customer credit';
  end if;

  begin
    perform public.complete_transaction_refund(
      v_payment_id, 50.01, 'offline', 'Exceeds balance', null
    );
    raise exception 'Excess refund unexpectedly succeeded';
  exception
    when others then
      if sqlerrm = 'Excess refund unexpectedly succeeded' then raise; end if;
  end;

  insert into public.vouchers (
    id, tenant_id, code, amount, balance, status, voucher_type,
    access_type, discount_type, discount_value, target_customer_id
  )
  values (
    v_voucher_id, v_tenant_id, 'PRIVATE40', 40, 40, 'active',
    'gift', 'private', 'fixed', 40, v_customer_id
  );

  perform public.claim_voucher_to_balance(v_tenant_id, v_customer_id, 'private40');
  if public.customer_credit_available(v_tenant_id, v_customer_id) <> 60 then
    raise exception 'Voucher claim did not preserve the full unused value';
  end if;
  if not exists (
    select 1 from public.voucher_redemptions
    where voucher_id = v_voucher_id and customer_id = v_customer_id
      and event_type = 'claim' and amount = 40
  ) then
    raise exception 'Voucher claim history was not recorded';
  end if;

  insert into public.services (id, tenant_id, name, duration_minutes, price, status)
  values (v_service_id, v_tenant_id, 'Package Service', 60, 75, 'active');
  insert into public.packages (id, tenant_id, name, price, status)
  values (v_package_id, v_tenant_id, 'Two Visit Package', 120, 'active');
  insert into public.package_items (package_id, service_id, quantity)
  values (v_package_id, v_service_id, 2);

  v_entitlement_id := public.issue_customer_package(
    v_tenant_id, v_customer_id, v_package_id, null, null
  );
  perform public.reserve_customer_package_credit(v_package_appointment_id, v_service_id);
  update public.appointments
  set status = 'completed'
  where id = v_package_appointment_id;

  if not exists (
    select 1
    from public.customer_package_entitlement_items
    where entitlement_id = v_entitlement_id
      and service_id = v_service_id
      and total_quantity = 2
      and remaining_quantity = 1
      and reserved_quantity = 0
  ) or not exists (
    select 1
    from public.package_entitlement_reservations
    where appointment_id = v_package_appointment_id and status = 'consumed'
  ) then
    raise exception 'Package credit was not issued, reserved, and consumed correctly';
  end if;
end;
$$;

rollback;
