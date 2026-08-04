-- promo_trial_bonus was never added to the "public" platform_settings
-- read whitelist, so every non-backoffice (salon-admin/client-portal)
-- query for it was silently filtered to zero rows by RLS — not an error,
-- just an empty result. usePromoTrialBonusConfig then fell back to its
-- hardcoded defaults (enabled=true, window_days=7, bonus_days=7) no
-- matter what Backoffice actually saved, which is why the eligibility
-- window, bonus days, and the enable/disable toggle all appeared to have
-- no effect on the salon-admin banner.
drop policy if exists "Authenticated users can read public platform settings" on public.platform_settings;

create policy "Authenticated users can read public platform settings"
on public.platform_settings
for select
to authenticated
using (key = any (array['kill_switch', 'maintenance_banner', 'promo_trial_bonus']));
