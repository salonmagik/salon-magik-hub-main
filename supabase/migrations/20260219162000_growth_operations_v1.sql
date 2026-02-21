create table if not exists public.catalog_import_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  import_type text not null check (import_type in ('products', 'services')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  created_by uuid,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  summary_json jsonb
);

create table if not exists public.catalog_import_rows (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.catalog_import_jobs(id) on delete cascade,
  row_number int not null,
  raw_json jsonb not null,
  normalized_json jsonb,
  status text not null default 'pending' check (status in ('pending', 'valid', 'invalid', 'imported', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.setup_assistance_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  request_type text not null default 'catalog_configuration',
  notes text,
  status text not null default 'new' check (status in ('new', 'in_review', 'assigned', 'completed', 'closed')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_reactivation_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  channel text not null check (channel in ('email', 'sms', 'whatsapp')),
  status text not null default 'draft' check (status in ('draft', 'previewed', 'sending', 'sent', 'failed', 'cancelled')),
  filters_json jsonb not null default '{}'::jsonb,
  template_json jsonb not null default '{}'::jsonb,
  voucher_config_json jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_reactivation_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.customer_reactivation_campaigns(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  preview_payload_json jsonb not null default '{}'::jsonb,
  send_status text not null default 'pending' check (send_status in ('pending', 'sent', 'failed', 'skipped')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, customer_id)
);

alter table public.vouchers
  add column if not exists voucher_kind text not null default 'general' check (voucher_kind in ('general', 'customer_specific')),
  add column if not exists target_customer_id uuid references public.customers(id) on delete set null,
  add column if not exists scope_type text not null default 'general' check (scope_type in ('general', 'services', 'products', 'packages')),
  add column if not exists scope_ids uuid[] not null default '{}',
  add column if not exists issued_for_campaign_id uuid references public.customer_reactivation_campaigns(id) on delete set null;

create table if not exists public.tenant_trial_overrides (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null,
  granted_by uuid,
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_trial_overrides_window_check check (ends_at > starts_at)
);

create index if not exists idx_catalog_import_jobs_tenant_id on public.catalog_import_jobs(tenant_id, created_at desc);
create index if not exists idx_setup_assistance_requests_tenant_id on public.setup_assistance_requests(tenant_id, created_at desc);
create index if not exists idx_customer_reactivation_campaigns_tenant_id on public.customer_reactivation_campaigns(tenant_id, created_at desc);
create index if not exists idx_customer_reactivation_recipients_campaign_id on public.customer_reactivation_recipients(campaign_id, send_status);
create index if not exists idx_tenant_trial_overrides_tenant_id on public.tenant_trial_overrides(tenant_id, starts_at desc);

drop trigger if exists update_setup_assistance_requests_updated_at on public.setup_assistance_requests;
create trigger update_setup_assistance_requests_updated_at
before update on public.setup_assistance_requests
for each row execute function public.update_updated_at_column();

drop trigger if exists update_customer_reactivation_campaigns_updated_at on public.customer_reactivation_campaigns;
create trigger update_customer_reactivation_campaigns_updated_at
before update on public.customer_reactivation_campaigns
for each row execute function public.update_updated_at_column();

drop trigger if exists update_tenant_trial_overrides_updated_at on public.tenant_trial_overrides;
create trigger update_tenant_trial_overrides_updated_at
before update on public.tenant_trial_overrides
for each row execute function public.update_updated_at_column();

insert into public.platform_settings (key, value, description, updated_by_id)
values (
  'default_trial_days',
  jsonb_build_object('days', 14),
  'Global default trial period in days',
  null
)
on conflict (key) do nothing;

alter table public.catalog_import_jobs enable row level security;
alter table public.catalog_import_rows enable row level security;
alter table public.setup_assistance_requests enable row level security;
alter table public.customer_reactivation_campaigns enable row level security;
alter table public.customer_reactivation_recipients enable row level security;
alter table public.tenant_trial_overrides enable row level security;

drop policy if exists "Tenant members can manage catalog import jobs" on public.catalog_import_jobs;
create policy "Tenant members can manage catalog import jobs"
on public.catalog_import_jobs
for all
using (
  exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.tenant_id = catalog_import_jobs.tenant_id
      and coalesce(ur.is_active, true)
  )
)
with check (
  exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.tenant_id = catalog_import_jobs.tenant_id
      and coalesce(ur.is_active, true)
  )
);

drop policy if exists "Tenant members can read catalog import rows" on public.catalog_import_rows;
create policy "Tenant members can read catalog import rows"
on public.catalog_import_rows
for select
using (
  exists (
    select 1
    from public.catalog_import_jobs j
    join public.user_roles ur on ur.tenant_id = j.tenant_id
    where j.id = catalog_import_rows.job_id
      and ur.user_id = auth.uid()
      and coalesce(ur.is_active, true)
  )
);

drop policy if exists "Tenant members can manage setup assistance requests" on public.setup_assistance_requests;
create policy "Tenant members can manage setup assistance requests"
on public.setup_assistance_requests
for all
using (
  exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.tenant_id = setup_assistance_requests.tenant_id
      and coalesce(ur.is_active, true)
  )
)
with check (
  exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.tenant_id = setup_assistance_requests.tenant_id
      and coalesce(ur.is_active, true)
  )
);

