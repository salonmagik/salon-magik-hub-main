-- Remove legacy role-template keys that are no longer part of MVP access control.

-- Drop legacy page key for removed Sales Agents page.
delete from public.backoffice_role_template_pages
where page_key = 'sales_agents';

delete from public.backoffice_page_keys
where key = 'sales_agents';

-- Drop legacy template-management permission from non-system templates.
delete from public.backoffice_role_template_permissions
where permission_key in ('admins.manage_templates', 'sales_agents.manage');

delete from public.backoffice_permission_keys
where key in ('admins.manage_templates', 'sales_agents.manage');

-- Ensure active Sales Ops and Customers keys exist.
insert into public.backoffice_page_keys (key, label, route_path)
values
  ('customers_waitlists', 'Customers Waitlists', '/customers/waitlists'),
  ('customers_tenants', 'Customers Tenants', '/customers/tenants'),
  ('customers_ops_monitor', 'Customers Ops Monitor', '/customers/ops-monitor'),
  ('sales_campaigns', 'Sales Campaigns', '/sales/campaigns'),
  ('sales_capture_client', 'Sales Capture Client', '/sales/capture-client'),
  ('sales_conversions', 'Sales Conversions', '/sales/conversions')
on conflict (key) do nothing;

insert into public.backoffice_permission_keys (key, label, description)
values
  ('customers.view_waitlists', 'View customer waitlists', 'Access waitlist applications and market interest'),
  ('customers.view_tenants', 'View tenants', 'Access tenants and unlock requests'),
  ('customers.view_ops_monitor', 'View ops monitor', 'Access setup/import/reactivation monitoring'),
  ('sales.capture_client', 'Capture clients', 'Generate promo codes and manage campaigns'),
  ('sales.manage_campaigns', 'Manage campaigns', 'Create and manage sales campaigns'),
  ('sales.view_conversions', 'View conversions', 'View redemptions and commission ledger'),
  ('sales.manage_agents_kyc', 'Manage agents and KYC', 'Create agent profiles, KYC and documents')
on conflict (key) do nothing;
