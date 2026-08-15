-- sms_credit_pricing is read directly by the salon-admin frontend
-- (useCreditPurchase.tsx) to show real bundle tiers, but platform_settings
-- read access was restricted to backoffice users or a fixed allowlist of
-- keys that never included this one — so the fetch silently returned
-- nothing under RLS and the purchase dialog rendered an empty bundle list.
drop policy if exists "Authenticated users can read public platform settings" on public.platform_settings;

create policy "Authenticated users can read public platform settings"
  on public.platform_settings
  for select
  to authenticated
  using (key = any (array['kill_switch', 'maintenance_banner', 'promo_trial_bonus', 'sms_credit_pricing']));
