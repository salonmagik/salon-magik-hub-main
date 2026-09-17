\set ON_ERROR_STOP on

begin;

do $$
declare
  -- Scenario A: basic debit flow, exact-balance debit, idempotent retry
  v_tenant_a constant uuid := '20000000-0000-0000-0000-000000000001';
  v_owner_a constant uuid := '20000000-0000-0000-0000-000000000002';
  v_customer_a constant uuid := '20000000-0000-0000-0000-000000000003';
  v_txn_a1 constant uuid := '20000000-0000-0000-0000-000000000004';
  v_txn_a2 constant uuid := '20000000-0000-0000-0000-000000000005';

  -- Scenario B: insufficient balance (block event), purse-funded (no debit)
  v_tenant_b constant uuid := '20000000-0000-0000-0000-000000000010';
  v_owner_b constant uuid := '20000000-0000-0000-0000-000000000011';
  v_customer_b constant uuid := '20000000-0000-0000-0000-000000000012';
  v_txn_b1 constant uuid := '20000000-0000-0000-0000-000000000013';
  v_txn_b2 constant uuid := '20000000-0000-0000-0000-000000000014';

  -- Scenario C: complete_transaction_refund validation, recoverability check,
  -- backoffice access, over-refund bound
  v_tenant_c constant uuid := '20000000-0000-0000-0000-000000000020';
  v_owner_c constant uuid := '20000000-0000-0000-0000-000000000021';
  v_staff_c constant uuid := '20000000-0000-0000-0000-000000000022';
  v_customer_c constant uuid := '20000000-0000-0000-0000-000000000023';
  v_txn_c1 constant uuid := '20000000-0000-0000-0000-000000000024';
  v_txn_c2 constant uuid := '20000000-0000-0000-0000-000000000025';

  -- Scenario D: reversal
  v_tenant_d constant uuid := '20000000-0000-0000-0000-000000000030';
  v_owner_d constant uuid := '20000000-0000-0000-0000-000000000031';
  v_customer_d constant uuid := '20000000-0000-0000-0000-000000000032';
  v_txn_d1 constant uuid := '20000000-0000-0000-0000-000000000033';

  v_result jsonb;
  v_entry_id uuid;
  v_entry_id_2 uuid;
  v_balance numeric;
  v_count integer;
  v_refund_id uuid;
  v_wallet_debit_entry_id uuid;
  v_raised boolean;
