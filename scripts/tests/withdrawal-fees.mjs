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
  create table user_roles(tenant_id uuid, user_id uuid, is_active boolean);
  create table salon_payout_destinations(id uuid primary key, tenant_id uuid, currency text, destination_type text);
`);
await migration('20260221120000_create_purse_enums_and_salon_wallets.sql');
await migration('20260221120001_create_wallet_ledger_entries.sql');
await migration('20260221120003_create_salon_withdrawals.sql');
await db.exec(`alter type withdrawal_status add value 'awaiting_otp';`);
await migration('20260906120100_wallet_availability_excludes_inflight_withdrawals.sql');
await migration('20260916120000_lower_ngn_withdrawal_minimum.sql');
await migration('20260916121000_salon_withdrawal_transfer_fees.sql');
let checks = 0;
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const reject = async (sql, params=[]) => { await assert.rejects(db.query(sql, params)); checks++; };
const fixture = async (currency='GHS', balance=1000, destination='bank') => {
  const ids = [crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()];
  await db.query('insert into tenants(id) values ($1)', [ids[0]]);
  await db.query('insert into salon_wallets(id,tenant_id,currency,balance) values ($1,$2,$3,$4)', [ids[1],ids[0],currency,balance]);
  await db.query('insert into salon_payout_destinations values($1,$2,$3,$4)', [ids[2],ids[0],currency,destination]);
  return { tenant:ids[0],wallet:ids[1],destination:ids[2],currency };
};
const reserve = async (f, amount, fee, duty=0, version='paystack-2026-09-16') => {
  const id = crypto.randomUUID();
  await db.query(`insert into salon_withdrawals(id,tenant_id,salon_wallet_id,payout_destination_id,currency,amount,transfer_fee,stamp_duty,fee_version)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id,f.tenant,f.wallet,f.destination,f.currency,amount,fee,duty,version]);
  return id;
};
const finish = (id, outcome, refunded=false) => db.query('select finalize_fee_bearing_withdrawal($1,$2,$3)', [id,outcome,refunded]);
const balance = async (f) => Number((await db.query('select balance from salon_wallets where id=$1',[f.wallet])).rows[0].balance);
const available = async (f) => Number((await db.query('select available from get_salon_wallet_availability($1)',[f.tenant])).rows[0].available);
const f = await fixture();
check(Number((await db.query('select min_withdrawal_ngn from tenants where id=$1',[f.tenant])).rows[0].min_withdrawal_ngn),500);
const id = await reserve(f,100,8);
check(await balance(f),1000); check(await available(f),892);
await assert.rejects(reserve(f,900,8)); checks++;
await finish(id,'success'); check(await balance(f),892); check(await available(f),892);
await finish(id,'success'); check(await balance(f),892);
await finish(id,'failed'); check(await balance(f),892);
check(Number((await db.query('select count(*) from wallet_ledger_entries where reference_id=$1',[id])).rows[0].count),1);
await finish(id,'reversed'); check(await balance(f),992);
await finish(id,'reversed'); check(await balance(f),992);
await finish(id,'success'); check(await balance(f),992);
await finish(id,'reversed',true); check(await balance(f),1000);
await finish(id,'reversed'); check(await balance(f),1000);
check((await db.query('select fee_reconciliation_required from salon_withdrawals where id=$1',[id])).rows[0].fee_reconciliation_required,false);
await reject('update salon_withdrawals set transfer_fee=0 where id=$1',[id]);
const ng = await fixture('NGN',20000);
const ngId = await reserve(ng,10000,25,50);
check(await available(ng),9925);
await finish(ngId,'success'); check(await balance(ng),9925);
await finish(ngId,'reversed',true); check(await balance(ng),19950);
await finish(ngId,'reversed'); check(await balance(ng),19950);
const failed = await reserve(ng,10000,25,50);
await finish(failed,'failed'); check(await balance(ng),19900);
await finish(failed,'failed'); check(await balance(ng),19900);
await finish(failed,'success'); check(await balance(ng),19900);
const ghFail = await reserve(f,100,8);
await finish(ghFail,'failed'); check(await balance(f),1000); check(await available(f),1000);
await assert.rejects(reserve(f,100,1)); checks++;
await assert.rejects(reserve(f,49,8)); checks++;
await assert.rejects(reserve(ng,10000,25,0)); checks++;
const mm = await fixture('GHS',51,'mobile_money');
const mmId = await reserve(mm,50,1); check(await available(mm),0);
await finish(mmId,'success'); check(await balance(mm),0);
const legacy = await reserve(f,100,0,0,null);
await reject('select finalize_fee_bearing_withdrawal($1,$2)',[legacy,'success']);
check(await balance(f),1000);
await db.exec("set test.role = 'authenticated'");
await reject('select finalize_fee_bearing_withdrawal($1,$2)',[id,'success']);
await assert.rejects(reserve(f,100,8)); checks++;
await reject('update salon_withdrawals set status=\'pending\' where id=$1',[id]);
await db.exec("set test.role = 'service_role'");
// Recent credits are not withdrawable, even when the raw wallet covers fees.
const unsettled = await fixture('GHS',1000);
await db.query(`insert into wallet_ledger_entries(tenant_id,wallet_type,wallet_id,entry_type,currency,amount,balance_before,balance_after)
  values($1,'salon',$2,'salon_purse_credit_booking','GHS',950,50,1000)`,[unsettled.tenant,unsettled.wallet]);
check(await available(unsettled),50);
await assert.rejects(reserve(unsettled,50,8)); checks++;
// Different payout destinations still share the same fee-inclusive reservation.
const concurrent = await fixture('GHS',110);
const other = {...concurrent,destination:crypto.randomUUID()};
await db.query('insert into salon_payout_destinations values($1,$2,$3,$4)',[other.destination,other.tenant,'GHS','bank']);
const concurrentResults = await Promise.allSettled([reserve(concurrent,50,8),reserve(other,50,8)]);
check(concurrentResults.filter(r=>r.status==='fulfilled').length,1);
check(await available(concurrent),52);
// An out-of-order reversal releases the principal without a success callback.
const reverseFirst = await fixture('GHS',1000);
const reverseId = await reserve(reverseFirst,100,8);
await finish(reverseId,'reversed'); check(await balance(reverseFirst),992);
await finish(reverseId,'success'); check(await balance(reverseFirst),992);
await finish(reverseId,'reversed',true); check(await balance(reverseFirst),1000);
await db.close();
console.log(`${checks} PostgreSQL accounting assertions passed`);