drop policy if exists "Tenant members can manage reactivation campaigns" on public.customer_reactivation_campaigns;
create policy "Tenant members can manage reactivation campaigns"
on public.customer_reactivation_campaigns
for all
using (
  exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.tenant_id = customer_reactivation_campaigns.tenant_id
      and coalesce(ur.is_active, true)
  )
)
with check (
  exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.tenant_id = customer_reactivation_campaigns.tenant_id
      and coalesce(ur.is_active, true)
  )
);

drop policy if exists "Tenant members can manage reactivation recipients" on public.customer_reactivation_recipients;
create policy "Tenant members can manage reactivation recipients"
on public.customer_reactivation_recipients
for all
using (
  exists (
    select 1
    from public.customer_reactivation_campaigns c
    join public.user_roles ur on ur.tenant_id = c.tenant_id
    where c.id = customer_reactivation_recipients.campaign_id
      and ur.user_id = auth.uid()
      and coalesce(ur.is_active, true)
  )
)
with check (
  exists (
    select 1
    from public.customer_reactivation_campaigns c
    join public.user_roles ur on ur.tenant_id = c.tenant_id
    where c.id = customer_reactivation_recipients.campaign_id
      and ur.user_id = auth.uid()
      and coalesce(ur.is_active, true)
  )
);

drop policy if exists "Tenant members can read trial overrides" on public.tenant_trial_overrides;
create policy "Tenant members can read trial overrides"
on public.tenant_trial_overrides
for select
using (
  exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.tenant_id = tenant_trial_overrides.tenant_id
      and coalesce(ur.is_active, true)
  )
);

drop policy if exists "Backoffice super admins can manage trial overrides" on public.tenant_trial_overrides;
create policy "Backoffice super admins can manage trial overrides"
on public.tenant_trial_overrides
for all
using (
  exists (
    select 1
    from public.backoffice_users bu
    where bu.user_id = auth.uid()
      and bu.role = 'super_admin'
      and bu.is_active = true
  )
)
with check (
  exists (
    select 1
    from public.backoffice_users bu
    where bu.user_id = auth.uid()
      and bu.role = 'super_admin'
      and bu.is_active = true
  )
);

create or replace function public.get_customer_engagement_summary(
  p_tenant_id uuid,
  p_customer_id uuid
)
returns table (
  most_ordered_service text,
  most_ordered_product text,
  refunds_count bigint,
  last_transaction_at timestamptz,
  services_completed bigint,
  products_fulfilled bigint,
  services_cancelled bigint,
  services_rescheduled bigint
)
language sql
stable
as $$
  with service_counts as (
    select aps.service_name, count(*) as cnt
    from public.appointments ap
    join public.appointment_services aps on aps.appointment_id = ap.id
    where ap.tenant_id = p_tenant_id
      and ap.customer_id = p_customer_id
    group by aps.service_name
    order by cnt desc, aps.service_name asc
    limit 1
  ),
  product_counts as (
    select app.product_name, sum(app.quantity)::bigint as cnt
    from public.appointments ap
    join public.appointment_products app on app.appointment_id = ap.id
    where ap.tenant_id = p_tenant_id
      and ap.customer_id = p_customer_id
    group by app.product_name
    order by cnt desc, app.product_name asc
    limit 1
  ),
  activity as (
    select
      max(coalesce(ap.actual_end, ap.scheduled_end, ap.actual_start, ap.scheduled_start)) as last_at,
      count(*) filter (where ap.status = 'completed') as completed_count,
      count(*) filter (where ap.status = 'cancelled') as cancelled_count,
      coalesce(sum(ap.reschedule_count), 0)::bigint as rescheduled_count
    from public.appointments ap
    where ap.tenant_id = p_tenant_id
      and ap.customer_id = p_customer_id
  ),
  fulfilled as (
    select coalesce(sum(app.quantity), 0)::bigint as fulfilled_count
    from public.appointments ap
    join public.appointment_products app on app.appointment_id = ap.id
    where ap.tenant_id = p_tenant_id
      and ap.customer_id = p_customer_id
      and app.fulfillment_status = 'fulfilled'
  ),
  refunds as (
    select count(*)::bigint as cnt
    from public.refund_requests rr
    where rr.tenant_id = p_tenant_id
      and rr.customer_id = p_customer_id
      and rr.status = 'approved'
  )
  select
    (select service_name from service_counts),
    (select product_name from product_counts),
    coalesce((select cnt from refunds), 0),
    (select last_at from activity),
    coalesce((select completed_count from activity), 0),
    coalesce((select fulfilled_count from fulfilled), 0),
    coalesce((select cancelled_count from activity), 0),
    coalesce((select rescheduled_count from activity), 0);
