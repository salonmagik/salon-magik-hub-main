-- Allow super_admins to INSERT into platform_settings (required for upsert).
-- The existing UPDATE policy already allows super_admins to update rows;
-- this INSERT policy completes the upsert permission set.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'platform_settings'
      and policyname = 'Super admins can insert platform settings'
  ) then
    create policy "Super admins can insert platform settings"
      on public.platform_settings
      for insert
      to authenticated
      with check (public.has_backoffice_role(auth.uid(), 'super_admin'));
  end if;
end
$$;

-- Allow any authenticated user (salon-admin, client-portal, etc.) to read the
-- kill_switch key so the BannerContext can show the platform maintenance banner.
-- All other keys remain restricted to backoffice users.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'platform_settings'
      and policyname = 'Authenticated users can read kill switch setting'
  ) then
    create policy "Authenticated users can read kill switch setting"
      on public.platform_settings
      for select
      to authenticated
      using (key = 'kill_switch');
  end if;
end
$$;

-- Add platform_settings to the Supabase realtime publication so BannerContext
-- in salon-admin receives live kill_switch updates without a page reload.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'platform_settings'
  ) then
    alter publication supabase_realtime add table public.platform_settings;
  end if;
end
$$;

-- Seed default_trial_days if missing (was inserted in an earlier migration that
-- may not have run in all environments).
insert into public.platform_settings (key, value, description)
values (
  'default_trial_days',
  '{"days": 14}'::jsonb,
  'Global default trial period in days'
)
on conflict (key) do nothing;
