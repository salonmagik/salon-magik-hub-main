-- Extend backoffice permission/page controls and harden sales RLS by permission.

insert into public.backoffice_permission_keys (key, label, description)
values
  ('dashboard.view', 'View dashboard', 'Access the backoffice dashboard'),
  ('customers.view_waitlists', 'View customer waitlists', 'Access waitlist applications and market interest'),
  ('customers.view_tenants', 'View tenants', 'Access tenants and unlock requests'),
  ('customers.view_ops_monitor', 'View ops monitor', 'Access setup, import and reactivation monitoring'),
  ('plans.view', 'View plans', 'Access and manage plan configuration'),
  ('audit_logs.view', 'View audit logs', 'Access audit logs'),
  ('settings.view', 'View settings', 'Access settings and configuration pages'),
  ('impersonation.view', 'Use impersonation', 'Access impersonation tools'),
  ('sales.capture_client', 'Capture clients', 'Generate promo codes and manage campaigns'),
  ('sales.manage_campaigns', 'Manage campaigns', 'Create and manage sales campaigns'),
  ('sales.view_conversions', 'View conversions', 'View redemptions and commission ledger'),
  ('sales.manage_agents_kyc', 'Manage agents and KYC', 'Create agent profiles, KYC and documents')
on conflict (key) do nothing;

insert into public.backoffice_page_keys (key, label, route_path)
values
  ('dashboard', 'Dashboard', '/'),
  ('customers_waitlists', 'Customers Waitlists', '/customers/waitlists'),
  ('customers_tenants', 'Customers Tenants', '/customers/tenants'),
  ('customers_ops_monitor', 'Customers Ops Monitor', '/customers/ops-monitor'),
  ('plans', 'Plans', '/plans'),
  ('sales_campaigns', 'Sales Campaigns', '/sales/campaigns'),
  ('sales_capture_client', 'Sales Capture Client', '/sales/capture-client'),
  ('sales_agents', 'Sales Agents', '/sales/agents'),
  ('sales_conversions', 'Sales Conversions', '/sales/conversions'),
  ('audit_logs', 'Audit Logs', '/audit-logs'),
  ('impersonation', 'Impersonation', '/impersonation'),
  ('settings', 'Settings', '/settings')
on conflict (key) do nothing;

-- Remove broad policy that made sales_promo.create a global read/write bypass.
do $$
declare
  t text;
begin
  foreach t in array array[
    'sales_agents',
    'sales_agent_kyc',
    'sales_agent_documents',
    'sales_promo_campaigns',
    'sales_promo_codes',
    'sales_promo_redemptions',
    'annual_lockin_offers',
    'annual_lockin_events',
    'sales_commission_ledger',
    'sales_targets'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'Backoffice can manage ' || t, t);
  end loop;
end $$;

-- Capture client permissions.
drop policy if exists "Sales capture can read campaigns" on public.sales_promo_campaigns;
create policy "Sales capture can read campaigns"
  on public.sales_promo_campaigns
  for select
  to authenticated
  using (
    has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role)
    or backoffice_user_has_permission(auth.uid(), 'sales.capture_client')
  );

drop policy if exists "Sales capture can manage campaigns" on public.sales_promo_campaigns;
create policy "Sales capture can manage campaigns"
  on public.sales_promo_campaigns
  for all
  to authenticated
  using (
    has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role)
    or backoffice_user_has_permission(auth.uid(), 'sales.manage_campaigns')
  )
  with check (
    has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role)
    or backoffice_user_has_permission(auth.uid(), 'sales.manage_campaigns')
  );

drop policy if exists "Sales capture can read promo codes" on public.sales_promo_codes;
create policy "Sales capture can read promo codes"
  on public.sales_promo_codes
  for select
  to authenticated
  using (
    has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role)
    or backoffice_user_has_permission(auth.uid(), 'sales.capture_client')
  );

