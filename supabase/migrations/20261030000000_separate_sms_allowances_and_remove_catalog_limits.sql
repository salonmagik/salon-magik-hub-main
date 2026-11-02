-- Pricing and messaging policy foundation:
--   * catalog items are not billable or plan-limited;
--   * complimentary SMS is split by purpose (reminders vs marketing);
--   * purchased SMS is preserved separately from monthly complimentary grants;
--   * reminders only run for operational (trialing/active) tenants.

begin;

alter table public.communication_credits
  add column if not exists complimentary_reminder_sms_balance integer not null default 0,
  add column if not exists complimentary_marketing_sms_balance integer not null default 0,
  add column if not exists purchased_sms_balance integer not null default 0,
  add column if not exists last_complimentary_reset_at timestamptz;

-- Existing balances may contain purchased credits and/or the old free grant.
-- Preserve every existing credit during the migration. New sends use the
-- purpose-specific buckets below, and the legacy balance remains an aggregate
-- compatibility field for older clients until they are migrated.
update public.communication_credits
set purchased_sms_balance = greatest(coalesce(balance, 0), 0),
    last_complimentary_reset_at = null,
    updated_at = now()
where purchased_sms_balance = 0;

insert into public.platform_settings (key, value, description)
values (
  'sms_complimentary_allowances',
  jsonb_build_object(
    'default', jsonb_build_object(
      'reminder_segments', 100,
      'marketing_segments', 25
    )
  ),
  'Monthly complimentary SMS segments by purpose. Purchased SMS is separate and never reset.'
)
on conflict (key) do nothing;

