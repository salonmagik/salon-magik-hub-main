-- Public, customer-facing add-on catalogue.
-- Backoffice owns the copy and lifecycle state; marketing only reads the
-- published rows. Prices continue to come from the dedicated pricing tables.
insert into public.platform_settings (key, value, description)
values (
  'marketing_addons',
  jsonb_build_object(
    'addons', jsonb_build_array(
      jsonb_build_object('key', 'extra_communication_credits', 'name', 'Extra communication credits', 'description', 'Top up SMS credits when your complimentary monthly allowance runs low.', 'status', 'available'),
      jsonb_build_object('key', 'staff_operations', 'name', 'Staff Operations', 'description', 'Track when your staff arrive, time off, and leave requests.', 'status', 'available'),
      jsonb_build_object('key', 'ecommerce_themes', 'name', 'E-commerce themes', 'description', 'Give your booking page a polished storefront-style look with a paid theme.', 'status', 'available'),
      jsonb_build_object('key', 'whatsapp_messaging', 'name', 'WhatsApp messaging', 'description', 'Send booking confirmations, reminders, and updates directly via WhatsApp.', 'status', 'coming_soon'),
      jsonb_build_object('key', 'custom_booking_domain', 'name', 'Custom booking domain', 'description', 'Use your own domain for your client-facing booking page.', 'status', 'coming_soon')
    )
  ),
  'Customer-facing add-on names, descriptions, and availability shown on the marketing pricing page.'
)
on conflict (key) do nothing;

drop policy if exists "Anon can read marketing addons" on public.platform_settings;
create policy "Anon can read marketing addons"
  on public.platform_settings
  for select
  to anon
  using (key = 'marketing_addons');

drop policy if exists "Authenticated users can read public platform settings" on public.platform_settings;
create policy "Authenticated users can read public platform settings"
  on public.platform_settings
  for select
  to authenticated
  using (key = any (array[
    'kill_switch',
    'maintenance_banner',
    'promo_trial_bonus',
    'sms_credit_pricing',
    'marketing_addons'
  ]));

-- Add-on prices are intentionally public: they are displayed on the public
-- pricing page. Only active rows are exposed to anonymous visitors.
drop policy if exists "Anon can read active staff addon pricing" on public.staff_addon_pricing;
create policy "Anon can read active staff addon pricing"
  on public.staff_addon_pricing
  for select
  to anon
  using (status = 'active' and effective_from <= now());

drop policy if exists "Anon can read active staff operations pricing" on public.staff_operations_addon_pricing;
create policy "Anon can read active staff operations pricing"
  on public.staff_operations_addon_pricing
  for select
  to anon
  using (status = 'active' and effective_from <= now());

drop policy if exists "Anon can read active theme addon pricing" on public.theme_addon_pricing;
create policy "Anon can read active theme addon pricing"
  on public.theme_addon_pricing
  for select
  to anon
  using (status = 'active' and effective_from <= now());
