-- Exact content of what was sent — message_logs only had `subject`
-- (email) before this; the two send functions that log salon-initiated
-- messages already have the rendered text/HTML in hand at insert time.
alter table public.message_logs add column if not exists content text;

-- Backoffice-only per-tenant comms credit + usage rollup.
create or replace function public.get_backoffice_comms_usage()
returns table (
  tenant_id uuid,
  tenant_name text,
  country text,
  balance integer,
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
  if not is_backoffice_user(auth.uid()) then
    raise exception 'BACKOFFICE_ACCESS_REQUIRED';
  end if;

  return query
  select
    t.id,
    t.name,
    t.country,
    cc.balance,
    cc.free_monthly_allocation,
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
      count(*) filter (where ml.initiated_by = 'system' and ml.template_type = 'appointment_reminder')::integer as reminders_sent_30d,
      count(*) filter (where ml.initiated_by = 'system' and ml.template_type = 'birthday_message')::integer as birthday_sent_30d,
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

-- Salon-initiated message log (manual + bulk) with full content, for the
-- "click a row, see exactly what was sent" drill-down. System-initiated
-- sends (reminders/birthday) are deliberately excluded — those are
-- represented as counts only in get_backoffice_comms_usage, per design.
create or replace function public.get_tenant_message_log(p_tenant_id uuid, p_limit integer default 100)
returns table (
  id uuid,
  channel text,
  recipient text,
  subject text,
  content text,
  status text,
  credits_used integer,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_backoffice_user(auth.uid()) then
    raise exception 'BACKOFFICE_ACCESS_REQUIRED';
  end if;

  return query
  select ml.id, ml.channel, ml.recipient, ml.subject, ml.content, ml.status, ml.credits_used, ml.error_message, ml.sent_at, ml.created_at
  from public.message_logs ml
  where ml.tenant_id = p_tenant_id
    and ml.initiated_by = 'salon'
  order by ml.created_at desc
  limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.get_tenant_message_log(uuid, integer) to authenticated;