begin
  if to_regclass('public.refund_block_events') is null then
    raise exception 'refund_block_events table is missing';
  end if;

  -- ===================== Fixtures =====================

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  )
  values
    (v_owner_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@test.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_owner_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@test.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_owner_c, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-c@test.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_staff_c, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff-c@test.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_owner_d, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-d@test.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  insert into public.tenants (id, name, slug, country, currency, timezone)
  values
    (v_tenant_a, 'Refund Clawback A', 'refund-clawback-a', 'GH', 'GHS', 'Africa/Accra'),
    (v_tenant_b, 'Refund Clawback B', 'refund-clawback-b', 'GH', 'GHS', 'Africa/Accra'),
    (v_tenant_c, 'Refund Clawback C', 'refund-clawback-c', 'GH', 'GHS', 'Africa/Accra'),
    (v_tenant_d, 'Refund Clawback D', 'refund-clawback-d', 'GH', 'GHS', 'Africa/Accra');

  insert into public.user_roles (user_id, tenant_id, role, is_active)
  values
    (v_owner_a, v_tenant_a, 'owner', true),
    (v_owner_b, v_tenant_b, 'owner', true),
    (v_owner_c, v_tenant_c, 'owner', true),
    (v_staff_c, v_tenant_c, 'staff', true),
    (v_owner_d, v_tenant_d, 'owner', true);

  insert into public.customers (id, tenant_id, full_name, email)
  values
    (v_customer_a, v_tenant_a, 'Customer A', 'customer-a@test.local'),
    (v_customer_b, v_tenant_b, 'Customer B', 'customer-b@test.local'),
    (v_customer_c, v_tenant_c, 'Customer C', 'customer-c@test.local'),
    (v_customer_d, v_tenant_d, 'Customer D', 'customer-d@test.local');

  -- A trigger auto-creates a zero-balance salon_wallets row for every new
  -- tenant, so fund the wallets with an update rather than an insert.
  update public.salon_wallets set balance = 300 where tenant_id = v_tenant_a;
  update public.salon_wallets set balance = 50 where tenant_id = v_tenant_b;
  update public.salon_wallets set balance = 500 where tenant_id = v_tenant_c;
  update public.salon_wallets set balance = 300 where tenant_id = v_tenant_d;

  insert into public.transactions (
    id, tenant_id, customer_id, type, method, amount, currency,
    provider, provider_reference, status, created_by_id
  )
  values
    (v_txn_a1, v_tenant_a, v_customer_a, 'payment', 'card', 100, 'GHS', 'paystack', 'ref-a1', 'completed', v_owner_a),
    (v_txn_a2, v_tenant_a, v_customer_a, 'payment', 'card', 200, 'GHS', 'paystack', 'ref-a2', 'completed', v_owner_a),
    (v_txn_b1, v_tenant_b, v_customer_b, 'payment', 'card', 100, 'GHS', 'paystack', 'ref-b1', 'completed', v_owner_b),
    (v_txn_b2, v_tenant_b, v_customer_b, 'payment', 'purse', 30, 'GHS', 'customer_purse', 'ref-b2', 'completed', v_owner_b),
    (v_txn_c1, v_tenant_c, v_customer_c, 'payment', 'card', 500, 'GHS', 'paystack', 'ref-c1', 'completed', v_owner_c),
    (v_txn_c2, v_tenant_c, v_customer_c, 'payment', 'card', 100, 'GHS', 'paystack', 'ref-c2', 'completed', v_owner_c),
    (v_txn_d1, v_tenant_d, v_customer_d, 'payment', 'card', 100, 'GHS', 'paystack', 'ref-d1', 'completed', v_owner_d);

  -- ===================== Test 1: sufficient balance debits and ledgers =====================

  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  v_result := public.debit_salon_wallet_for_refund(
    v_txn_a1, 100, 'paystack', 'Card refund test', v_owner_a, 'clawback-a1'
  );

  if (v_result ->> 'ok')::boolean is not true then
    raise exception 'Test 1 failed: sufficient-balance debit did not return ok:true (got %)', v_result;
  end if;

  select balance into v_balance from public.salon_wallets where tenant_id = v_tenant_a;
  if v_balance <> 200 then
    raise exception 'Test 1 failed: wallet balance should be 200 after debiting 100 from 300, got %', v_balance;
  end if;

  select count(*) into v_count
  from public.wallet_ledger_entries
  where tenant_id = v_tenant_a
    and idempotency_key = 'clawback-a1'
    and entry_type = 'salon_purse_debit_refund'
    and amount = -100;
  if v_count <> 1 then
    raise exception 'Test 1 failed: expected exactly one negative salon_purse_debit_refund ledger row, got %', v_count;
  end if;

  -- ===================== Test 4: retried idempotency key is a no-op =====================

  v_result := public.debit_salon_wallet_for_refund(
    v_txn_a1, 100, 'paystack', 'Card refund test', v_owner_a, 'clawback-a1'
  );
  if (v_result ->> 'ok')::boolean is not true then
    raise exception 'Test 4 failed: retried debit should still return ok:true';
  end if;

  select balance into v_balance from public.salon_wallets where tenant_id = v_tenant_a;
  if v_balance <> 200 then
    raise exception 'Test 4 failed: wallet should not be debited twice, balance should remain 200, got %', v_balance;
  end if;

  select count(*) into v_count
  from public.wallet_ledger_entries
  where tenant_id = v_tenant_a and idempotency_key = 'clawback-a1';
  if v_count <> 1 then
    raise exception 'Test 4 failed: retried idempotency key produced % ledger rows, expected 1', v_count;
  end if;

  -- ===================== Test 3: balance exactly equal to refund amount =====================

  v_result := public.debit_salon_wallet_for_refund(
    v_txn_a2, 200, 'paystack', 'Exact balance refund', v_owner_a, 'clawback-a2'
  );
  if (v_result ->> 'ok')::boolean is not true then
    raise exception 'Test 3 failed: exact-balance debit should succeed (got %)', v_result;
  end if;

  select balance into v_balance from public.salon_wallets where tenant_id = v_tenant_a;
  if v_balance <> 0 then
    raise exception 'Test 3 failed: wallet balance should be exactly 0, got %', v_balance;
  end if;

  -- ===================== Test 2: insufficient balance blocks and records =====================

  perform set_config('request.jwt.claim.sub', v_owner_b::text, true);

  v_result := public.debit_salon_wallet_for_refund(
    v_txn_b1, 100, 'paystack', 'Cannot cover this', v_owner_b, 'clawback-b1'
  );

  if (v_result ->> 'ok')::boolean is not false then
    raise exception 'Test 2 failed: insufficient-balance debit should return ok:false (got %)', v_result;
  end if;
  if v_result ->> 'code' <> 'INSUFFICIENT_RECOVERABLE_FUNDS' then
    raise exception 'Test 2 failed: expected INSUFFICIENT_RECOVERABLE_FUNDS, got %', v_result ->> 'code';
  end if;
  if (v_result ->> 'shortfall')::numeric <> 50 then
    raise exception 'Test 2 failed: expected shortfall of 50, got %', v_result ->> 'shortfall';
  end if;

  select balance into v_balance from public.salon_wallets where tenant_id = v_tenant_b;
  if v_balance <> 50 then
    raise exception 'Test 2 failed: blocked attempt must not change the wallet balance, got %', v_balance;
  end if;

  if not exists (
    select 1 from public.refund_block_events
    where tenant_id = v_tenant_b
      and transaction_id = v_txn_b1
      and attempted_amount = 100
      and wallet_balance_at_attempt = 50
      and shortfall = 50
      and block_code = 'INSUFFICIENT_RECOVERABLE_FUNDS'
  ) then
    raise exception 'Test 2 failed: no matching refund_block_events row was recorded';
  end if;

  -- ===================== Test 5: purse-funded transaction needs no debit =====================

  v_result := public.debit_salon_wallet_for_refund(
    v_txn_b2, 30, 'store_credit', 'Purse-funded refund', v_owner_b, 'clawback-b2'
  );
  if (v_result ->> 'ok')::boolean is not true or v_result ->> 'ledger_entry_id' is not null then
    raise exception 'Test 5 failed: purse-funded refund should return ok:true with a null ledger_entry_id (got %)', v_result;
  end if;

  select balance into v_balance from public.salon_wallets where tenant_id = v_tenant_b;
  if v_balance <> 50 then
    raise exception 'Test 5 failed: purse-funded refund must not touch the salon wallet, got %', v_balance;
  end if;

  if exists (select 1 from public.refund_block_events where transaction_id = v_txn_b2) then
    raise exception 'Test 5 failed: purse-funded refund must not create a block event';
  end if;

  -- ===================== Tests 6-9: complete_transaction_refund wallet guard =====================

  perform set_config('request.jwt.claim.sub', v_owner_c::text, true);

  -- Test 6: no wallet debit supplied for a gateway-funded store_credit refund
  v_raised := false;
  begin
    perform public.complete_transaction_refund(v_txn_c1, 150, 'store_credit', 'Missing debit', null, null);
  exception
    when others then
      if sqlerrm like 'REFUND_WALLET_DEBIT_REQUIRED%' then
        v_raised := true;
      else
        raise;
      end if;
  end;
  if not v_raised then
    raise exception 'Test 6 failed: expected REFUND_WALLET_DEBIT_REQUIRED';
  end if;
  if exists (select 1 from public.transactions where original_transaction_id = v_txn_c1) then
    raise exception 'Test 6 failed: blocked completion must not have inserted a refund transaction';
  end if;

  v_result := public.debit_salon_wallet_for_refund(
    v_txn_c1, 150, 'store_credit', 'Refund test', v_owner_c, 'clawback-c1'
  );
  v_entry_id := (v_result ->> 'ledger_entry_id')::uuid;
  if v_entry_id is null then
    raise exception 'Test setup failed: expected a wallet debit entry id for tenant C';
  end if;

  -- Test 7: mismatched entry (wrong amount) is rejected
  v_raised := false;
  begin
    perform public.complete_transaction_refund(v_txn_c1, 100, 'store_credit', 'Mismatched amount', null, v_entry_id);
  exception
    when others then
      if sqlerrm like 'REFUND_WALLET_DEBIT_INVALID%' then
        v_raised := true;
      else
        raise;
      end if;
  end;
  if not v_raised then
    raise exception 'Test 7 failed: expected REFUND_WALLET_DEBIT_INVALID for a mismatched debit entry';
  end if;

  -- Test 9: a valid entry succeeds and stores wallet_debit_entry_id
  v_refund_id := public.complete_transaction_refund(v_txn_c1, 150, 'store_credit', 'Valid refund', null, v_entry_id);

  select wallet_debit_entry_id into v_wallet_debit_entry_id
  from public.refund_requests
  where processed_transaction_id = v_refund_id;
  if v_wallet_debit_entry_id <> v_entry_id then
    raise exception 'Test 9 failed: refund_requests.wallet_debit_entry_id was not stored correctly';
  end if;

  -- Test 8: the same debit entry cannot back a second refund
  v_raised := false;
  begin
    perform public.complete_transaction_refund(v_txn_c1, 150, 'store_credit', 'Reused debit', null, v_entry_id);
  exception
    when others then
      v_raised := true;
  end;
  if not v_raised then
    raise exception 'Test 8 failed: reusing the same wallet_debit_entry_id for a second refund should fail';
  end if;

  -- ===================== Test 10: offline refund needs no debit =====================

  v_refund_id := public.complete_transaction_refund(v_txn_c2, 50, 'offline', 'Handled in person', null, null);
  if v_refund_id is null then
    raise exception 'Test 10 failed: offline refund should complete without a wallet debit';
  end if;

  -- ===================== Test 13: over-refund bound still holds with a flush wallet =====================

  v_raised := false;
  begin
    perform public.complete_transaction_refund(v_txn_c2, 100, 'offline', 'Exceeds remaining balance', null, null);
  exception
    when others then
      if sqlerrm = 'Refund exceeds the remaining refundable amount' then
        v_raised := true;
      else
        raise;
      end if;
  end;
  if not v_raised then
    raise exception 'Test 13 failed: over-refund bound did not reject a refund exceeding the remaining amount';
  end if;

  -- ===================== Test 11: check_refund_recoverability access control =====================

  perform set_config('request.jwt.claim.sub', v_staff_c::text, true);
  v_raised := false;
  begin
    perform public.check_refund_recoverability(v_txn_c2);
  exception
    when others then
      v_raised := true;
  end;
  if not v_raised then
    raise exception 'Test 11 failed: staff (non owner/manager) should not be able to call check_refund_recoverability';
  end if;

  perform set_config('request.jwt.claim.sub', v_owner_c::text, true);
  v_result := public.check_refund_recoverability(v_txn_c2);
  if v_result ->> 'wallet_balance' is null then
    raise exception 'Test 11 failed: owner should receive a wallet balance from check_refund_recoverability';
  end if;

  -- ===================== Test 12: backoffice RPC access control =====================

  v_raised := false;
  begin
    perform public.get_backoffice_blocked_refunds(50, 0);
  exception
    when others then
      if sqlerrm = 'BACKOFFICE_ACCESS_REQUIRED' then
        v_raised := true;
      else
        raise;
      end if;
  end;
  if not v_raised then
    raise exception 'Test 12 failed: non-backoffice user should not be able to call get_backoffice_blocked_refunds';
  end if;

  -- ===================== Test 14: reversal restores the balance and is idempotent =====================

  perform set_config('request.jwt.claim.sub', v_owner_d::text, true);

  v_result := public.debit_salon_wallet_for_refund(
    v_txn_d1, 100, 'paystack', 'Will be reversed', v_owner_d, 'clawback-d1'
  );
  if (v_result ->> 'ok')::boolean is not true then
    raise exception 'Test 14 setup failed: debit before reversal did not succeed';
  end if;

  select balance into v_balance from public.salon_wallets where tenant_id = v_tenant_d;
  if v_balance <> 200 then
    raise exception 'Test 14 setup failed: expected balance 200 after debiting 100 from 300, got %', v_balance;
  end if;

  v_entry_id_2 := public.reverse_refund_wallet_debit(v_tenant_d, v_txn_d1, 100, 'GHS', 'clawback-d1');

  select balance into v_balance from public.salon_wallets where tenant_id = v_tenant_d;
  if v_balance <> 300 then
    raise exception 'Test 14 failed: reversal should restore the balance to 300, got %', v_balance;
  end if;

  if not exists (
    select 1 from public.wallet_ledger_entries
    where id = v_entry_id_2 and entry_type = 'salon_purse_reversal' and amount = 100
  ) then
    raise exception 'Test 14 failed: reversal did not write a salon_purse_reversal ledger entry';
  end if;

  -- Reversing twice must not double-credit
  perform public.reverse_refund_wallet_debit(v_tenant_d, v_txn_d1, 100, 'GHS', 'clawback-d1');

  select balance into v_balance from public.salon_wallets where tenant_id = v_tenant_d;
  if v_balance <> 300 then
    raise exception 'Test 14 failed: a repeated reversal must not change the balance again, got %', v_balance;
  end if;

  select count(*) into v_count
  from public.wallet_ledger_entries
  where tenant_id = v_tenant_d and entry_type = 'salon_purse_reversal';
  if v_count <> 1 then
    raise exception 'Test 14 failed: expected exactly one reversal ledger row, got %', v_count;
  end if;
end;
$$;

rollback;