create or replace function public.refresh_complimentary_sms_allowances(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_policy jsonb;
  v_reminder integer;
  v_marketing integer;
  v_period_start timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  v_last_reset timestamptz;
begin
  select value into v_policy
  from public.platform_settings
  where key = 'sms_complimentary_allowances';

  v_reminder := greatest(coalesce((v_policy->'default'->>'reminder_segments')::integer, 100), 0);
  v_marketing := greatest(coalesce((v_policy->'default'->>'marketing_segments')::integer, 25), 0);

  select last_complimentary_reset_at
  into v_last_reset
  from public.communication_credits
  where tenant_id = p_tenant_id
  for update;

  if not found then
    insert into public.communication_credits (
      tenant_id,
      balance,
      free_monthly_allocation,
      complimentary_reminder_sms_balance,
      complimentary_marketing_sms_balance,
      purchased_sms_balance,
      last_reset_at,
      last_complimentary_reset_at
    ) values (
      p_tenant_id,
      v_reminder + v_marketing,
      v_reminder + v_marketing,
      v_reminder,
      v_marketing,
      0,
      v_period_start,
      v_period_start
    );
    return;
  end if;

  if v_last_reset is null or v_last_reset < v_period_start then
    update public.communication_credits
    set complimentary_reminder_sms_balance = v_reminder,
        complimentary_marketing_sms_balance = v_marketing,
        free_monthly_allocation = v_reminder + v_marketing,
        last_reset_at = v_period_start,
        last_complimentary_reset_at = v_period_start,
        balance = v_reminder + v_marketing + greatest(coalesce(purchased_sms_balance, 0), 0),
        updated_at = now()
    where tenant_id = p_tenant_id;
  end if;
end;
$$;

create or replace function public.get_sms_credit_summary(p_tenant_id uuid)
returns table (
  reminder_complimentary integer,
  marketing_complimentary integer,
  purchased integer,
  total integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and not public.belongs_to_tenant(auth.uid(), p_tenant_id)
     and not public.is_backoffice_user(auth.uid()) then
    raise exception 'TENANT_ACCESS_DENIED';
  end if;

  perform public.refresh_complimentary_sms_allowances(p_tenant_id);

  return query
  select
    cc.complimentary_reminder_sms_balance,
    cc.complimentary_marketing_sms_balance,
    cc.purchased_sms_balance,
    cc.complimentary_reminder_sms_balance
      + cc.complimentary_marketing_sms_balance
      + cc.purchased_sms_balance
  from public.communication_credits cc
  where cc.tenant_id = p_tenant_id;
end;
$$;

-- Reserve complimentary credits for the requested purpose first, then use
-- purchased SMS. Returning the exact split makes provider-failure restoration
-- lossless and keeps the two complimentary policies auditable.
create or replace function public.reserve_sms_credits(
  p_tenant_id uuid,
  p_amount integer,
  p_purpose text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reminder integer;
  v_marketing integer;
  v_purchased integer;
  v_complimentary_used integer := 0;
  v_purchased_used integer := 0;
  v_remaining integer;
begin
  if p_amount is null or p_amount <= 0 or p_purpose not in ('appointment_reminder', 'marketing') then
    return jsonb_build_object('reserved', false, 'reason', 'invalid_request');
  end if;

  perform public.refresh_complimentary_sms_allowances(p_tenant_id);

  select complimentary_reminder_sms_balance,
         complimentary_marketing_sms_balance,
         purchased_sms_balance
  into v_reminder, v_marketing, v_purchased
  from public.communication_credits
  where tenant_id = p_tenant_id
  for update;

  if not found then
    return jsonb_build_object('reserved', false, 'reason', 'credits_missing');
  end if;

  if p_purpose = 'appointment_reminder' then
    v_complimentary_used := least(v_reminder, p_amount);
  else
    v_complimentary_used := least(v_marketing, p_amount);
  end if;

  v_remaining := p_amount - v_complimentary_used;
  v_purchased_used := least(v_purchased, v_remaining);

  if v_complimentary_used + v_purchased_used < p_amount then
    return jsonb_build_object('reserved', false, 'reason', 'insufficient_credits');
  end if;

  update public.communication_credits
  set complimentary_reminder_sms_balance = case
        when p_purpose = 'appointment_reminder'
          then complimentary_reminder_sms_balance - v_complimentary_used
        else complimentary_reminder_sms_balance
      end,
      complimentary_marketing_sms_balance = case
        when p_purpose = 'marketing'
          then complimentary_marketing_sms_balance - v_complimentary_used
        else complimentary_marketing_sms_balance
      end,
      purchased_sms_balance = purchased_sms_balance - v_purchased_used,
      balance = complimentary_reminder_sms_balance
        + complimentary_marketing_sms_balance
        + purchased_sms_balance
        - v_complimentary_used
        - v_purchased_used,
      updated_at = now()
  where tenant_id = p_tenant_id;

  return jsonb_build_object(
    'reserved', true,
    'purpose', p_purpose,
    'complimentary_used', v_complimentary_used,
    'purchased_used', v_purchased_used,
    'amount', p_amount
  );
end;
$$;

create or replace function public.restore_sms_credits(
  p_tenant_id uuid,
  p_reservation jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_complimentary integer := greatest(coalesce((p_reservation->>'complimentary_used')::integer, 0), 0);
  v_purchased integer := greatest(coalesce((p_reservation->>'purchased_used')::integer, 0), 0);
begin
  update public.communication_credits
  set complimentary_reminder_sms_balance = complimentary_reminder_sms_balance
        + case when p_reservation->>'purpose' = 'appointment_reminder' then v_complimentary else 0 end,
      complimentary_marketing_sms_balance = complimentary_marketing_sms_balance
        + case when p_reservation->>'purpose' = 'marketing' then v_complimentary else 0 end,
      purchased_sms_balance = purchased_sms_balance + v_purchased,
      balance = complimentary_reminder_sms_balance
        + complimentary_marketing_sms_balance
        + purchased_sms_balance
        + v_complimentary
        + v_purchased,
      updated_at = now()
  where tenant_id = p_tenant_id;

  return found;
end;
$$;

-- Compatibility wrappers for older callers. New code should use the
-- purpose-specific functions directly.
create or replace function public.reserve_communication_credits(p_tenant_id uuid, p_amount integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  v_result := public.reserve_sms_credits(p_tenant_id, p_amount, 'appointment_reminder');
  return coalesce((v_result->>'reserved')::boolean, false);
end;
$$;

create or replace function public.restore_communication_credits(p_tenant_id uuid, p_amount integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.communication_credits
  set purchased_sms_balance = purchased_sms_balance + greatest(p_amount, 0),
      balance = complimentary_reminder_sms_balance
        + complimentary_marketing_sms_balance
        + purchased_sms_balance
        + greatest(p_amount, 0),
      updated_at = now()
  where tenant_id = p_tenant_id;
  return found;
end;
$$;

revoke execute on function public.refresh_complimentary_sms_allowances(uuid) from public, anon, authenticated;
revoke execute on function public.get_sms_credit_summary(uuid) from public, anon, authenticated;
revoke execute on function public.reserve_sms_credits(uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.restore_sms_credits(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.refresh_complimentary_sms_allowances(uuid) to service_role;
grant execute on function public.get_sms_credit_summary(uuid) to service_role;
grant execute on function public.get_sms_credit_summary(uuid) to authenticated;
grant execute on function public.reserve_sms_credits(uuid, integer, text) to service_role;
grant execute on function public.restore_sms_credits(uuid, jsonb) to service_role;
grant execute on function public.reserve_communication_credits(uuid, integer) to service_role;
grant execute on function public.restore_communication_credits(uuid, integer) to service_role;

-- Credit purchases must land in the purchased bucket. Keeping this function
-- aligned prevents a webhook replay from silently rebuilding the legacy
-- aggregate without increasing the balance that SMS reservations consume.
create or replace function public.complete_messaging_credit_purchase(
  p_tenant_id uuid,
  p_payment_intent_id uuid,
  p_reference text,
  p_credits integer,
  p_amount numeric,
  p_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_intent public.payment_intents%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required';
  end if;
  if nullif(p_reference, '') is null or p_credits <= 0 or p_amount <= 0 then
    raise exception 'Invalid purchase';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':messaging', 0));
  select id into v_id
  from public.messaging_credit_purchases
  where tenant_id = p_tenant_id
    and (gateway_reference = p_reference or payment_intent_id = p_payment_intent_id)
  limit 1;
  if v_id is not null then
    return jsonb_build_object('id', v_id, 'duplicate', true);
  end if;

  select * into v_intent
  from public.payment_intents
  where id = p_payment_intent_id and tenant_id = p_tenant_id
  for update;
  if v_intent.id is null then
    raise exception 'Payment intent does not belong to salon';
  end if;
  if v_intent.intent_type <> 'messaging_credit_purchase'
     or v_intent.amount is distinct from p_amount
     or v_intent.currency <> p_currency
     or coalesce((v_intent.metadata->>'credits')::integer, 0) <> p_credits then
    raise exception 'Messaging purchase does not match its payment intent';
  end if;

  insert into public.messaging_credit_purchases(tenant_id, credits, currency, amount, paid_via, payment_intent_id, gateway_reference)
  values (p_tenant_id, p_credits, p_currency, p_amount, 'paystack', p_payment_intent_id, p_reference)
  returning id into v_id;

  insert into public.communication_credits(tenant_id, balance, purchased_sms_balance, updated_at)
  values (p_tenant_id, p_credits, p_credits, now())
  on conflict (tenant_id) do update
    set balance = public.communication_credits.balance + excluded.balance,
        purchased_sms_balance = public.communication_credits.purchased_sms_balance + excluded.purchased_sms_balance,
        updated_at = now();

  return jsonb_build_object('id', v_id, 'duplicate', false);
end;
$$;

-- Legacy callers used this void function after a send. Route those calls
-- through the same atomic marketing reservation so they cannot corrupt the
-- purpose-specific balances during a rolling edge-function deployment.
create or replace function public.deduct_communication_credits(p_tenant_id uuid, p_amount integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.reserve_sms_credits(p_tenant_id, p_amount, 'marketing');
end;
$$;

revoke execute on function public.deduct_communication_credits(uuid, integer) from public, anon, authenticated;
grant execute on function public.deduct_communication_credits(uuid, integer) to service_role;

-- Remove the old plan-based catalog enforcement. The columns remain for
-- historical/catalog compatibility, but NULL now means unlimited.
drop trigger if exists trg_enforce_services_limit on public.services;
drop trigger if exists trg_enforce_products_limit on public.products;
drop trigger if exists trg_enforce_packages_limit on public.packages;
drop trigger if exists trg_enforce_vouchers_limit on public.vouchers;

update public.plan_limits
set max_services = null,
    max_products = null,
    max_packages = null,
    max_vouchers = null;

-- Backoffice plan edits must not accidentally reintroduce catalog caps while
-- the legacy limit columns remain in the schema for compatibility.
create or replace function public.keep_catalog_limits_unlimited()
returns trigger
language plpgsql
as $$
begin
  new.max_services := null;
  new.max_products := null;
  new.max_packages := null;
  new.max_vouchers := null;
  return new;
end;
$$;

drop trigger if exists trg_keep_catalog_limits_unlimited on public.plan_limits;
create trigger trg_keep_catalog_limits_unlimited
before insert or update of max_services, max_products, max_packages, max_vouchers
on public.plan_limits
for each row execute function public.keep_catalog_limits_unlimited();

-- The reminder scheduler must never process suspended, canceled, or expired
-- trial tenants. Email and SMS are both paused when the salon is offline.
create or replace function public.get_due_appointment_reminders(p_now timestamptz default now())
returns table (
  appointment_id uuid,
  tenant_id uuid,
  customer_id uuid,
  scheduled_start timestamptz,
  offset_minutes integer,
  attempt_count integer,
  email_enabled boolean,
  sms_enabled boolean,
  customer_name text,
  customer_email text,
  customer_phone text,
  tenant_name text,
  tenant_sms_sender_name text
)
language sql
stable
set search_path = public
as $$
  with tenant_offsets as (
    select ns.tenant_id,
           ns.email_appointment_reminders,
           ns.sms_appointment_reminders,
           o.offset_minutes
    from notification_settings ns
    cross join lateral (
      select distinct unnest(array[ns.reminder_hours_before * 60, 30])::int as offset_minutes
    ) o
    where ns.email_appointment_reminders or ns.sms_appointment_reminders
  )
  select a.id, a.tenant_id, a.customer_id, a.scheduled_start,
         tof.offset_minutes, coalesce(d.attempt_count, 0),
         tof.email_appointment_reminders and c.email is not null,
         tof.sms_appointment_reminders and c.phone is not null,
         c.full_name, c.email, c.phone,
         t.name, t.sms_sender_name
  from tenant_offsets tof
  join appointments a
    on a.tenant_id = tof.tenant_id
   and a.status = 'scheduled'
   and a.scheduled_start > p_now
   and a.scheduled_start <= p_now + make_interval(mins => tof.offset_minutes)
  join tenants t on t.id = a.tenant_id
   and (
     t.subscription_status::text = 'active'
     or (
       t.subscription_status::text = 'trialing'
       and t.trial_ends_at is not null
       and t.trial_ends_at > p_now
     )
   )
  left join customers c on c.id = a.customer_id
  left join appointment_reminder_sends d
    on d.appointment_id = a.id and d.offset_minutes = tof.offset_minutes
  where (d.id is null
         or (d.sent_at is null and d.failed_at is null and d.attempt_count < 3))
    and (d.last_attempt_at is null or d.last_attempt_at < p_now - interval '9 minutes')
  order by a.scheduled_start, tof.offset_minutes;
$$;

-- Keep the backoffice comms view aligned with the purpose-specific wallet.
-- Dropping is required because PostgreSQL cannot change a function's return
-- type with CREATE OR REPLACE FUNCTION.
drop function if exists public.get_backoffice_comms_usage();

create function public.get_backoffice_comms_usage()
returns table (
  tenant_id uuid,
  tenant_name text,
  country text,
  balance integer,
  complimentary_reminder_sms_balance integer,
  complimentary_marketing_sms_balance integer,
  purchased_sms_balance integer,
  free_monthly_allocation integer,
  last_reset_at timestamptz,
  last_purchase_at timestamptz,
  last_purchase_amount numeric,
  last_purchase_currency text,
  sms_sent_30d integer,
  email_sent_30d integer,
  reminders_sent_30d integer,
  birthday_sent_30d integer,
  delivered_30d integer,
  failed_30d integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_backoffice_user(auth.uid()) then
    raise exception 'BACKOFFICE_ACCESS_REQUIRED';
  end if;

  return query
  select
    t.id,
    t.name,
    t.country,
    coalesce(cc.balance, 0),
    coalesce(cc.complimentary_reminder_sms_balance, 0),
    coalesce(cc.complimentary_marketing_sms_balance, 0),
    coalesce(cc.purchased_sms_balance, 0),
    coalesce(cc.free_monthly_allocation, 0),
    cc.last_reset_at,
    lp.created_at,
    lp.amount,
    lp.currency,
    coalesce(agg.sms_sent_30d, 0),
    coalesce(agg.email_sent_30d, 0),
    coalesce(agg.reminders_sent_30d, 0),
    coalesce(agg.birthday_sent_30d, 0),
    coalesce(agg.delivered_30d, 0),
    coalesce(agg.failed_30d, 0)
  from public.tenants t
  left join public.communication_credits cc on cc.tenant_id = t.id
  left join lateral (
    select mcp.created_at, mcp.amount, mcp.currency
    from public.messaging_credit_purchases mcp
    where mcp.tenant_id = t.id
    order by mcp.created_at desc
    limit 1
  ) lp on true
  left join lateral (
    select
      count(*) filter (where ml.initiated_by = 'salon' and ml.channel = 'sms')::integer as sms_sent_30d,
      count(*) filter (where ml.initiated_by = 'salon' and ml.channel = 'email')::integer as email_sent_30d,
      count(*) filter (where ml.initiated_by = 'system' and ml.template_type = 'appointment_reminder' and ml.status in ('sent', 'delivered'))::integer as reminders_sent_30d,
      count(*) filter (where ml.initiated_by = 'system' and ml.template_type = 'birthday_message' and ml.status in ('sent', 'delivered'))::integer as birthday_sent_30d,
      count(*) filter (where ml.initiated_by = 'salon' and ml.status in ('sent', 'delivered'))::integer as delivered_30d,
      count(*) filter (where ml.initiated_by = 'salon' and ml.status = 'failed')::integer as failed_30d
    from public.message_logs ml
    where ml.tenant_id = t.id
      and ml.created_at >= now() - interval '30 days'
  ) agg on true
  order by t.created_at desc;
end;
$$;

grant execute on function public.get_backoffice_comms_usage() to authenticated;

commit;