drop policy if exists "Sales capture can manage promo codes" on public.sales_promo_codes;
create policy "Sales capture can manage promo codes"
  on public.sales_promo_codes
  for all
  to authenticated
  using (
    has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role)
    or backoffice_user_has_permission(auth.uid(), 'sales.capture_client')
  )
  with check (
    has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role)
    or backoffice_user_has_permission(auth.uid(), 'sales.capture_client')
  );

-- Agents + KYC manager permissions.
drop policy if exists "Sales managers can read agents" on public.sales_agents;
create policy "Sales managers can read agents"
  on public.sales_agents
  for select
  to authenticated
  using (
    has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role)
    or backoffice_user_has_permission(auth.uid(), 'sales.manage_agents_kyc')
    or backoffice_user_has_permission(auth.uid(), 'sales.capture_client')
  );

drop policy if exists "Sales managers can manage agents" on public.sales_agents;
create policy "Sales managers can manage agents"
  on public.sales_agents
  for all
  to authenticated
  using (
    has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role)
    or backoffice_user_has_permission(auth.uid(), 'sales.manage_agents_kyc')
  )
  with check (
    has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role)
    or backoffice_user_has_permission(auth.uid(), 'sales.manage_agents_kyc')
  );

drop policy if exists "Sales managers can manage kyc rows" on public.sales_agent_kyc;
create policy "Sales managers can manage kyc rows"
  on public.sales_agent_kyc
  for all
  to authenticated
  using (
    has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role)
    or backoffice_user_has_permission(auth.uid(), 'sales.manage_agents_kyc')
  )
  with check (
    has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role)
    or backoffice_user_has_permission(auth.uid(), 'sales.manage_agents_kyc')
  );

drop policy if exists "Sales managers can manage kyc documents" on public.sales_agent_documents;
create policy "Sales managers can manage kyc documents"
  on public.sales_agent_documents
  for all
  to authenticated
  using (
    has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role)
    or backoffice_user_has_permission(auth.uid(), 'sales.manage_agents_kyc')
  )
  with check (
    has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role)
    or backoffice_user_has_permission(auth.uid(), 'sales.manage_agents_kyc')
  );

drop policy if exists "Sales managers can manage targets" on public.sales_targets;
create policy "Sales managers can manage targets"
  on public.sales_targets
  for all
  to authenticated
  using (
    has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role)
    or backoffice_user_has_permission(auth.uid(), 'sales.manage_agents_kyc')
  )
  with check (
    has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role)
    or backoffice_user_has_permission(auth.uid(), 'sales.manage_agents_kyc')
  );

-- Conversions visibility.
drop policy if exists "Sales conversions can read redemptions" on public.sales_promo_redemptions;
create policy "Sales conversions can read redemptions"
  on public.sales_promo_redemptions
  for select
  to authenticated
  using (
    has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role)
    or backoffice_user_has_permission(auth.uid(), 'sales.view_conversions')
  );

drop policy if exists "Sales conversions can read commission ledger" on public.sales_commission_ledger;
create policy "Sales conversions can read commission ledger"
  on public.sales_commission_ledger
  for select
  to authenticated
  using (
    has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role)
    or backoffice_user_has_permission(auth.uid(), 'sales.view_conversions')
  );

drop policy if exists "Super admins can manage redemptions" on public.sales_promo_redemptions;
create policy "Super admins can manage redemptions"
  on public.sales_promo_redemptions
  for all
  to authenticated
  using (has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role))
  with check (has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role));

drop policy if exists "Super admins can manage commission ledger" on public.sales_commission_ledger;
create policy "Super admins can manage commission ledger"
  on public.sales_commission_ledger
  for all
  to authenticated
  using (has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role))
  with check (has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role));

drop policy if exists "Super admins can manage annual lockin offers" on public.annual_lockin_offers;
create policy "Super admins can manage annual lockin offers"
  on public.annual_lockin_offers
  for all
  to authenticated
  using (has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role))
  with check (has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role));

drop policy if exists "Super admins can manage annual lockin events" on public.annual_lockin_events;
create policy "Super admins can manage annual lockin events"
  on public.annual_lockin_events
  for all
  to authenticated
  using (has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role))
  with check (has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role));
