// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite module.
// Uses an isolated in-memory PostgreSQL engine; never connects to Supabase.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const migration = async (file) => db.exec(await readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create function auth.role() returns text language sql as $$ select coalesce(current_setting('test.role', true), 'service_role') $$;
  create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
  create table tenants(id uuid primary key, min_withdrawal_ngn numeric default 1000, min_withdrawal_ghs numeric default 50);
  create table user_roles(tenant_id uuid, user_id uuid, is_active boolean, role text); create table auth.users(id uuid primary key);
  create table salon_payout_destinations(id uuid primary key, tenant_id uuid, currency text, destination_type text);
`);
await migration('20260221120000_create_purse_enums_and_salon_wallets.sql');
await migration('20260221120001_create_wallet_ledger_entries.sql');
await migration('20260221120003_create_salon_withdrawals.sql');
await db.exec(`alter type withdrawal_status add value 'awaiting_otp';`);
await migration('20260906120100_wallet_availability_excludes_inflight_withdrawals.sql');
await migration('20260916120000_lower_ngn_withdrawal_minimum.sql');
await migration('20260916121000_salon_withdrawal_transfer_fees.sql');

await db.exec(`
 create type refund_type as enum ('paystack','store_credit','original_method','offline');
 create type payment_method as enum ('card','purse','cash','transfer');
 create type payment_status as enum ('paid','refunded_full','refunded_partial');
 create table appointments(id uuid primary key, amount_paid numeric, payment_status payment_status, updated_at timestamptz);
 create table transactions(id uuid primary key default gen_random_uuid(), tenant_id uuid,customer_id uuid,appointment_id uuid,type text,method payment_method,amount numeric,currency text,provider text,provider_reference text,status text,created_by_id uuid,original_transaction_id uuid,refund_request_id uuid,created_at timestamptz default now(),paystack_reference text,payment_group_id uuid);
 create table refund_requests(id uuid primary key default gen_random_uuid(), tenant_id uuid,transaction_id uuid,customer_id uuid,refund_type refund_type,amount numeric,reason text,status text,requested_by_id uuid,approved_by_id uuid,approved_at timestamptz,processed_transaction_id uuid,updated_at timestamptz);
 create function log_audit_event(uuid,text,text,uuid,jsonb,jsonb) returns void language sql as $$ select $$;
 create table payment_intents(id uuid primary key,tenant_id uuid,intent_type text,amount numeric,currency text,metadata jsonb);
 create table communication_credits(tenant_id uuid primary key,balance integer,updated_at timestamptz);
 create table messaging_credit_purchases(id uuid primary key default gen_random_uuid(),tenant_id uuid,credits integer,currency text,amount numeric,paid_via text,payment_intent_id uuid,gateway_reference text);
 create function refund_customer_balance_reservation(uuid,numeric,boolean) returns boolean language sql as $$ select false $$;
 create function credit_customer_balance(uuid,uuid,numeric,text,text,uuid,boolean,timestamptz,text,text,jsonb) returns uuid language sql as $$ select gen_random_uuid() $$;
