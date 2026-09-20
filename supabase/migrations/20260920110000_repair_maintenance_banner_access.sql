-- Keep maintenance notices readable by authenticated salon-admin and client
-- portal users even when an older environment missed the original policy
-- repair migration. The backoffice remains the only writer.

insert into public.platform_settings (key, value, description)
values (
  'maintenance_banner',
  '{"enabled":false,"mode":"immediate","platforms":[],"scheduled_at":null,"title":"Scheduled Maintenance","description":"","guidance":""}'::jsonb,
  'Configurable maintenance banner shown on salon-admin and/or client-portal'
)
on conflict (key) do nothing;

drop policy if exists "Authenticated users can read public platform settings"
  on public.platform_settings;

create policy "Authenticated users can read public platform settings"
  on public.platform_settings
  for select
  to authenticated
  using (key = any (array[
    'kill_switch',
    'maintenance_banner',
    'promo_trial_bonus',
    'sms_credit_pricing'
  ]));

do $$
begin
  if not exists (
    select 1
    from pg_policies
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

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'platform_settings'
  ) then
    alter publication supabase_realtime add table public.platform_settings;
  end if;
end
$$;
