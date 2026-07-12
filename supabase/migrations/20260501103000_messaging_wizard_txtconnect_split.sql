-- Messaging wizard persistence, provider abstraction, and platform comms ownership split.

alter table if exists public.tenants
  add column if not exists sms_provider text not null default 'txtconnect'
    check (sms_provider in ('txtconnect', 'termii')),
  add column if not exists sms_sender_name text,
  add column if not exists sms_sender_name_status text not null default 'not_set'
    check (sms_sender_name_status in ('not_set', 'pending', 'approved', 'rejected')),
  add column if not exists sms_sender_name_requested_at timestamptz,
  add column if not exists sms_sender_name_approved_at timestamptz,
  add column if not exists sms_sender_name_company text,
  add column if not exists sms_sender_name_use_case text;

update public.tenants
set
  sms_sender_name = coalesce(sms_sender_name, termii_sender_id),
  sms_sender_name_status = coalesce(termii_sender_id_status, sms_sender_name_status, 'not_set'),
  sms_sender_name_requested_at = coalesce(sms_sender_name_requested_at, termii_sender_id_requested_at),
  sms_sender_name_approved_at = coalesce(sms_sender_name_approved_at, termii_sender_id_approved_at),
  sms_sender_name_company = coalesce(sms_sender_name_company, termii_sender_id_company),
  sms_sender_name_use_case = coalesce(sms_sender_name_use_case, termii_sender_id_use_case)
where
  termii_sender_id is not null
  or termii_sender_id_status is not null
  or termii_sender_id_requested_at is not null
  or termii_sender_id_approved_at is not null;

comment on column public.tenants.sms_provider is 'Current SMS delivery provider used by the tenant.';
comment on column public.tenants.sms_sender_name is 'Generic SMS sender name displayed to recipients.';
comment on column public.tenants.sms_sender_name_status is 'Approval state of the tenant SMS sender name.';

create table if not exists public.broadcast_reusable_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  channel text not null check (channel in ('sms', 'email')),
  subject text,
  body text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_broadcast_reusable_templates_tenant_lower_name
  on public.broadcast_reusable_templates (tenant_id, lower(name));

create index if not exists idx_broadcast_reusable_templates_tenant_id
  on public.broadcast_reusable_templates (tenant_id);

alter table public.broadcast_reusable_templates
  add constraint broadcast_reusable_templates_subject_required
  check (
    (channel = 'sms' and subject is null)
    or (channel = 'email')
  );

create table if not exists public.broadcast_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  audience_preset text not null check (
    audience_preset in (
      'all_customers',
      'vip_customers',
      'no_appointment_30',
      'no_appointment_60',
      'new_customers',
      'upcoming_appointments',
      'cancelled_appointments'
    )
  ),
  channel text not null check (channel in ('sms', 'email')),
  selected_customer_ids uuid[] not null default '{}',
  subject text,
  body text not null default '',
  current_step integer not null default 1 check (current_step between 1 and 3),
  reminder_sent_at timestamptz,
  saved_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index if not exists idx_broadcast_drafts_expires_at
  on public.broadcast_drafts (expires_at);

create index if not exists idx_broadcast_drafts_tenant_user
  on public.broadcast_drafts (tenant_id, user_id);

