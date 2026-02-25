-- Seed stable default role templates per environment.
-- Ensures Team Members and template picker are never empty.

do $$
declare
  v_admin_template_id uuid;
  v_support_template_id uuid;
begin
  insert into public.backoffice_role_templates (name, description, is_system, is_active)
  values ('Admin Default', 'Default admin access template', false, true)
  on conflict (name) do update set is_active = true
  returning id into v_admin_template_id;

  insert into public.backoffice_role_templates (name, description, is_system, is_active)
  values ('Support Agent Default', 'Default support agent access template', false, true)
  on conflict (name) do update set is_active = true
  returning id into v_support_template_id;

  delete from public.backoffice_role_template_permissions where template_id in (v_admin_template_id, v_support_template_id);
  delete from public.backoffice_role_template_pages where template_id in (v_admin_template_id, v_support_template_id);

  insert into public.backoffice_role_template_pages (template_id, page_key)
  values
    (v_admin_template_id, 'dashboard'),
    (v_admin_template_id, 'customers_waitlists'),
    (v_admin_template_id, 'customers_tenants'),
    (v_admin_template_id, 'customers_ops_monitor'),
    (v_admin_template_id, 'feature_flags'),
    (v_admin_template_id, 'plans'),
    (v_admin_template_id, 'sales_campaigns'),
    (v_admin_template_id, 'sales_capture_client'),
    (v_admin_template_id, 'sales_conversions'),
    (v_admin_template_id, 'admins'),
    (v_admin_template_id, 'audit_logs'),
    (v_admin_template_id, 'settings'),
    (v_support_template_id, 'customers_waitlists'),
    (v_support_template_id, 'customers_tenants'),
    (v_support_template_id, 'customers_ops_monitor'),
    (v_support_template_id, 'sales_capture_client'),
    (v_support_template_id, 'sales_conversions')
  on conflict (template_id, page_key) do nothing;

  insert into public.backoffice_role_template_permissions (template_id, permission_key)
  values
    (v_admin_template_id, 'customers.view_waitlists'),
    (v_admin_template_id, 'customers.view_tenants'),
    (v_admin_template_id, 'customers.view_ops_monitor'),
    (v_admin_template_id, 'plans.view'),
    (v_admin_template_id, 'settings.view'),
    (v_admin_template_id, 'audit_logs.view'),
    (v_admin_template_id, 'sales.manage_campaigns'),
    (v_admin_template_id, 'sales.capture_client'),
    (v_admin_template_id, 'sales.view_conversions'),
    (v_admin_template_id, 'sales.manage_agents_kyc'),
    (v_support_template_id, 'customers.view_waitlists'),
    (v_support_template_id, 'customers.view_tenants'),
    (v_support_template_id, 'customers.view_ops_monitor'),
    (v_support_template_id, 'sales.capture_client'),
    (v_support_template_id, 'sales.view_conversions')
  on conflict (template_id, permission_key) do nothing;
end $$;