`);
await migration('20260410061930_add_salon_purse_debit_refund_entry_type.sql');
await migration('20260408040000_fix_debit_salon_purse_reference_id_type.sql');
await db.exec((await readFile(new URL('../../supabase/migrations/20260726000003_backoffice_function_validation_fixes.sql', import.meta.url), 'utf8')).split('create or replace function public.create_wallet_reversal')[1].replace(/^/, 'create or replace function public.create_wallet_reversal'));
await migration('20260907090000_refund_block_events.sql');
await migration('20260907090100_refund_wallet_debit_rpcs.sql');
await migration('20260907090200_refund_requests_wallet_debit_link.sql');
await migration('20260915110500_refund_wallet_debit_net_amount.sql');
await migration('20260917100000_payment_record_idempotency.sql');
await migration('20260917102000_paystack_refund_reconciliation.sql');
await migration('20260917104000_atomic_local_refunds.sql');
let checks=0;
const check=(actual,expected)=>{ assert.deepEqual(actual,expected); checks++; };
const reject=async(sql,args=[])=>{await assert.rejects(db.query(sql,args));checks++;};
const tenant=crypto.randomUUID(), actor=crypto.randomUUID(), customer=crypto.randomUUID(), wallet=crypto.randomUUID();
await db.query('insert into tenants(id) values($1)',[tenant]);
await db.query('insert into auth.users values($1)',[actor]);
await db.query("insert into user_roles values($1,$2,true,'owner')",[tenant,actor]);
await db.query("insert into salon_wallets(id,tenant_id,currency,balance) values($1,$2,'GHS',995)",[wallet,tenant]);
const record={tenant_id:tenant,customer_id:customer,type:'payment',method:'card',amount:1000,currency:'GHS',provider:'paystack',provider_reference:'test-charge',status:'completed'};
const payment=await db.query('select record_gateway_payment($1) as result',[record]);
const transaction=payment.rows[0].result.id;
check(payment.rows[0].result.duplicate,false);
check((await db.query('select record_gateway_payment($1) as result',[record])).rows[0].result.duplicate,true);
await db.query(`insert into wallet_ledger_entries(tenant_id,wallet_type,wallet_id,entry_type,currency,amount,balance_before,balance_after,gateway_reference)
 values($1,'salon',$2,'salon_purse_credit_booking','GHS',995,0,995,'test-charge')`,[tenant,wallet]);
const prepare=(amount,key)=>db.query("select prepare_paystack_refund($1,$2,'Customer refund',$3,$4) as result",[transaction,amount,actor,key]);
const settle=(local,provider,amount,status)=>db.query("select reconcile_paystack_refund($1,'test-charge','GHS',$2,$3,$4) as result",[provider,amount,status,local]);
const balance=async()=>Number((await db.query('select balance from salon_wallets where id=$1',[wallet])).rows[0].balance);
await assert.rejects(prepare(1001,'excess'));checks++;
const first=(await prepare(400,'partial-1')).rows[0].result;
check(await balance(),597);
check((await prepare(400,'partial-1')).rows[0].result.duplicate,true);
check(await balance(),597);
await assert.rejects(prepare(100,'other-inflight'));checks++;
check((await settle(first.id,'1',400,'pending')).rows[0].result.status,'pending');
check((await settle(first.id,'1',400,'processed')).rows[0].result.status,'processed');
check(await balance(),597);
await settle(first.id,'1',400,'processed'); check(await balance(),597);
await settle(first.id,'1',400,'pending'); check(await balance(),597);
check(Number((await db.query("select count(*) from transactions where type='refund'")).rows[0].count),1);
const second=(await prepare(600,'partial-2')).rows[0].result;
check(await balance(),0);
await settle(second.id,'2',600,'failed');check(await balance(),597);
await settle(second.id,'2',600,'failed');check(await balance(),597);
await settle(second.id,'2',600,'processed');check(await balance(),597);
const third=(await prepare(600,'partial-3')).rows[0].result;
await settle(third.id,'3',600,'processed');check(await balance(),0);
await assert.rejects(prepare(1,'excess-after-refund'));checks++;
// A dashboard-created Paystack refund may include customer-facing fees that
// were never credited to the salon. Only the remaining service amount is
// clawed back from the salon wallet; the provider amount remains auditable.
const externalRecord={...record,provider_reference:'external-charge',amount:100};
const external=(await db.query('select record_gateway_payment($1) as result',[externalRecord])).rows[0].result.id;
await db.query(`insert into wallet_ledger_entries(tenant_id,wallet_type,wallet_id,entry_type,currency,amount,balance_before,balance_after,gateway_reference)
 values($1,'salon',$2,'salon_purse_credit_booking','GHS',99.5,0,99.5,'external-charge')`,[tenant,wallet]);
await db.query('update salon_wallets set balance=99.5 where id=$1',[wallet]);
const externalResult=(await db.query("select reconcile_paystack_refund('external-1','external-charge','GHS',101,'processed') as result")).rows[0].result;
check(externalResult.status,'processed');
check(await balance(),0);
check(Number((await db.query("select amount from transactions where id=$1",[externalResult.refundId])).rows[0].amount),100);

// Store-credit completion is one idempotent database operation.
const localRecord={...record,provider_reference:'local-charge',amount:50};
const local=(await db.query('select record_gateway_payment($1) as result',[localRecord])).rows[0].result.id;
await db.query(`insert into wallet_ledger_entries(tenant_id,wallet_type,wallet_id,entry_type,currency,amount,balance_before,balance_after,gateway_reference)
 values($1,'salon',$2,'salon_purse_credit_booking','GHS',49.75,0,49.75,'local-charge')`,[tenant,wallet]);
await db.query('update salon_wallets set balance=49.75 where id=$1',[wallet]);
const localRefund=()=>db.query("select complete_local_refund($1,50,'store_credit','Service recovery',$2,'local-key') as result",[local,actor]);
check((await localRefund()).rows[0].result.duplicate,false);
check((await localRefund()).rows[0].result.duplicate,true);
check(await balance(),0);
const intent=crypto.randomUUID();
await db.query("insert into payment_intents values($1,$2,'messaging_credit_purchase',50,'GHS',$3)",[intent,tenant,{credits:10}]);
const purchase=()=>db.query("select complete_messaging_credit_purchase($1,$2,'message-charge',10,50,'GHS') as result",[tenant,intent]);
check((await purchase()).rows[0].result.duplicate,false);
check((await purchase()).rows[0].result.duplicate,true);
check(Number((await db.query('select balance from communication_credits where tenant_id=$1',[tenant])).rows[0].balance),10);
await db.exec("set test.role='authenticated'");
await reject('select record_gateway_payment($1)',[record]);
await assert.rejects(prepare(1,'unauthorized'));checks++;
await db.close();
console.log(`${checks} payment and refund PostgreSQL assertions passed`);
