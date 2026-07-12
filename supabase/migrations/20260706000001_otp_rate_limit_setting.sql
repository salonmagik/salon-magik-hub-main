-- Seed the otp_rate_limit platform setting.
-- The edge function auth-check-otp-rate-limit reads this at runtime.
-- Set enabled=false to bypass rate limiting entirely (useful during testing).
insert into public.platform_settings (key, value, description)
values (
  'otp_rate_limit',
  '{"enabled": true, "max_per_hour": 3, "cooldown_seconds": 60}'::jsonb,
  'OTP rate limiting. Set enabled=false to bypass limits for testing. max_per_hour and cooldown_seconds are used when enabled.'
)
on conflict (key) do nothing;