create table if not exists public.platform_message_templates (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email', 'sms')),
  template_key text not null unique,
  category text not null,
  label text not null,
  description text,
  subject text,
  body text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.platform_message_templates is 'Platform-owned transactional and lifecycle messaging templates managed in backoffice.';

insert into public.platform_message_templates (channel, template_key, category, label, description, subject, body)
values
  (
    'email',
    'email_verification',
    'authentication',
    'Email verification',
    'Verification email sent to new product users.',
    'Verify your email for Salon Magik',
    '<h2>Verify your email</h2><p>Hi {{first_name}},</p><p>Please verify your email address to finish setting up your account.</p><p><a href="{{verification_link}}">Verify email</a></p>'
  ),
  (
    'email',
    'staff_invitation',
    'onboarding',
    'Staff invitation',
    'Staff invitation email sent when salon users invite team members.',
    'You''re invited to join {{salon_name}}',
    '<h2>Join {{salon_name}}</h2><p>Hi {{staff_name}},</p><p>You''ve been invited to join {{salon_name}} as {{role}}.</p><p><a href="{{invitation_link}}">Accept invitation</a></p>'
  ),
  (
    'email',
    'daily_digest',
    'operations',
    'Daily digest',
    'Operational summary email for salon teams.',
    'Daily digest for {{salon_name}}',
    '<h2>Daily Digest</h2><p>Hi {{first_name}},</p><p>Here is your daily summary for {{salon_name}}.</p><p>Upcoming appointments: {{upcoming_appointments_count}}</p><p>Payments received: {{payments_received}}</p><p>Outstanding balances: {{outstanding_balances}}</p>'
  )
on conflict (template_key) do nothing;

create or replace function public.update_broadcast_reusable_templates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.update_broadcast_drafts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.saved_at = now();
  new.expires_at = now() + interval '48 hours';
  return new;
end;
$$;

create or replace function public.update_platform_message_templates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_broadcast_reusable_templates_updated_at on public.broadcast_reusable_templates;
create trigger trg_broadcast_reusable_templates_updated_at
before update on public.broadcast_reusable_templates
for each row execute function public.update_broadcast_reusable_templates_updated_at();

drop trigger if exists trg_broadcast_drafts_updated_at on public.broadcast_drafts;
create trigger trg_broadcast_drafts_updated_at
before update on public.broadcast_drafts
for each row execute function public.update_broadcast_drafts_updated_at();

drop trigger if exists trg_platform_message_templates_updated_at on public.platform_message_templates;
create trigger trg_platform_message_templates_updated_at
before update on public.platform_message_templates
for each row execute function public.update_platform_message_templates_updated_at();

alter table public.broadcast_reusable_templates enable row level security;
alter table public.broadcast_drafts enable row level security;
alter table public.platform_message_templates enable row level security;

drop policy if exists broadcast_reusable_templates_select_policy on public.broadcast_reusable_templates;
create policy broadcast_reusable_templates_select_policy on public.broadcast_reusable_templates
  for select
  using (tenant_id in (select get_user_tenant_ids(auth.uid())));

drop policy if exists broadcast_reusable_templates_insert_policy on public.broadcast_reusable_templates;
create policy broadcast_reusable_templates_insert_policy on public.broadcast_reusable_templates
  for insert
  with check (tenant_id in (select get_user_tenant_ids(auth.uid())) and created_by = auth.uid() and updated_by = auth.uid());

drop policy if exists broadcast_reusable_templates_update_policy on public.broadcast_reusable_templates;
create policy broadcast_reusable_templates_update_policy on public.broadcast_reusable_templates
  for update
  using (tenant_id in (select get_user_tenant_ids(auth.uid())))
  with check (tenant_id in (select get_user_tenant_ids(auth.uid())) and updated_by = auth.uid());

drop policy if exists broadcast_reusable_templates_delete_policy on public.broadcast_reusable_templates;
create policy broadcast_reusable_templates_delete_policy on public.broadcast_reusable_templates
  for delete
  using (tenant_id in (select get_user_tenant_ids(auth.uid())));

drop policy if exists broadcast_drafts_select_policy on public.broadcast_drafts;
create policy broadcast_drafts_select_policy on public.broadcast_drafts
  for select
  using (tenant_id in (select get_user_tenant_ids(auth.uid())) and user_id = auth.uid());

drop policy if exists broadcast_drafts_insert_policy on public.broadcast_drafts;
create policy broadcast_drafts_insert_policy on public.broadcast_drafts
  for insert
  with check (tenant_id in (select get_user_tenant_ids(auth.uid())) and user_id = auth.uid());

drop policy if exists broadcast_drafts_update_policy on public.broadcast_drafts;
create policy broadcast_drafts_update_policy on public.broadcast_drafts
  for update
  using (tenant_id in (select get_user_tenant_ids(auth.uid())) and user_id = auth.uid())
  with check (tenant_id in (select get_user_tenant_ids(auth.uid())) and user_id = auth.uid());

drop policy if exists broadcast_drafts_delete_policy on public.broadcast_drafts;
create policy broadcast_drafts_delete_policy on public.broadcast_drafts
  for delete
  using (tenant_id in (select get_user_tenant_ids(auth.uid())) and user_id = auth.uid());

drop policy if exists platform_message_templates_backoffice_select on public.platform_message_templates;
create policy platform_message_templates_backoffice_select on public.platform_message_templates
  for select
  to authenticated
  using (
    has_backoffice_role(auth.uid(), 'super_admin'::public.backoffice_role)
    or backoffice_user_has_permission(auth.uid(), 'settings.view')
    or backoffice_user_has_permission(auth.uid(), 'comms.view')
  );

drop policy if exists platform_message_templates_backoffice_manage on public.platform_message_templates;
create policy platform_message_templates_backoffice_manage on public.platform_message_templates
  for all
  to authenticated
  using (
    has_backoffice_role(auth.uid(), 'super_admin'::public.backoffice_role)
    or backoffice_user_has_permission(auth.uid(), 'comms.view')
  )
  with check (
    has_backoffice_role(auth.uid(), 'super_admin'::public.backoffice_role)
    or backoffice_user_has_permission(auth.uid(), 'comms.view')
  );

insert into public.backoffice_permission_keys (key, label, description)
values
  ('comms.view', 'Comms', 'Manage platform-owned communication templates')
on conflict (key) do nothing;

insert into public.backoffice_page_keys (key, label, route_path)
values
  ('comms', 'Comms', '/comms')
on conflict (key) do nothing;
