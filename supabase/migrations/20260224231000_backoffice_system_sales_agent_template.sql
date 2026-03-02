-- System template to remove manual permission confusion for sales-agent access.

do $$
declare
  v_template_id uuid;
begin
  insert into public.backoffice_role_templates (name, description, is_system, is_active)
  values (
    'Sales Agent',
    'System template: capture client and view own conversions only.',
    true,
    true
  )
  on conflict (name) do update
    set description = excluded.description,
        is_system = true,
        is_active = true
  returning id into v_template_id;

  delete from public.backoffice_role_template_pages where template_id = v_template_id;
  delete from public.backoffice_role_template_permissions where template_id = v_template_id;

  insert into public.backoffice_role_template_pages (template_id, page_key)
  values
    (v_template_id, 'sales_capture_client'),
    (v_template_id, 'sales_conversions')
  on conflict (template_id, page_key) do nothing;

  insert into public.backoffice_role_template_permissions (template_id, permission_key)
  values
    (v_template_id, 'sales.capture_client'),
    (v_template_id, 'sales.view_conversions')
  on conflict (template_id, permission_key) do nothing;
end $$;

