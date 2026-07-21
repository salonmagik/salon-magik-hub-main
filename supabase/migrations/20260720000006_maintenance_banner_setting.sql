-- Seed the maintenance_banner key in platform_settings.
-- Value shape:
--   enabled:      boolean — whether the banner is active
--   mode:         "immediate" | "scheduled"
--   platforms:    array of "salon_admin" | "client_portal"
--   scheduled_at: ISO datetime string | null (used when mode = "scheduled")
--   title:        string
--   description:  string
--   guidance:     string
insert into public.platform_settings (key, value, description)
values (
  'maintenance_banner',
  '{"enabled":false,"mode":"immediate","platforms":[],"scheduled_at":null,"title":"Scheduled Maintenance","description":"","guidance":""}'::jsonb,
  'Configurable maintenance banner shown on salon-admin and/or client-portal'
)
on conflict (key) do nothing;

-- Extend the SELECT policy so authenticated users in salon-admin / client-portal
-- can also read the maintenance_banner key (same rationale as kill_switch).
-- We drop and recreate the policy to change the using() clause cleanly.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'platform_settings'
      and policyname = 'Authenticated users can read kill switch setting'
  ) then
    drop policy "Authenticated users can read kill switch setting"
      on public.platform_settings;
  end if;

  create policy "Authenticated users can read public platform settings"
    on public.platform_settings
    for select
    to authenticated
    using (key in ('kill_switch', 'maintenance_banner'));
end
$$;
