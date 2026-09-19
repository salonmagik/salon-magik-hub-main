-- Folded-in defect (email-delivery-audit design §3, AD-5): reminders_sent_30d
-- and birthday_sent_30d counted failed messages as sent, because the filter
-- had no status check. This work starts writing failed email rows with
-- template_type = 'appointment_reminder', which would double the inflation
-- and make the counter actively misleading if left unfixed.
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
      count(*) filter (where ml.initiated_by = 'system'
                         and ml.template_type = 'appointment_reminder'
                         and ml.status in ('sent', 'delivered'))::integer as reminders_sent_30d,
      count(*) filter (where ml.initiated_by = 'system'
                         and ml.template_type = 'birthday_message'
                         and ml.status in ('sent', 'delivered'))::integer as birthday_sent_30d,
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
