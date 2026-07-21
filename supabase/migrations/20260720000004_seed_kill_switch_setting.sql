-- Ensure the kill_switch platform_settings row always exists.
-- The row was seeded in an earlier migration but may be missing in some environments.
insert into public.platform_settings (key, value, description)
values (
  'kill_switch',
  '{"enabled": false, "reason": null, "enabled_at": null, "enabled_by": null}'::jsonb,
  'Platform-wide read-only mode toggle (Super Admin only)'
)
on conflict (key) do nothing;