$$;

create or replace function public.get_inactive_customers(
  p_tenant_id uuid,
  p_days_threshold int default 30,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  customer_id uuid,
  customer_name text,
  customer_email text,
  customer_phone text,
  days_since_last_transaction int,
  last_transaction_at timestamptz,
  last_purchased_item text,
  most_ordered_service text,
  most_ordered_product text,
  refunds_count bigint
)
language sql
stable
as $$
  with last_activity as (
    select
      ap.customer_id,
      max(coalesce(ap.actual_end, ap.scheduled_end, ap.actual_start, ap.scheduled_start)) as last_at
    from public.appointments ap
    where ap.tenant_id = p_tenant_id
      and (p_from is null or coalesce(ap.actual_end, ap.scheduled_end, ap.actual_start, ap.scheduled_start) >= p_from)
      and (p_to is null or coalesce(ap.actual_end, ap.scheduled_end, ap.actual_start, ap.scheduled_start) <= p_to)
    group by ap.customer_id
  ),
  service_counts as (
    select ap.customer_id, aps.service_name, count(*) as cnt
    from public.appointments ap
    join public.appointment_services aps on aps.appointment_id = ap.id
    where ap.tenant_id = p_tenant_id
    group by ap.customer_id, aps.service_name
  ),
  product_counts as (
    select ap.customer_id, app.product_name, sum(app.quantity)::bigint as cnt
    from public.appointments ap
    join public.appointment_products app on app.appointment_id = ap.id
    where ap.tenant_id = p_tenant_id
    group by ap.customer_id, app.product_name
  ),
  top_service as (
    select distinct on (customer_id) customer_id, service_name
    from service_counts
    order by customer_id, cnt desc, service_name asc
  ),
  top_product as (
    select distinct on (customer_id) customer_id, product_name
    from product_counts
    order by customer_id, cnt desc, product_name asc
  ),
  last_item as (
    select
      ap.customer_id,
      coalesce(
        (
          select aps.service_name
          from public.appointment_services aps
          where aps.appointment_id = ap.id
          limit 1
        ),
        (
          select app.product_name
          from public.appointment_products app
          where app.appointment_id = ap.id
          limit 1
        )
      ) as item_name
    from public.appointments ap
    join (
      select customer_id, max(coalesce(actual_end, scheduled_end, actual_start, scheduled_start)) as last_at
      from public.appointments
      where tenant_id = p_tenant_id
      group by customer_id
    ) latest on latest.customer_id = ap.customer_id
      and coalesce(ap.actual_end, ap.scheduled_end, ap.actual_start, ap.scheduled_start) = latest.last_at
    where ap.tenant_id = p_tenant_id
  ),
  refunds as (
    select rr.customer_id, count(*)::bigint as cnt
    from public.refund_requests rr
    where rr.tenant_id = p_tenant_id
      and rr.status = 'approved'
    group by rr.customer_id
  )
  select
    c.id,
    c.full_name,
    c.email,
    c.phone,
    greatest(0, extract(day from (now() - la.last_at))::int) as days_since_last_transaction,
    la.last_at,
    li.item_name,
    ts.service_name,
    tp.product_name,
    coalesce(rf.cnt, 0)
  from public.customers c
  join last_activity la on la.customer_id = c.id
  left join last_item li on li.customer_id = c.id
  left join top_service ts on ts.customer_id = c.id
  left join top_product tp on tp.customer_id = c.id
  left join refunds rf on rf.customer_id = c.id
  where c.tenant_id = p_tenant_id
    and la.last_at <= now() - make_interval(days => greatest(0, p_days_threshold))
  order by la.last_at asc
  limit greatest(1, p_limit)
  offset greatest(0, p_offset);
$$;

create or replace function public.get_effective_trial_window(
  p_tenant_id uuid
)
returns table (
  starts_at timestamptz,
  ends_at timestamptz,
  source text
)
language plpgsql
stable
as $$
declare
  v_override record;
  v_default_days int;
  v_tenant_created_at timestamptz;
begin
  select *
  into v_override
  from public.tenant_trial_overrides
  where tenant_id = p_tenant_id
    and status = 'active'
    and now() between starts_at and ends_at
  order by starts_at desc
  limit 1;

  if found then
    return query
    select v_override.starts_at, v_override.ends_at, 'tenant_override'::text;
    return;
  end if;

  select created_at into v_tenant_created_at
  from public.tenants
  where id = p_tenant_id;

  select coalesce((value->>'days')::int, 14)
  into v_default_days
  from public.platform_settings
  where key = 'default_trial_days';

  if v_tenant_created_at is null then
    return;
  end if;

  return query
  select
    v_tenant_created_at,
    v_tenant_created_at + make_interval(days => greatest(0, coalesce(v_default_days, 14))),
    'global_default'::text;
end;
$$;
